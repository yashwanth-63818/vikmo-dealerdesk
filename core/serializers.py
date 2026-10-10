from rest_framework import serializers
from .models import Product, Inventory, Dealer, Order, OrderItem
import decimal

class ProductSerializer(serializers.ModelSerializer):
    sku = serializers.CharField(max_length=50)
    stock = serializers.IntegerField(source='inventory.quantity', read_only=True)
    price = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=decimal.Decimal('0.01'))

    class Meta:
        model = Product
        fields = ['sku', 'name', 'category', 'brand', 'vehicle_fitment', 'price', 'stock', 'description']

    def create(self, validated_data):
        product = Product.objects.create(**validated_data)
        Inventory.objects.create(product=product, quantity=0)
        return product

class InventoryUpdateSerializer(serializers.Serializer):
    quantity = serializers.IntegerField(min_value=0)
    reason = serializers.CharField(required=False, allow_blank=True)

class DealerSerializer(serializers.ModelSerializer):
    dealer_code = serializers.CharField(max_length=50)
    
    class Meta:
        model = Dealer
        fields = ['id', 'dealer_code', 'name', 'city', 'phone', 'email', 'gstin', 'credit_limit']
        extra_kwargs = {
            'dealer_code': {'required': True},
            'name': {'required': True}
        }

class OrderItemInputSerializer(serializers.Serializer):
    sku = serializers.CharField(max_length=50)
    quantity = serializers.IntegerField(min_value=1)

class OrderInputSerializer(serializers.Serializer):
    dealer_id = serializers.IntegerField()
    items = OrderItemInputSerializer(many=True, allow_empty=False)

    def validate_items(self, value):
        skus = [item['sku'] for item in value]
        if len(skus) != len(set(skus)):
            raise serializers.ValidationError("Duplicate SKUs in order items are not allowed.")
        return value

class OrderItemOutputSerializer(serializers.ModelSerializer):
    sku = serializers.CharField(source='product.sku', read_only=True)
    name = serializers.CharField(source='product.name', read_only=True)

    class Meta:
        model = OrderItem
        fields = ['sku', 'name', 'quantity', 'unit_price', 'line_subtotal', 'line_tax', 'line_total']

class OrderOutputSerializer(serializers.ModelSerializer):
    items = OrderItemOutputSerializer(many=True, read_only=True)

    class Meta:
        model = Order
        fields = ['order_number', 'dealer_id', 'status', 'items', 'subtotal', 'tax_total', 'grand_total', 'created_at', 'updated_at']
