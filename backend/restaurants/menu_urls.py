
from django.urls import path

from .menu_views import (
    MenuCategoryListCreateView,
    MenuCategoryDetailView,
    MenuItemListCreateView,
    MenuItemDetailView,
)


urlpatterns = [
    path(
        "categories/",
        MenuCategoryListCreateView.as_view(),
        name="menu-category-list-create",
    ),
    path(
        "categories/<int:pk>/",
        MenuCategoryDetailView.as_view(),
        name="menu-category-detail",
    ),
    path(
        "items/",
        MenuItemListCreateView.as_view(),
        name="menu-item-list-create",
    ),
    path(
        "items/<int:pk>/",
        MenuItemDetailView.as_view(),
        name="menu-item-detail",
    ),
]
