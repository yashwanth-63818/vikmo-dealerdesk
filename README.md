# VIKMO DealerDesk Backend

**Track**: `django`
**Role**: Python / Django Intern
**Repository**: [https://github.com/yashwanth-63818/vikmo-dealerdesk](https://github.com/yashwanth-63818/vikmo-dealerdesk)
**Video Walkthrough**: `https://youtu.be/placeholder-demo` *(see note below)*

DealerDesk is an ordering backend, inventory engine, and supplier catalogue synchronization platform for two-wheeler parts distributors across South India, built with Django and Django REST Framework on PostgreSQL.

---

## 1. Architecture & Design Highlights

- **Track Scope**: Focuses strictly on the required Django track components:
  - **Part A1 — Backend Core**: Products catalogue, inventory management, dealers, and draft orders.
  - **Part A2 — Order Engine**: Strict order lifecycle (`DRAFT` → `CONFIRMED` → `DISPATCHED` → `DELIVERED` / `CANCELLED`), concurrency-safe stock reservation using PostgreSQL row-level locks, exact 18% GST calculation with `ROUND_HALF_UP`, Indian timezone (`Asia/Kolkata`) daily order sequences (`ORD-YYYYMMDD-NNNN`), and atomic request idempotency.
  - **Part B — Supplier Sync**: Robust integration with upstream supplier API handling pagination, HTTP 429 `Retry-After` rate limits, transient 5xx retries (up to 5 attempts per page), duplicate SKU resolution using latest `updated_at`, zero local stock modification, and transactional all-or-nothing guarantees (returns `502 SUPPLIER_UNAVAILABLE` without partial database writes).
- **Relational Separation**: Separates `Product` (catalogue details) and `Inventory` (stock levels) into separate models to minimize row-level lock contention on catalogue reads during concurrent order confirms.
- **Strict Error Shapes**: All API errors adhere to the contract schema `{"error": {"code": "...", "message": "...", "details": [...]}}`.

---

## 2. Prerequisites

- **Python**: 3.11 or newer (Python 3.14 compatible)
- **Database**: PostgreSQL (local PostgreSQL instance or cloud PostgreSQL such as Neon / Supabase)
- **Operating System**: Windows or Linux

---

## 3. Environment Configuration

Copy `.env.example` to `.env` in the repository root:

```bash
cp .env.example .env
```

*(On Windows PowerShell: `Copy-Item .env.example .env`)*

Configure your environment variables in `.env`:

```env
DATABASE_URL=postgres://postgres:YOUR_PASSWORD@localhost:5432/dealerdesk
SUPPLIER_API_URL=http://127.0.0.1:8099
SUPPLIER_API_KEY=dev-supplier-key
DJANGO_SECRET_KEY=dev-insecure-secret-key
```

> **Security Note**: Never commit `.env` to Git. `.env` is explicitly listed in `.gitignore` and only `.env.example` with placeholders is committed.

---

## 4. Setup Instructions

### On Windows (PowerShell)

1. **Create and activate virtual environment**:
   ```powershell
   python -m venv .venv
   .\.venv\Scripts\activate
   ```

2. **Install dependencies**:
   ```powershell
   pip install -r requirements.txt
   ```

3. **Run database migrations**:
   ```powershell
   python manage.py migrate --noinput
   ```

4. **Seed database** (run twice to verify idempotent seeding):
   ```powershell
   python manage.py seed_data
   python manage.py seed_data
   ```

### On Linux / macOS

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate --noinput
python manage.py seed_data
python manage.py seed_data
```

---

## 5. Running the Application

### 1. Start the Supplier Mock API (Terminal 1)
```powershell
python supplier_mock/mock_supplier.py
```
*(Runs on `http://127.0.0.1:8099` with `SUPPLIER_API_KEY=dev-supplier-key`)*

### 2. Start the Django Server (Terminal 2)
```powershell
python manage.py runserver 0.0.0.0:8000 --noreload
```

Verify system health:
```bash
curl http://localhost:8000/api/health/
# Returns: {"status": "ok"}
```

---

## 6. Testing & Verification

### Run Django Test Suite
Executes unit and integration tests covering concurrency locks, GST precision, idempotency records, state transitions, and supplier retry/failure behavior:
```powershell
python manage.py test
```

### Run the Official Smoke Test
On a freshly seeded database with the server running on port 8000 and the supplier mock running on port 8099:
```powershell
python smoke_test.py --base-url http://localhost:8000 --track django
```
Expected output:
```text
DealerDesk smoke test against http://localhost:8000  (parts: core, engine, sync)

Core
  [PASS] GET /api/health/
  [PASS] GET /api/products/ (pagination, fields, 600 seeded)
  [PASS] GET /api/products/{sku}/ and 404 error shape
  [PASS] Dealers: list (25 seeded) and create
  [PASS] PUT /api/inventory/{sku}/
  [PASS] POST /api/orders/ creates a DRAFT (shape, money format)
  [PASS] Validation error shape (empty items)

Order engine
  [PASS] Confirm, cancel and an invalid transition

Supplier sync  (start supplier_mock/mock_supplier.py and point SUPPLIER_API_URL at it)
  [PASS] POST /api/sync/supplier/ (response shape only)

9/9 checks passed.
```

---

## 7. API Endpoints Summary

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health/` | Health check (`{"status": "ok"}`). |
| `GET` | `/api/products/` | Paginated product list (filters: `search`, `category`, `vehicle`). |
| `POST` | `/api/products/` | Create product (starts with stock 0; duplicate SKU → `409 DUPLICATE`). |
| `GET` | `/api/products/{sku}/` | Product detail with current stock. |
| `PATCH`| `/api/products/{sku}/` | Partial update (price, description, etc.). |
| `PUT` | `/api/inventory/{sku}/` | Update available stock count (`{"quantity": N, "reason": "..."}`). |
| `GET` | `/api/dealers/` | Paginated dealers list. |
| `POST` | `/api/dealers/` | Create dealer (duplicate `dealer_code` → `409 DUPLICATE`). |
| `GET` | `/api/dealers/{id}/` | Dealer detail. |
| `POST` | `/api/orders/` | Create DRAFT order. Supports `Idempotency-Key` header. |
| `GET` | `/api/orders/` | Paginated order list (filters: `dealer_id`, `status`). |
| `GET` | `/api/orders/{order_number}/` | Order details with calculated tax and items. |
| `PUT` | `/api/orders/{order_number}/` | Replace items on a DRAFT order (`409 ORDER_LOCKED` if not DRAFT). |
| `POST` | `/api/orders/{order_number}/confirm/` | DRAFT → CONFIRMED. Atomically reserves stock. |
| `POST` | `/api/orders/{order_number}/dispatch/` | CONFIRMED → DISPATCHED. |
| `POST` | `/api/orders/{order_number}/deliver/` | DISPATCHED → DELIVERED. |
| `POST` | `/api/orders/{order_number}/cancel/` | DRAFT/CONFIRMED → CANCELLED. Restores stock once. |
| `POST` | `/api/sync/supplier/` | Sync supplier catalogue feed into local database. |

---

## 8. Critical Business Rules & Invariants

1. **Stock Protection**:
   - DRAFT order creation does not touch inventory.
   - Confirming an order acquires PostgreSQL row-level locks (`select_for_update()`) on all items in sorted order, checking available stock all-or-nothing.
   - Cancelling a CONFIRMED order acquires the order row lock and restores reserved stock exactly once. Concurrent cancel attempts return `409 INVALID_TRANSITION` without double-restoring stock.
2. **GST & Precision**:
   - Fixed 18% GST calculated per line using Python `decimal.Decimal` and quantized with `ROUND_HALF_UP` to the exact paisa (`0.01`).
3. **Price Locking**:
   - DRAFT orders follow live catalogue prices (`unit_price = product.price`).
   - Order confirmation locks `unit_price`, `line_subtotal`, and `line_tax` permanently.
4. **Order Numbers & Idempotency**:
   - Daily sequence counter in `Asia/Kolkata` time zone monotonically incremented using a locked `DailySequence` table.
   - Repeated requests with the same `Idempotency-Key` and body return the original response without duplicating records. Reusing a key with a different body returns `409 IDEMPOTENCY_CONFLICT`.
5. **Supplier Sync**:
   - Handles pagination via `next_cursor` until null.
   - Respects 429 `Retry-After` headers and retries transient 5xx errors up to 5 attempts per page.
   - Fails all-or-nothing: if any page fails after 5 retries, zero database changes occur and `502 SUPPLIER_UNAVAILABLE` is returned.
   - Invalid records (missing SKU or bad price) are reported in `rejected` list without failing the sync.
   - Duplicates resolved in-memory using latest `updated_at`.
   - Local stock is never overwritten by supplier warehouse quantities.

---

## 9. DECISIONS.md

Refer to [`DECISIONS.md`](file:///c:/Yash/Projects/DealerDesk/DECISIONS.md) for detailed explanations of all eight design questions with exact file and line references.
