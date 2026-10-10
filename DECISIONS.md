# VIKMO DealerDesk - Decisions & Architecture

## Django Track Questions

**1. Where exactly is overselling prevented? Cite the code, and explain what would happen without it when two confirms arrive together.**
Overselling is prevented in `core/services.py:confirm_order()` using `transaction.atomic()` and `Inventory.objects.select_for_update().filter(product__sku__in=skus).order_by('product__sku')`. 
Without row-level locks, if two simultaneous requests try to buy 5 units of a product that only has 5 left, both threads could read `quantity=5`, successfully pass validation, and deduct 5, leaving the database at `0` but reserving 10 units in reality (overselling). The `select_for_update` forces concurrent confirms to queue sequentially. The `order_by` prevents deadlocks when multiple orders lock the same SKUs in different orders.

**2. How do you calculate and round GST? What would go wrong with floats, or with Decimal's default rounding?**
GST is calculated in `core/services.py:calculate_draft_order_totals()` using Python's `decimal.Decimal` and `.quantize(Decimal('0.01'), rounding=decimal.ROUND_HALF_UP)`. 
Using `floats` causes binary floating-point imprecision (e.g., `1.1 + 2.2 = 3.3000000000000003`), meaning totals drift by a paisa on multi-line orders, failing strict accounting audits. `Decimal`'s default rounding is `ROUND_HALF_EVEN` (banker's rounding), which rounds `0.005` down to `0.00`. Indian commercial and GST compliance standardizes on `ROUND_HALF_UP` (0.005 rounds to 0.01).

**3. How do you guarantee unique order numbers and idempotent order creation when duplicate requests arrive at the same moment?**
- **Order Numbers**: In `core/services.py:get_next_daily_sequence()`. We use a dedicated `DailySequence` table locked via `select_for_update()` inside a transaction to monotonically increment a daily counter safely.
- **Idempotency**: In `core/views.py:OrderViewSet.create()`. We attempt `IdempotencyRecord.objects.create()` first. PostgreSQL's unique constraint on the key blocks or raises `IntegrityError` for simultaneous duplicates. The losing threads catch the error, open a transaction, and block on `select_for_update().get()` until the winning thread finishes processing the order and commits the final HTTP response status.

**4. Explain your schema: each model, its relationships, and the on_delete choice for every foreign key, with your reasons.**
In `core/models.py`:
- `Product`: Core catalogue item (SKU is primary key/unique).
- `Inventory`: 1-to-1 with Product, isolating high-throughput stock updates from static catalogue reads. `on_delete=models.CASCADE` (stock is meaningless if the product ceases to exist).
- `Dealer`: The buyer.
- `Order`: Linked to Dealer. `on_delete=models.PROTECT` (financial records must be preserved; we cannot delete a dealer with historical orders).
- `OrderItem`: Linked to Order (`CASCADE` - order lines die with the draft order) and Product (`PROTECT` - if a product was ordered historically, it cannot be deleted from the catalogue).

**5. Where are status transitions enforced, and how do you guarantee a cancel restores stock exactly once?**
Transitions are hardcoded into specific service functions (`confirm_order`, `dispatch_order`, `deliver_order`, `cancel_order`) in `core/services.py`, invoked via DRF `@action` endpoints. 
In `cancel_order`, we check `if order.status == 'CONFIRMED':` before restoring stock. Because the entire block (stock restoration + `order.status = 'CANCELLED'`) is wrapped in `transaction.atomic()` and locks the inventory rows, duplicate requests immediately see `order.status == 'CANCELLED'` and fail with a `409 INVALID_TRANSITION` without touching stock a second time.

**6. How does your supplier sync handle rate limits, failures and duplicates? How do you guarantee it changes nothing when the feed can't be fully fetched?**
In `core/supplier.py:fetch_supplier_pages()`. 
- **Rate limits (429)**: Sleeps for the exact seconds specified in the `Retry-After` header.
- **Failures (5xx)**: Sleeps using a short backoff. Each page request is capped at 5 attempts. 
- **Duplicates**: Resolved in-memory by caching items in a dictionary by `sku`, replacing the entry only if a newer `updated_at` (compared via ISO8601 strings) is found.
- **Guarantee**: Network fetching (`fetch_supplier_pages`) completes entirely in memory *before* the `transaction.atomic()` block starts. If retries are exhausted, it raises a `502` Exception early, meaning zero database writes occur.

**7. How does the sync decide between created, updated and unchanged, and why does a second run change nothing?**
In `core/supplier.py:sync_supplier_catalogue()`. 
It fetches existing products using `sku__in`, maps them, and compares the DB fields (`name`, `price`, `description`, etc.) to the feed payload precisely. If *any* field differs, it marks it as `changed = True` and calls `.save()`. If all fields are identical, it increments the `unchanged` counter. Since a first run perfectly aligns the database with the feed, a second run evaluates all conditionals as false, generating zero writes and confirming idempotency.

**8. What is the weakest part of your submission, and what would you do with two more days?**
The weakest part is the synchronous execution of `POST /api/sync/supplier/`. It holds the HTTP request open for potentially 100+ seconds while fetching the feed, which is vulnerable to reverse-proxy timeouts (e.g., Nginx 60s default).
With two more days, I would:
1. Offload the sync task to a Celery worker backed by Redis.
2. Return a `202 ACCEPTED` with a `task_id` for polling, or implement WebSockets to notify the frontend of progress.
3. Add a dedicated `SupplierSyncHistory` model to audit historical sync times, success rates, and catalogue diffs.
