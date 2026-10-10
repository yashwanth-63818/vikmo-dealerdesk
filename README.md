# VIKMO DealerDesk Backend

**Track**: Django

This is the completed Python/Django backend for the VIKMO DealerDesk application. It implements a highly reliable, concurrent, and idempotent dealer ordering system along with an integrated supplier catalogue synchronization engine. 

## Features

- **Models**: `Product`, `Inventory`, `Dealer`, `Order`, `OrderItem`, `DailySequence`, and `IdempotencyRecord`. The schema cleanly separates catalog data from volatile stock to prevent locking contention.
- **REST API**: Implemented via Django REST Framework, strictly following the `API_CONTRACT.md`. Includes filtering, pagination, and robust error handling matching exact contract status codes and JSON shapes.
- **Order Lifecycle**: Transitions from `DRAFT` -> `CONFIRMED` -> `DISPATCHED` -> `DELIVERED`, with a `CANCELLED` path. 
- **Stock Safety & Concurrency**: PostgreSQL row-level locking (`select_for_update()`) ensures that simultaneous order confirmations never result in deadlocks or overselling stock.
- **GST Calculations**: Uses `decimal.Decimal` and `ROUND_HALF_UP` on all item totals, strictly enforcing precise 18% GST rules to avoid floating-point drift.
- **Idempotency**: Guarantees exactly-once processing for order creations via `IdempotencyRecord`, returning identical responses to duplicate simultaneous requests.
- **Supplier Synchronization**: Consumes a paginated mock supplier API. Employs exponential backoff, robust retry logic for `429` and `5xx` errors (max 5 attempts), completely avoids database writes on fetch failure (using atomic transactions), and safely dedupes items by evaluating the `updated_at` timestamp.

## Environment Variables

Copy `.env.example` to `.env` in the repository root and configure the following variables:

- `DATABASE_URL`: Your PostgreSQL connection string. (Example: `postgres://postgres:password@localhost:5432/dealerdesk`). Note: Ensure `#` is encoded as `%23`.
- `SUPPLIER_API_URL`: The base URL of the supplier feed mock (default: `http://127.0.0.1:8099`).
- `SUPPLIER_API_KEY`: The API key to access the supplier feed (default: `dev-supplier-key`).

*Note: Do not commit `.env` or any real credentials to version control.*

## Setup Instructions (Windows)

1. **Install PostgreSQL** and create an empty database named `dealerdesk`.
2. **Configure Environment**: Create `.env` from `.env.example` and set your `DATABASE_URL`.
3. **Install Dependencies**:
```powershell
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```
4. **Database Setup**:
```powershell
python manage.py makemigrations
python manage.py migrate
python manage.py seed_data
```

## Running the Server

Start the Django development server:
```powershell
python manage.py runserver 0.0.0.0:8000
```
Test the health endpoint: `curl http://localhost:8000/api/health/`

## Testing & Validation

### Automated Tests
Run the comprehensive test suite to validate concurrency, transactions, supplier synchronization, and api endpoints:
```powershell
python manage.py test core
```

### Official Smoke Test
Before final submission, ensure you run the official smoke test on a freshly seeded database.
```powershell
python smoke_test.py --base-url http://localhost:8000 --track django
```

## DECISIONS.md
All architectural answers regarding locks, decimals, schema decisions, idempotency and supplier synchronization handling are detailed in `DECISIONS.md`.
