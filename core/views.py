import json
import hashlib
from rest_framework import viewsets, mixins, status, views
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination
from django.db import transaction
from django.db.models import Q
from .models import Product, Inventory, Dealer, Order, IdempotencyRecord
from .serializers import (
    ProductSerializer, InventoryUpdateSerializer, DealerSerializer,
    OrderInputSerializer, OrderUpdateInputSerializer, OrderOutputSerializer
)
from .services import (
    create_draft_order, update_draft_order, confirm_order,
    dispatch_order, deliver_order, cancel_order
)
from .supplier import sync_supplier_catalogue
from rest_framework.decorators import action
from rest_framework.views import APIView
from .exceptions import CustomAPIException

class StandardResultsSetPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = 'page_size'
    max_page_size = 100

class ProductViewSet(viewsets.ModelViewSet):
    queryset = Product.objects.select_related('inventory').all()
    serializer_class = ProductSerializer
    pagination_class = StandardResultsSetPagination
    lookup_field = 'sku'

    def get_queryset(self):
        queryset = super().get_queryset()
        search = self.request.query_params.get('search', None)
        category = self.request.query_params.get('category', None)
        vehicle = self.request.query_params.get('vehicle', None)

        if search:
            queryset = queryset.filter(
                Q(sku__icontains=search) |
                Q(name__icontains=search) |
                Q(brand__icontains=search)
            )
        if category:
            queryset = queryset.filter(category__iexact=category)
        if vehicle:
            queryset = queryset.filter(vehicle_fitment__icontains=vehicle)

        return queryset.order_by('sku')

    def destroy(self, request, *args, **kwargs):
        return Response(status=status.HTTP_405_METHOD_NOT_ALLOWED)

    def update(self, request, *args, **kwargs):
        if not kwargs.get('partial', False):
            return Response(status=status.HTTP_405_METHOD_NOT_ALLOWED)
        return super().update(request, *args, **kwargs)

class InventoryUpdateView(views.APIView):
    def put(self, request, sku):
        try:
            product = Product.objects.get(sku=sku)
        except Product.DoesNotExist:
            raise CustomAPIException('NOT_FOUND', 'Product not found', status.HTTP_404_NOT_FOUND)

        serializer = InventoryUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            inventory, _ = Inventory.objects.get_or_create(product=product)
            inventory.quantity = serializer.validated_data['quantity']
            inventory.save()
        return Response({'sku': sku, 'quantity': inventory.quantity})

class DealerViewSet(viewsets.ModelViewSet):
    queryset = Dealer.objects.all().order_by('id')
    serializer_class = DealerSerializer
    pagination_class = StandardResultsSetPagination

    def update(self, request, *args, **kwargs):
        return Response(status=status.HTTP_405_METHOD_NOT_ALLOWED)

    def destroy(self, request, *args, **kwargs):
        return Response(status=status.HTTP_405_METHOD_NOT_ALLOWED)

class OrderViewSet(viewsets.ModelViewSet):
    queryset = Order.objects.prefetch_related('items__product').all()
    serializer_class = OrderOutputSerializer
    pagination_class = StandardResultsSetPagination
    lookup_field = 'order_number'

    def get_queryset(self):
        queryset = super().get_queryset()
        dealer_id = self.request.query_params.get('dealer_id', None)
        status_filter = self.request.query_params.get('status', None)

        if dealer_id:
            queryset = queryset.filter(dealer_id=dealer_id)
        if status_filter:
            queryset = queryset.filter(status=status_filter)

        return queryset.order_by('-created_at')

    def create(self, request, *args, **kwargs):
        idem_key = request.headers.get('Idempotency-Key')
        request_body_str = json.dumps(request.data, sort_keys=True)
        request_hash = hashlib.sha256(request_body_str.encode('utf-8')).hexdigest()

        if idem_key:
            from django.db import IntegrityError
            try:
                IdempotencyRecord.objects.create(
                    key=idem_key,
                    request_hash=request_hash,
                    response_status=0,
                    response_body={}
                )
            except IntegrityError:
                pass

        with transaction.atomic():
            if idem_key:
                record = IdempotencyRecord.objects.select_for_update().get(key=idem_key)
                if record.request_hash != request_hash:
                    raise CustomAPIException('IDEMPOTENCY_CONFLICT', 'Idempotency key reused with different request body', status.HTTP_409_CONFLICT)
                r_status = int(record.response_status)
                if r_status != 0:
                    return Response(record.response_body, status=r_status)

            serializer = OrderInputSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)

            order = create_draft_order(serializer.validated_data)
            output = OrderOutputSerializer(order).data

            if idem_key:
                record.response_status = status.HTTP_201_CREATED
                record.response_body = output
                record.save()

            return Response(output, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        # We only support PUT (full update of items) as per contract
        if kwargs.get('partial', False):
            return Response(status=status.HTTP_405_METHOD_NOT_ALLOWED)

        order = self.get_object()

        serializer = OrderUpdateInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        updated_order = update_draft_order(order, serializer.validated_data)
        output = OrderOutputSerializer(updated_order).data

        return Response(output)

    def destroy(self, request, *args, **kwargs):
        return Response(status=status.HTTP_405_METHOD_NOT_ALLOWED)

    @action(detail=True, methods=['post'])
    def confirm(self, request, order_number=None):
        order = self.get_object()
        updated_order = confirm_order(order)
        return Response(OrderOutputSerializer(updated_order).data)

    @action(detail=True, methods=['post'], url_path='dispatch')
    def dispatch_order_action(self, request, order_number=None):
        order = self.get_object()
        updated_order = dispatch_order(order)
        return Response(OrderOutputSerializer(updated_order).data)

    @action(detail=True, methods=['post'])
    def deliver(self, request, order_number=None):
        order = self.get_object()
        updated_order = deliver_order(order)
        return Response(OrderOutputSerializer(updated_order).data)

    @action(detail=True, methods=['post'])
    def cancel(self, request, order_number=None):
        order = self.get_object()
        updated_order = cancel_order(order)
        return Response(OrderOutputSerializer(updated_order).data)

class SupplierSyncView(APIView):
    def post(self, request):
        result = sync_supplier_catalogue()
        return Response(result, status=status.HTTP_200_OK)
