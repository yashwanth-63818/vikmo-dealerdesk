from unittest.mock import patch, MagicMock
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status
from decimal import Decimal
from .models import Product, Inventory
import requests

class SupplierSyncTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.p1 = Product.objects.create(sku='P1', name='Old P1', price=Decimal('10.00'))
        self.inv1 = Inventory.objects.create(product=self.p1, quantity=100)

    @patch('core.supplier.requests.get')
    def test_successful_multi_page_sync(self, mock_get):
        resp1 = MagicMock()
        resp1.status_code = 200
        resp1.json.return_value = {
            "items": [
                {"sku": "P1", "name": "New P1", "price": "15.00", "updated_at": "2026-10-09T00:00:00Z"},
                {"sku": "P2", "name": "New P2", "price": "20.00", "updated_at": "2026-10-09T00:00:00Z"}
            ],
            "next_cursor": "page2"
        }
        
        resp2 = MagicMock()
        resp2.status_code = 200
        resp2.json.return_value = {
            "items": [
                {"sku": "P3", "name": "New P3", "price": "30.00", "updated_at": "2026-10-09T00:00:00Z"}
            ],
            "next_cursor": None
        }
        
        mock_get.side_effect = [resp1, resp2]
        
        response = self.client.post('/api/sync/supplier/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        data = response.data
        self.assertEqual(data['updated'], 1)
        self.assertEqual(data['created'], 2)
        self.assertEqual(data['pages_fetched'], 2)
        
        self.p1.refresh_from_db()
        self.assertEqual(self.p1.name, "New P1")
        self.assertEqual(self.p1.price, Decimal("15.00"))
        
        p2 = Product.objects.get(sku="P2")
        self.assertEqual(p2.inventory.quantity, 0)
        
        self.inv1.refresh_from_db()
        self.assertEqual(self.inv1.quantity, 100)

    @patch('core.supplier.requests.get')
    @patch('core.supplier.time.sleep')
    def test_retry_after_429_and_500(self, mock_sleep, mock_get):
        resp_429 = MagicMock()
        resp_429.status_code = 429
        resp_429.headers = {'Retry-After': '2'}
        
        resp_500 = MagicMock()
        resp_500.status_code = 500
        
        resp_ok = MagicMock()
        resp_ok.status_code = 200
        resp_ok.json.return_value = {"items": [], "next_cursor": None}
        
        mock_get.side_effect = [resp_429, resp_500, resp_ok]
        
        response = self.client.post('/api/sync/supplier/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(mock_get.call_count, 3)
        mock_sleep.assert_any_call(2)

    @patch('core.supplier.requests.get')
    @patch('core.supplier.time.sleep')
    def test_exhausted_retries_and_rollback(self, mock_sleep, mock_get):
        resp_500 = MagicMock()
        resp_500.status_code = 500
        mock_get.side_effect = [resp_500] * 5
        
        response = self.client.post('/api/sync/supplier/')
        self.assertEqual(response.status_code, status.HTTP_502_BAD_GATEWAY)
        self.assertEqual(mock_get.call_count, 5)

    @patch('core.supplier.requests.get')
    def test_invalid_items_skipped(self, mock_get):
        resp = MagicMock()
        resp.status_code = 200
        resp.json.return_value = {
            "items": [
                {"supplier_sku": "S1", "sku": "", "price": "10.00"},
                {"supplier_sku": "S2", "sku": "P2", "price": "-5.00"},
                {"supplier_sku": "S3", "sku": "P3", "price": "10.123"},
                {"supplier_sku": "S4", "sku": "P4", "price": "10.00"}
            ],
            "next_cursor": None
        }
        mock_get.return_value = resp
        
        response = self.client.post('/api/sync/supplier/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['created'], 1)
        self.assertEqual(len(response.data['rejected']), 3)

    @patch('core.supplier.requests.get')
    def test_duplicate_skus_uses_latest(self, mock_get):
        resp = MagicMock()
        resp.status_code = 200
        resp.json.return_value = {
            "items": [
                {"sku": "P2", "name": "Old", "price": "10.00", "updated_at": "2026-10-09T00:00:00Z"},
                {"sku": "P2", "name": "New", "price": "20.00", "updated_at": "2026-10-10T00:00:00Z"},
                {"sku": "P2", "name": "Older", "price": "5.00", "updated_at": "2026-10-08T00:00:00Z"}
            ],
            "next_cursor": None
        }
        mock_get.return_value = resp
        
        response = self.client.post('/api/sync/supplier/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['created'], 1)
        
        p = Product.objects.get(sku="P2")
        self.assertEqual(p.name, "New")
        self.assertEqual(p.price, Decimal("20.00"))

    @patch('core.supplier.requests.get')
    def test_idempotent_sync(self, mock_get):
        resp = MagicMock()
        resp.status_code = 200
        resp.json.return_value = {
            "items": [
                {"sku": "P1", "name": "Old P1", "price": "10.00"}
            ],
            "next_cursor": None
        }
        mock_get.return_value = resp
        
        response = self.client.post('/api/sync/supplier/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['updated'], 0)
        self.assertEqual(response.data['unchanged'], 1)

    @patch('core.supplier.requests.get')
    @patch('core.supplier.time.sleep')
    def test_supplier_outage_later_page_no_changes(self, mock_sleep, mock_get):
        resp1 = MagicMock()
        resp1.status_code = 200
        resp1.json.return_value = {
            "items": [{"sku": "P2", "name": "New", "price": "10.00"}],
            "next_cursor": "page2"
        }
        
        resp2 = MagicMock()
        resp2.status_code = 500
        
        mock_get.side_effect = [resp1] + [resp2] * 5
        
        response = self.client.post('/api/sync/supplier/')
        self.assertEqual(response.status_code, status.HTTP_502_BAD_GATEWAY)
        self.assertFalse(Product.objects.filter(sku="P2").exists())

    @patch('core.supplier.requests.get')
    @patch('core.models.Product.objects.bulk_create')
    def test_database_rollback_if_applying_updates_fails(self, mock_bulk_create, mock_get):
        resp = MagicMock()
        resp.status_code = 200
        resp.json.return_value = {
            "items": [{"sku": "P2", "name": "New", "price": "10.00"}],
            "next_cursor": None
        }
        mock_get.return_value = resp
        
        mock_bulk_create.side_effect = Exception("DB error")
        
        with self.assertRaises(Exception):
            self.client.post('/api/sync/supplier/')
            
        self.assertFalse(Product.objects.filter(sku="P2").exists())
