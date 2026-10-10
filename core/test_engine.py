import concurrent.futures
from decimal import Decimal
from django.test import TransactionTestCase
from rest_framework.test import APIClient
from rest_framework import status
from .models import Product, Inventory, Dealer, Order, OrderItem, DailySequence, IdempotencyRecord
from .services import create_draft_order, confirm_order
import json

class OrderEngineTests(TransactionTestCase):
    def setUp(self):
        self.client = APIClient()
        self.dealer = Dealer.objects.create(dealer_code="D1", name="Dealer 1")
        
        self.product1 = Product.objects.create(sku="P1", name="Product 1", price=Decimal("100.00"))
        self.inv1 = Inventory.objects.create(product=self.product1, quantity=10)
        
        self.product2 = Product.objects.create(sku="P2", name="Product 2", price=Decimal("200.00"))
        self.inv2 = Inventory.objects.create(product=self.product2, quantity=5)

    def test_successful_confirmation(self):
        order = create_draft_order({'dealer_id': self.dealer.id, 'items': [{'sku': 'P1', 'quantity': 2}]})
        response = self.client.post(f'/api/orders/{order.order_number}/confirm/')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'CONFIRMED')
        
        self.inv1.refresh_from_db()
        self.assertEqual(self.inv1.quantity, 8) # 10 - 2

    def test_insufficient_stock_no_partial_deduction(self):
        order = create_draft_order({
            'dealer_id': self.dealer.id, 
            'items': [{'sku': 'P1', 'quantity': 2}, {'sku': 'P2', 'quantity': 10}]
        })
        
        response = self.client.post(f'/api/orders/{order.order_number}/confirm/')
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data['error']['code'], 'INSUFFICIENT_STOCK')
        
        # Verify no partial deduction
        self.inv1.refresh_from_db()
        self.inv2.refresh_from_db()
        self.assertEqual(self.inv1.quantity, 10)
        self.assertEqual(self.inv2.quantity, 5)

    def test_concurrent_confirmation(self):
        # Two orders trying to buy 6 items of P1. Only 10 exist. Only one should succeed.
        order1 = create_draft_order({'dealer_id': self.dealer.id, 'items': [{'sku': 'P1', 'quantity': 6}]})
        order2 = create_draft_order({'dealer_id': self.dealer.id, 'items': [{'sku': 'P1', 'quantity': 6}]})
        
        def confirm(order_num):
            from django.db import connection
            try:
                client = APIClient()
                return client.post(f'/api/orders/{order_num}/confirm/')
            finally:
                connection.close()
            
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            future1 = executor.submit(confirm, order1.order_number)
            future2 = executor.submit(confirm, order2.order_number)
            
            res1 = future1.result()
            res2 = future2.result()
            
        statuses = [res1.status_code, res2.status_code]
        self.assertIn(status.HTTP_200_OK, statuses)
        self.assertIn(status.HTTP_409_CONFLICT, statuses)
        
        self.inv1.refresh_from_db()
        self.assertEqual(self.inv1.quantity, 4)

    def test_cancel_draft_no_stock_change(self):
        order = create_draft_order({'dealer_id': self.dealer.id, 'items': [{'sku': 'P1', 'quantity': 2}]})
        response = self.client.post(f'/api/orders/{order.order_number}/cancel/')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'CANCELLED')
        
        self.inv1.refresh_from_db()
        self.assertEqual(self.inv1.quantity, 10)

    def test_cancel_confirmed_restores_stock(self):
        order = create_draft_order({'dealer_id': self.dealer.id, 'items': [{'sku': 'P1', 'quantity': 2}]})
        self.client.post(f'/api/orders/{order.order_number}/confirm/')
        
        self.inv1.refresh_from_db()
        self.assertEqual(self.inv1.quantity, 8)
        
        response = self.client.post(f'/api/orders/{order.order_number}/cancel/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'CANCELLED')
        
        self.inv1.refresh_from_db()
        self.assertEqual(self.inv1.quantity, 10)

    def test_invalid_transitions(self):
        order = create_draft_order({'dealer_id': self.dealer.id, 'items': [{'sku': 'P1', 'quantity': 2}]})
        
        # DRAFT -> DISPATCHED is invalid
        response = self.client.post(f'/api/orders/{order.order_number}/dispatch/')
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        
        # Confirm it
        self.client.post(f'/api/orders/{order.order_number}/confirm/')
        
        # CONFIRMED -> DELIVERED is invalid
        response = self.client.post(f'/api/orders/{order.order_number}/deliver/')
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)

    def test_concurrent_idempotent_creation(self):
        payload = {'dealer_id': self.dealer.id, 'items': [{'sku': 'P1', 'quantity': 1}]}
        
        def create_order():
            from django.db import connection
            try:
                client = APIClient()
                return client.post('/api/orders/', data=payload, format='json', HTTP_IDEMPOTENCY_KEY='idem-123')
            finally:
                connection.close()
            
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
            futures = [executor.submit(create_order) for _ in range(3)]
            results = [f.result() for f in futures]
            
        # All should return 201 because of idempotency, but only 1 order should actually exist
        self.assertEqual(results[0].status_code, status.HTTP_201_CREATED)
        self.assertEqual(results[1].status_code, status.HTTP_201_CREATED)
        self.assertEqual(results[2].status_code, status.HTTP_201_CREATED)
        
        self.assertEqual(Order.objects.count(), 1)
