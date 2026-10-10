from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views
from django.http import JsonResponse

def health(request):
    return JsonResponse({"status": "ok"})

router = DefaultRouter()
router.register(r'products', views.ProductViewSet, basename='product')
router.register(r'dealers', views.DealerViewSet, basename='dealer')
router.register(r'orders', views.OrderViewSet, basename='order')

urlpatterns = [
    path('health/', health),
    path('inventory/<str:sku>/', views.InventoryUpdateView.as_view(), name='inventory-update'),
    path('sync/supplier/', views.SupplierSyncView.as_view(), name='sync-supplier'),
    path('', include(router.urls)),
]
