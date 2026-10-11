import time
from datetime import datetime, timezone
import requests
from decimal import Decimal, InvalidOperation
from django.conf import settings
from django.db import transaction
from rest_framework import status
from .models import Product, Inventory
from .exceptions import CustomAPIException

def parse_iso(dt_str):
    if not dt_str or not isinstance(dt_str, str):
        return datetime.min.replace(tzinfo=timezone.utc)
    try:
        return datetime.fromisoformat(dt_str.replace('Z', '+00:00'))
    except Exception:
        return datetime.min.replace(tzinfo=timezone.utc)

def validate_item(item):
    sku = item.get('sku')
    if not sku or not isinstance(sku, str) or not sku.strip():
        return False, "invalid sku"

    price_str = item.get('price')
    try:
        price = Decimal(str(price_str))
        if price <= 0:
            return False, "invalid price"
        if price.as_tuple().exponent < -2:
            return False, "invalid price"
    except (InvalidOperation, ValueError, TypeError):
        return False, "invalid price"

    return True, ""

def fetch_supplier_pages():
    url = getattr(settings, 'SUPPLIER_API_URL', 'http://127.0.0.1:8099').rstrip('/')
    api_key = getattr(settings, 'SUPPLIER_API_KEY', '')

    headers = {'X-Api-Key': api_key}
    cursor = None
    items = []
    pages_fetched = 0
    requests_made = 0

    while True:
        page_url = f"{url}/v1/products?limit=20"
        if cursor:
            page_url += f"&cursor={cursor}"

        attempts = 0
        success = False

        while attempts < 5:
            attempts += 1
            requests_made += 1

            try:
                response = requests.get(page_url, headers=headers, timeout=10)

                if response.status_code == 200:
                    data = response.json()
                    items.extend(data.get('items', []))
                    cursor = data.get('next_cursor')
                    pages_fetched += 1
                    success = True
                    break

                elif response.status_code == 429:
                    retry_after = int(response.headers.get('Retry-After', 1))
                    time.sleep(retry_after)

                elif response.status_code in [500, 502, 503, 504]:
                    time.sleep(0.5)

                elif response.status_code == 401:
                    raise CustomAPIException('SUPPLIER_UNAVAILABLE', 'Supplier API key rejected', status.HTTP_502_BAD_GATEWAY)
                else:
                    time.sleep(0.5)

            except requests.RequestException:
                time.sleep(0.5)

        if not success:
            raise CustomAPIException('SUPPLIER_UNAVAILABLE', 'Supplier unavailable', status.HTTP_502_BAD_GATEWAY)

        if not cursor:
            break

    return items, pages_fetched, requests_made

def sync_supplier_catalogue():
    items, pages_fetched, requests_made = fetch_supplier_pages()

    rejected = []
    valid_items = {}

    for item in items:
        supplier_sku = item.get('supplier_sku')
        is_valid, reason = validate_item(item)
        if not is_valid:
            rejected.append({"supplier_sku": supplier_sku, "reason": reason})
            continue

        sku = item['sku']
        current_dt = parse_iso(item.get('updated_at'))

        if sku in valid_items:
            existing_dt = parse_iso(valid_items[sku].get('updated_at'))
            if current_dt > existing_dt:
                valid_items[sku] = item
        else:
            valid_items[sku] = item

    created_count = 0
    updated_count = 0
    unchanged_count = 0

    with transaction.atomic():
        skus = list(valid_items.keys())
        existing_products = Product.objects.select_for_update().filter(sku__in=skus)
        product_map = {p.sku: p for p in existing_products}

        products_to_create = []

        for sku, item in valid_items.items():
            price = Decimal(str(item['price']))
            name = item.get('name', '') or ''
            category = item.get('category', '') or ''
            brand = item.get('brand', '') or ''
            vehicle_fitment = item.get('vehicle_fitment', '') or ''
            description = item.get('description', '') or ''

            if sku not in product_map:
                new_product = Product(
                    sku=sku,
                    name=name,
                    category=category,
                    brand=brand,
                    vehicle_fitment=vehicle_fitment,
                    description=description,
                    price=price
                )
                products_to_create.append(new_product)
                created_count += 1
            else:
                p = product_map[sku]
                changed = False

                if p.name != name:
                    p.name = name
                    changed = True
                if p.category != category:
                    p.category = category
                    changed = True
                if p.brand != brand:
                    p.brand = brand
                    changed = True
                if p.vehicle_fitment != vehicle_fitment:
                    p.vehicle_fitment = vehicle_fitment
                    changed = True
                if p.description != description:
                    p.description = description
                    changed = True
                if p.price != price:
                    p.price = price
                    changed = True

                if changed:
                    p.save()
                    updated_count += 1
                else:
                    unchanged_count += 1

        if products_to_create:
            Product.objects.bulk_create(products_to_create)
            created_products = Product.objects.filter(sku__in=[p.sku for p in products_to_create])
            inventories_to_create = [Inventory(product=p, quantity=0) for p in created_products]
            if inventories_to_create:
                Inventory.objects.bulk_create(inventories_to_create)

    return {
        "created": created_count,
        "updated": updated_count,
        "unchanged": unchanged_count,
        "rejected": rejected,
        "pages_fetched": pages_fetched,
        "requests_made": requests_made
    }
