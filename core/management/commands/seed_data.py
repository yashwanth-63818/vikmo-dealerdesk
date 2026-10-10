import csv
import os
from django.core.management.base import BaseCommand
from django.conf import settings
from django.db import transaction
from core.models import Product, Inventory, Dealer

class Command(BaseCommand):
    help = 'Load seed data from CSV files'

    def handle(self, *args, **options):
        data_dir = settings.DATA_DIR
        catalogue_path = os.path.join(data_dir, 'catalogue.csv')
        dealers_path = os.path.join(data_dir, 'dealers.csv')

        with transaction.atomic():
            self.stdout.write("Loading catalogue.csv...")
            with open(catalogue_path, mode='r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                products_created = 0
                inventory_created = 0
                for row in reader:
                    product, p_created = Product.objects.update_or_create(
                        sku=row['sku'],
                        defaults={
                            'name': row['name'],
                            'category': row['category'],
                            'brand': row['brand'],
                            'vehicle_fitment': row['vehicle_fitment'],
                            'price': row['price'],
                            'description': row['description'],
                        }
                    )
                    if p_created:
                        products_created += 1

                    # Initialize inventory only if it doesn't exist
                    inv, i_created = Inventory.objects.get_or_create(
                        product=product,
                        defaults={'quantity': int(row['stock'])}
                    )
                    if i_created:
                        inventory_created += 1

            self.stdout.write(self.style.SUCCESS(f"Processed catalogue. Products created: {products_created}, Inventory records created: {inventory_created}"))

            self.stdout.write("Loading dealers.csv...")
            with open(dealers_path, mode='r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                dealers_created = 0
                for row in reader:
                    dealer, created = Dealer.objects.update_or_create(
                        dealer_code=row['dealer_code'],
                        defaults={
                            'name': row['name'],
                            'city': row['city'],
                            'phone': row['phone'],
                            'email': row['email'],
                            'gstin': row['gstin'],
                            'credit_limit': row['credit_limit']
                        }
                    )
                    if created:
                        dealers_created += 1
            
            self.stdout.write(self.style.SUCCESS(f"Processed dealers. Dealers created: {dealers_created}"))
