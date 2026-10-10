from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status
from decimal import Decimal
from .models import Product, Inventory, Dealer, Order, OrderItem

class CoreAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.product1 = Product.objects.create(
            sku="BRK-1044", name="Brake Pad Set", category="Brakes", 
            brand="Endurance", vehicle_fitment="Bajaj Pulsar 150", 
            price=Decimal("1459.50")
        )
        self.inv1 = Inventory.objects.create(product=self.product1, quantity=10)
        
        self.product2 = Product.objects.create(
            sku="FIL-1012", name="Oil Filter", category="Filters", 
            brand="Bosch", vehicle_fitment="Universal", 
            price=Decimal("250.00")
        )
        self.inv2 = Inventory.objects.create(product=self.product2, quantity=0)

        self.dealer = Dealer.objects.create(
            dealer_code="DLR-007", name="Test Dealer", city="Pune"
        )

    def test_list_products_pagination_and_filtering(self):
        # 2 products total
        response = self.client.get('/api/products/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 2)
        
        # Test filtering
        response = self.client.get('/api/products/?search=Brake')
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['results'][0]['sku'], 'BRK-1044')
        self.assertEqual(response.data['results'][0]['stock'], 10)

    def test_create_product_invalid_input(self):
        # Invalid price (negative)
        data = {
            "sku": "NEW-123", "name": "New Part", "category": "Misc",
            "brand": "Brand", "vehicle_fitment": "Any", "price": "-10.00"
        }
        response = self.client.post('/api/products/', data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['error']['code'], 'VALIDATION_ERROR')
        
    def test_create_product_duplicate_sku(self):
        data = {
            "sku": "BRK-1044", "name": "Brake Pad Set", "category": "Brakes",
            "brand": "Endurance", "vehicle_fitment": "Bajaj Pulsar 150", "price": "1459.50"
        }
        response = self.client.post('/api/products/', data, format='json')
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data['error']['code'], 'DUPLICATE')

    def test_update_inventory(self):
        data = {"quantity": 25, "reason": "stock count correction"}
        response = self.client.put('/api/inventory/BRK-1044/', data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['quantity'], 25)
        
        self.inv1.refresh_from_db()
        self.assertEqual(self.inv1.quantity, 25)

    def test_create_draft_order_success(self):
        # Create order
        data = {
            "dealer_id": self.dealer.id,
            "items": [
                {"sku": "BRK-1044", "quantity": 3},
                {"sku": "FIL-1012", "quantity": 2}
            ]
        }
        response = self.client.post('/api/orders/', data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['status'], 'DRAFT')
        
        # Verify exactly no stock changes
        self.inv1.refresh_from_db()
        self.assertEqual(self.inv1.quantity, 10)
        
        # Tax and totals verification
        # line 1: 1459.50 * 3 = 4378.50. Tax: 4378.50 * 0.18 = 788.13
        # line 2: 250.00 * 2 = 500.00. Tax: 500.00 * 0.18 = 90.00
        # total subtotal = 4878.50
        # total tax = 878.13
        # grand total = 5756.63
        self.assertEqual(response.data['subtotal'], "4878.50")
        self.assertEqual(response.data['tax_total'], "878.13")
        self.assertEqual(response.data['grand_total'], "5756.63")

    def test_create_draft_order_missing_sku(self):
        data = {
            "dealer_id": self.dealer.id,
            "items": [{"sku": "NON-EXISTENT", "quantity": 1}]
        }
        response = self.client.post('/api/orders/', data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['error']['code'], 'VALIDATION_ERROR')
