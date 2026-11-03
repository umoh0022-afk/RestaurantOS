from django.urls import path

from .views import (
    SupplierListCreateView,
    SupplierDetailView,
    InventoryItemListCreateView,
    InventoryItemDetailView,
    StockLevelListView,
    PurchaseListCreateView,
    PurchaseDetailView,
    PurchaseReceiveView,
    StockMovementListView,
    StockAdjustmentView,
    RecipeIngredientListCreateView,
    RecipeIngredientDetailView,
)

urlpatterns = [
    # Suppliers
    path(
        "<int:restaurant_id>/suppliers/",
        SupplierListCreateView.as_view(),
        name="supplier-list-create",
    ),
    path(
        "<int:restaurant_id>/suppliers/<int:pk>/",
        SupplierDetailView.as_view(),
        name="supplier-detail",
    ),

    # Inventory items
    path(
        "<int:restaurant_id>/items/",
        InventoryItemListCreateView.as_view(),
        name="inventory-item-list-create",
    ),
    path(
        "<int:restaurant_id>/items/<int:pk>/",
        InventoryItemDetailView.as_view(),
        name="inventory-item-detail",
    ),

    # Stock levels
    path(
        "<int:restaurant_id>/stock/",
        StockLevelListView.as_view(),
        name="stock-level-list",
    ),

    # Purchases
    path(
        "<int:restaurant_id>/purchases/",
        PurchaseListCreateView.as_view(),
        name="purchase-list-create",
    ),
    path(
        "<int:restaurant_id>/purchases/<int:pk>/",
        PurchaseDetailView.as_view(),
        name="purchase-detail",
    ),
    path(
        "<int:restaurant_id>/purchases/<int:pk>/receive/",
        PurchaseReceiveView.as_view(),
        name="purchase-receive",
    ),

    # Stock movements and adjustments
    path(
        "<int:restaurant_id>/movements/",
        StockMovementListView.as_view(),
        name="stock-movement-list",
    ),
    path(
        "<int:restaurant_id>/stock/adjust/",
        StockAdjustmentView.as_view(),
        name="stock-adjustment",
    ),

    # Recipe ingredients
    path(
        "<int:restaurant_id>/recipes/",
        RecipeIngredientListCreateView.as_view(),
        name="recipe-ingredient-list-create",
    ),
    path(
        "<int:restaurant_id>/recipes/<int:pk>/",
        RecipeIngredientDetailView.as_view(),
        name="recipe-ingredient-detail",
    ),
]