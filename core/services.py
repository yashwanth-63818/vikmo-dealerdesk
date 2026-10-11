import decimal
from django.utils import timezone
from django.db import transaction
from .models import Order, OrderItem, Product, Dealer, DailySequence, IdempotencyRecord, Inventory
from .exceptions import CustomAPIException
from rest_framework import status
import json
import hashlib

def calculate_tax(subtotal):
    """Calculates 18% GST and rounds half up to 2 decimal places."""
    tax = subtotal * decimal.Decimal('0.18')
    return tax.quantize(decimal.Decimal('0.01'), rounding=decimal.ROUND_HALF_UP)

def generate_order_number():
    """Generates ORD-YYYYMMDD-NNNN string atomically."""
    # Use timezone.localtime to get IST date
    today = timezone.localtime().date()

    with transaction.atomic():
        seq, created = DailySequence.objects.select_for_update().get_or_create(date=today)
        seq.last_value += 1
        seq.save()

        date_str = today.strftime('%Y%m%d')
        return f"ORD-{date_str}-{seq.last_value:04d}"

def calculate_draft_order_totals(order_data, dealer=None):
    """Calculates order items and totals from order input using current prices."""
    if dealer is None:
        dealer_id = order_data.get('dealer_id')
        if not dealer_id:
            raise CustomAPIException('VALIDATION_ERROR', 'Dealer not specified', status.HTTP_400_BAD_REQUEST)
        try:
            dealer = Dealer.objects.get(id=dealer_id)
        except Dealer.DoesNotExist:
            raise CustomAPIException('VALIDATION_ERROR', 'Dealer not found', status.HTTP_400_BAD_REQUEST)

    items = order_data['items']
    skus = [item['sku'] for item in items]
    products = Product.objects.filter(sku__in=skus)
    product_map = {p.sku: p for p in products}

    if len(product_map) != len(skus):
        missing = set(skus) - set(product_map.keys())
        raise CustomAPIException('VALIDATION_ERROR', f'Products not found: {", ".join(missing)}', status.HTTP_400_BAD_REQUEST)

    order_subtotal = decimal.Decimal('0.00')
    order_tax = decimal.Decimal('0.00')
    order_grand = decimal.Decimal('0.00')

    calculated_items = []

    for item in items:
        product = product_map[item['sku']]
        quantity = decimal.Decimal(item['quantity'])
        unit_price = product.price

        line_subtotal = (unit_price * quantity).quantize(decimal.Decimal('0.01'), rounding=decimal.ROUND_HALF_UP)
        line_tax = calculate_tax(line_subtotal)
        line_total = line_subtotal + line_tax

        calculated_items.append({
            'product': product,
            'quantity': item['quantity'],
            'unit_price': unit_price,
            'line_subtotal': line_subtotal,
            'line_tax': line_tax,
            'line_total': line_total
        })

        order_subtotal += line_subtotal
        order_tax += line_tax
        order_grand += line_total

    return {
        'dealer': dealer,
        'calculated_items': calculated_items,
        'subtotal': order_subtotal,
        'tax_total': order_tax,
        'grand_total': order_grand
    }

def create_draft_order(order_data):
    """Creates a draft order given validated input data."""
    calculated = calculate_draft_order_totals(order_data)

    with transaction.atomic():
        order_number = generate_order_number()
        order = Order.objects.create(
            order_number=order_number,
            dealer=calculated['dealer'],
            status='DRAFT',
            subtotal=calculated['subtotal'],
            tax_total=calculated['tax_total'],
            grand_total=calculated['grand_total']
        )

        for item in calculated['calculated_items']:
            OrderItem.objects.create(
                order=order,
                product=item['product'],
                quantity=item['quantity'],
                unit_price=item['unit_price'],
                line_subtotal=item['line_subtotal'],
                line_tax=item['line_tax'],
                line_total=item['line_total']
            )

    return order

def update_draft_order(order, order_data):
    """Updates an existing draft order with new items."""
    with transaction.atomic():
        order = Order.objects.select_for_update().get(pk=order.pk)
        if order.status != 'DRAFT':
            raise CustomAPIException('ORDER_LOCKED', 'Editing an order that is not DRAFT is not allowed', status.HTTP_409_CONFLICT)

        dealer = order.dealer
        if 'dealer_id' in order_data and order_data['dealer_id']:
            try:
                dealer = Dealer.objects.get(id=order_data['dealer_id'])
            except Dealer.DoesNotExist:
                raise CustomAPIException('VALIDATION_ERROR', 'Dealer not found', status.HTTP_400_BAD_REQUEST)

        calculated = calculate_draft_order_totals(order_data, dealer=dealer)

        order.dealer = calculated['dealer']
        order.subtotal = calculated['subtotal']
        order.tax_total = calculated['tax_total']
        order.grand_total = calculated['grand_total']
        order.save()

        order.items.all().delete()

        for item in calculated['calculated_items']:
            OrderItem.objects.create(
                order=order,
                product=item['product'],
                quantity=item['quantity'],
                unit_price=item['unit_price'],
                line_subtotal=item['line_subtotal'],
                line_tax=item['line_tax'],
                line_total=item['line_total']
            )

    return order

def refresh_draft_order_prices(order):
    """Refreshes item prices to current catalogue prices if order is in DRAFT status."""
    if order.status != 'DRAFT':
        return order
    items = list(order.items.all().select_related('product'))
    changed = False
    order_subtotal = decimal.Decimal('0.00')
    order_tax = decimal.Decimal('0.00')
    order_grand = decimal.Decimal('0.00')
    for item in items:
        if item.unit_price != item.product.price:
            item.unit_price = item.product.price
            item.line_subtotal = (item.unit_price * decimal.Decimal(item.quantity)).quantize(decimal.Decimal('0.01'), rounding=decimal.ROUND_HALF_UP)
            item.line_tax = calculate_tax(item.line_subtotal)
            item.line_total = item.line_subtotal + item.line_tax
            item.save()
            changed = True
        order_subtotal += item.line_subtotal
        order_tax += item.line_tax
        order_grand += item.line_total
    if changed or order.subtotal != order_subtotal or order.tax_total != order_tax or order.grand_total != order_grand:
        order.subtotal = order_subtotal
        order.tax_total = order_tax
        order.grand_total = order_grand
        order.save()
    return order

def confirm_order(order):
    with transaction.atomic():
        order = Order.objects.select_for_update().get(pk=order.pk)
        if order.status != 'DRAFT':
            raise CustomAPIException('INVALID_TRANSITION', 'Order cannot be confirmed from its current state', status.HTTP_409_CONFLICT)

        items = list(order.items.all().select_related('product'))
        if not items:
            raise CustomAPIException('VALIDATION_ERROR', 'Cannot confirm an empty order', status.HTTP_400_BAD_REQUEST)

        # Lock the prices from current catalogue prices for all lines
        order_subtotal = decimal.Decimal('0.00')
        order_tax = decimal.Decimal('0.00')
        order_grand = decimal.Decimal('0.00')
        for item in items:
            unit_price = item.product.price
            item.unit_price = unit_price
            item.line_subtotal = (unit_price * decimal.Decimal(item.quantity)).quantize(decimal.Decimal('0.01'), rounding=decimal.ROUND_HALF_UP)
            item.line_tax = calculate_tax(item.line_subtotal)
            item.line_total = item.line_subtotal + item.line_tax
            item.save()
            order_subtotal += item.line_subtotal
            order_tax += item.line_tax
            order_grand += item.line_total

        order.subtotal = order_subtotal
        order.tax_total = order_tax
        order.grand_total = order_grand

        skus = sorted([item.product.sku for item in items])
        inventories = list(Inventory.objects.select_for_update().filter(product__sku__in=skus).order_by('product__sku'))
        inv_map = {inv.product.sku: inv for inv in inventories}

        short_lines = []
        for item in items:
            inv = inv_map.get(item.product.sku)
            if not inv or inv.quantity < item.quantity:
                available = inv.quantity if inv else 0
                short_lines.append({
                    "sku": item.product.sku,
                    "requested": item.quantity,
                    "available": available,
                    "name": item.product.name
                })

        if short_lines:
            details = [
                {"sku": sl["sku"], "requested": sl["requested"], "available": sl["available"]}
                for sl in short_lines
            ]
            msg = " ".join([f"Insufficient stock for {sl['name']}. Available: {sl['available']}, Requested: {sl['requested']}." for sl in short_lines])
            raise CustomAPIException('INSUFFICIENT_STOCK', msg, status.HTTP_409_CONFLICT, details)

        for item in items:
            inv = inv_map[item.product.sku]
            inv.quantity -= item.quantity
            inv.save()

        order.status = 'CONFIRMED'
        order.save()

    return order

def dispatch_order(order):
    with transaction.atomic():
        order = Order.objects.select_for_update().get(pk=order.pk)
        if order.status != 'CONFIRMED':
            raise CustomAPIException('INVALID_TRANSITION', 'Only confirmed orders can be dispatched', status.HTTP_409_CONFLICT)
        order.status = 'DISPATCHED'
        order.save(update_fields=['status'])
    return order

def deliver_order(order):
    with transaction.atomic():
        order = Order.objects.select_for_update().get(pk=order.pk)
        if order.status != 'DISPATCHED':
            raise CustomAPIException('INVALID_TRANSITION', 'Only dispatched orders can be delivered', status.HTTP_409_CONFLICT)
        order.status = 'DELIVERED'
        order.save(update_fields=['status'])
    return order

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
