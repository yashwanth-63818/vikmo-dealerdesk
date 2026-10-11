# VIKMO DealerDesk — Decisions & Architecture

## Django Track Questions

**1. Where exactly is overselling prevented? Cite the code, and explain what would happen without it when two confirms arrive together.**

Overselling is prevented in `core/services.py:176-237` within `confirm_order()`, specifically:
- `core/services.py:177`: The entire confirmation workflow runs inside an explicit database transaction: `with transaction.atomic():`.
- `core/services.py:178`: The order itself is locked: `order = Order.objects.select_for_update().get(pk=order.pk)`.
- `core/services.py:205-207`: All required inventory rows are locked in sorted SKU order:
  ```python
  skus = sorted([item.product.sku for item in items])
  inventories = list(Inventory.objects.select_for_update().filter(product__sku__in=skus).order_by('product__sku'))
  ```
- `core/services.py:209-228`: Every order item's quantity is checked against the locked row's available stock. If any line is short, no changes are committed and a `409 INSUFFICIENT_STOCK` is raised.
- `core/services.py:229-234`: Stock is deducted: `inv.quantity -= item.quantity` and `inv.save()`.

**What would happen without it:**
Without `select_for_update()`, two concurrent requests trying to confirm orders for the last 5 units of a SKU would both read `quantity = 5` in their respective `READ COMMITTED` transactions before either commits. Both threads would pass the `inv.quantity < item.quantity` check, both would deduct 5, and the final committed inventory quantity would be 0 (or negative) while promising 10 units to dealers—overselling by 5 units. With `select_for_update()`, PostgreSQL blocks the second transaction at row acquisition. When the first transaction commits, the second transaction re-reads the updated row (`quantity = 0`), detects insufficient stock, and immediately rejects the confirmation with `409 INSUFFICIENT_STOCK`. The deterministic `sorted()` and `.order_by('product__sku')` prevents deadlock when concurrent orders contain overlapping SKUs in different orders.

---

**2. How do you calculate and round GST? What would go wrong with floats, or with Decimal's default rounding?**

GST is calculated per line in `core/services.py:10-13` and applied in `core/services.py:59-61` and `core/services.py:193-195`:
```python
def calculate_tax(subtotal):
    """Calculates 18% GST and rounds half up to 2 decimal places."""
    tax = subtotal * decimal.Decimal('0.18')
    return tax.quantize(decimal.Decimal('0.01'), rounding=decimal.ROUND_HALF_UP)
```
- Line subtotal is `(unit_price * quantity).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)`
- Line tax is `line_subtotal * Decimal('0.18')` quantized with `ROUND_HALF_UP`
- Line total is `line_subtotal + line_tax`
- Order totals are the exact sum of line components: `subtotal = Σ line_subtotal`, `tax_total = Σ line_tax`, `grand_total = subtotal + tax_total`.

**What would go wrong with floats:**
Binary floating-point types (`float`) cannot exactly represent base-10 fractional numbers (for example, `0.1 + 0.2 != 0.3` due to binary IEEE 754 representation). Over multi-item invoices, small representation inaccuracies accumulate and drift totals by 1 or more paise, causing invoice discrepancies that violate Indian GST tax audits.

**What would go wrong with Decimal's default rounding:**
Python's `Decimal` default rounding mode is `ROUND_HALF_EVEN` (banker's rounding). In `ROUND_HALF_EVEN`, half-way cases round to the nearest even integer (for instance, `12.525` rounds to `12.52`, but `12.535` rounds to `12.54`). Indian statutory GST compliance and commercial accounting rules mandate `ROUND_HALF_UP` (arithmetic rounding), where any fractional `.005` strictly rounds up to `.01`. Using default banker's rounding would undercharge tax on odd cents and produce incorrect tax invoices.

---

**3. How do you guarantee unique order numbers and idempotent order creation when duplicate requests arrive at the same moment?**

**Unique Order Numbers (`ORD-YYYYMMDD-NNNN`):**
In `core/services.py:15-26` within `generate_order_number()`:
- The date is obtained in India time zone: `today = timezone.localtime().date()`.
- A dedicated `DailySequence` model (`core/models.py:76-79`) stores `date` (primary key) and `last_value`.
- Inside `with transaction.atomic():`, row-level locking guarantees single-threaded counter increments:
  ```python
  seq, created = DailySequence.objects.select_for_update().get_or_create(date=today)
  seq.last_value += 1
  seq.save()
  ```
  Even under high concurrency across parallel worker threads, PostgreSQL's row lock forces transactions to increment the daily sequence sequentially, preventing duplicate order numbers.

**Idempotent Order Creation:**
In `core/views.py:104-142` within `OrderViewSet.create()`:
- When an `Idempotency-Key` header is present, we compute the SHA-256 hash of the normalized request JSON body (`core/views.py:107`).
- We attempt an insert into `IdempotencyRecord` (`core/models.py:81-88`) with `response_status=0`:
  ```python
  try:
      IdempotencyRecord.objects.create(key=idem_key, request_hash=request_hash, response_status=0, response_body={})
  except IntegrityError:
      pass
  ```
  PostgreSQL's unique constraint on `key` allows exactly one thread to insert. Duplicate threads catch `IntegrityError`.
- Next, inside `with transaction.atomic():`, both threads acquire the row lock:
  `record = IdempotencyRecord.objects.select_for_update().get(key=idem_key)`.
- If `record.request_hash != request_hash` (`core/views.py:124`), we raise `409 IDEMPOTENCY_CONFLICT`.
- The winning thread creates the order, updates `record.response_status = 201`, `record.response_body = output`, and commits atomically.
- The losing thread, unblocked after the first commit, observes `record.response_status == 201` (`core/views.py:127`) and returns the cached response without creating a second order.

---

**4. Explain your schema: each model, its relationships, and the on_delete choice for every foreign key, with your reasons.**

Located in `core/models.py:5-88`:
1. `Product` (`core/models.py:5-17`):
   - Catalogue entity with `sku` as primary key string (`max_length=50`).
   - Stores `name`, `category`, `brand`, `vehicle_fitment`, `price` (DecimalField), `description`, and timestamps.
2. `Inventory` (`core/models.py:19-25`):
   - 1-to-1 relationship with `Product`: `product = models.OneToOneField(Product, on_delete=models.CASCADE, related_name='inventory')`.
   - `on_delete=CASCADE`: Stock only exists in the context of an existing product; deleting a product removes its stock record. Isolating stock in a separate table avoids table contention on `Product` during frequent stock locking.
3. `Dealer` (`core/models.py:27-38`):
   - Dealer purchasing entity with unique `dealer_code`, `name`, `city`, `phone`, `email`, `gstin`, and `credit_limit`.
4. `Order` (`core/models.py:40-61`):
   - Order entity with unique `order_number`, `status` (`DRAFT`, `CONFIRMED`, `DISPATCHED`, `DELIVERED`, `CANCELLED`), financial summary totals (`subtotal`, `tax_total`, `grand_total`), and timestamps.
   - Foreign key: `dealer = models.ForeignKey(Dealer, on_delete=models.PROTECT, related_name='orders')`.
   - `on_delete=PROTECT`: Financial and legal compliance mandates preserving completed customer orders. Deleting a dealer that has associated orders is blocked to preserve accounting history.
5. `OrderItem` (`core/models.py:63-74`):
   - Line items for an order, storing `quantity`, `unit_price`, `line_subtotal`, `line_tax`, and `line_total`.
   - Foreign key: `order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='items')`.
   - `on_delete=CASCADE`: Line items belong strictly to their parent order; deleting an order cascades to its items.
   - Foreign key: `product = models.ForeignKey(Product, on_delete=models.PROTECT)`.
   - `on_delete=PROTECT`: If a product was ordered historically, it cannot be deleted from the database, preventing broken audit trails.
6. `DailySequence` (`core/models.py:76-79`):
   - Primary key `date` with `last_value` integer counter.
7. `IdempotencyRecord` (`core/models.py:81-88`):
   - Unique `key`, `request_hash`, `response_status`, and `response_body` (JSONField).

---

**5. Where are status transitions enforced, and how do you guarantee a cancel restores stock exactly once?**

**Where status transitions are enforced:**
Status transitions are strictly enforced in `core/services.py` inside dedicated transition functions, triggered by REST actions in `core/views.py:161-183`:
- `confirm_order` (`core/services.py:176-180`): Checks `order.status == 'DRAFT'`, else raises `409 INVALID_TRANSITION`.
- `dispatch_order` (`core/services.py:239-246`): Checks `order.status == 'CONFIRMED'`, else raises `409 INVALID_TRANSITION`.
- `deliver_order` (`core/services.py:248-255`): Checks `order.status == 'DISPATCHED'`, else raises `409 INVALID_TRANSITION`.
- `cancel_order` (`core/services.py:257-279`): Checks `order.status in ['DRAFT', 'CONFIRMED']`, else raises `409 INVALID_TRANSITION`.
- Order editing via `update_draft_order` (`core/services.py:114-117`): Checks `order.status == 'DRAFT'`, else raises `409 ORDER_LOCKED`.

**How cancel guarantees restoring stock exactly once:**
In `core/services.py:257-279`:
```python
def cancel_order(order):
    with transaction.atomic():
        order = Order.objects.select_for_update().get(pk=order.pk)
        if order.status not in ['DRAFT', 'CONFIRMED']:
            raise CustomAPIException('INVALID_TRANSITION', 'Order cannot be cancelled from its current state', status.HTTP_409_CONFLICT)

        if order.status == 'CONFIRMED':
            items = list(order.items.all().select_related('product'))
            skus = sorted([item.product.sku for item in items])
            inventories = list(Inventory.objects.select_for_update().filter(product__sku__in=skus).order_by('product__sku'))
            inv_map = {inv.product.sku: inv for inv in inventories}

            for item in items:
                inv = inv_map.get(item.product.sku)
                if inv:
                    inv.quantity += item.quantity
                    inv.save()

        order.status = 'CANCELLED'
        order.save(update_fields=['status'])
    return order
```
Row-level locking (`select_for_update()`) on `Order` is acquired at the start of the transaction. If two simultaneous cancel requests arrive for a `CONFIRMED` order, the first transaction acquires the lock, restores stock, sets `order.status = 'CANCELLED'`, and commits. The second transaction unblocks, re-reads `order.status == 'CANCELLED'`, fails the `order.status not in ['DRAFT', 'CONFIRMED']` check, and raises `409 INVALID_TRANSITION` without executing the restoration block.

---

**6. How does your supplier sync handle rate limits, failures and duplicates? How do you guarantee it changes nothing when the feed can't be fully fetched?**

In `core/supplier.py`:
- **Rate limits (429)** (`core/supplier.py:69-71`): Extracts the `Retry-After` header value (`int(response.headers.get('Retry-After', 1))`) and sleeps for that duration before retrying the same page.
- **Failures (5xx & network)** (`core/supplier.py:73-75`): Catches 500, 502, 503, 504 and `requests.RequestException`, backs off with `time.sleep(0.5)`, and retries up to 5 attempts per page (`core/supplier.py:54`).
- **Rejected Key (401)** (`core/supplier.py:76-77`): Immediately raises `CustomAPIException('SUPPLIER_UNAVAILABLE', ..., status=502)`.
- **Duplicates** (`core/supplier.py:97-114`): Resolves duplicates across pages in memory using a dictionary keyed by `sku`. Compares ISO timestamps via `parse_iso(item.get('updated_at'))`, retaining the record with the latest timestamp.
- **Guarantee of zero partial changes** (`core/supplier.py:84-86` & `core/supplier.py:119`): All network fetching via `fetch_supplier_pages()` completes into memory *prior* to starting database operations. If any page fails after 5 retries, the function raises `502 SUPPLIER_UNAVAILABLE` before `transaction.atomic()` is ever entered, guaranteeing zero database writes.

---

**7. How does the sync decide between created, updated and unchanged, and why does a second run change nothing?**

In `core/supplier.py:119-174`:
- Queries existing products for all valid feed SKUs: `Product.objects.select_for_update().filter(sku__in=skus)` (`core/supplier.py:121`).
- For each valid item:
  - If `sku not in product_map` (`core/supplier.py:134`): Queued into `products_to_create`, created with `stock = 0` via `bulk_create`, and increments `created_count`. Local inventory is never modified with supplier warehouse quantities (`core/supplier.py:178`).
  - If `sku in product_map`: Compares feed values against existing fields (`name`, `category`, `brand`, `vehicle_fitment`, `description`, `price`). If any field has changed (`core/supplier.py:150-168`), updates the fields, saves, and increments `updated_count`.
  - If all 6 fields match identically, it increments `unchanged_count` (`core/supplier.py:172-173`).
- **Why a second run changes nothing:**
  Because the first run synchronizes the database with all catalogue fields in the feed, a second execution finds all SKUs in `product_map` and all attributes identical. Every SKU follows the `else: unchanged_count += 1` branch, yielding `created: 0, updated: 0, unchanged: N`, performing zero database writes.

---

**8. What is the weakest part of your submission, and what would you do with two more days?**

The weakest part of the current implementation is that `POST /api/sync/supplier/` executes synchronously within the HTTP request-response cycle. When the supplier feed spans dozens of pages with rate-limiting pauses and 5xx retries, the HTTP request can remain open for 30–60+ seconds. In production environments, reverse proxies (such as Nginx, AWS ALB, or Cloudflare) typically terminate connections with gateway timeouts (e.g., 60-second timeouts).

**With two more days, I would:**
1. **Background Job Queue**: Offload supplier synchronization to an asynchronous Celery worker backed by Redis. The endpoint `POST /api/sync/supplier/` would return `202 Accepted` with a `task_id`.
2. **Status and Polling API**: Provide `GET /api/sync/supplier/status/{task_id}/` for clients to track synchronization progress, page counts, and summary metrics.
3. **Audit History Table**: Add a `SupplierSyncLog` database model capturing start time, end time, duration, page count, request count, items created/updated/unchanged/rejected, and error logs for auditing.
4. **Circuit Breaker**: Implement an automated circuit breaker on supplier feed calls to stop cascading timeouts when the upstream supplier API enters an extended outage.
