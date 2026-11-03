
from django.urls import path

from .views import (
    OrderListCreateView,
    OrderDetailView,
    OrderCompleteView,
)

urlpatterns = [
    path(
        "<int:restaurant_id>/",
        OrderListCreateView.as_view(),
        name="order-list-create",
    ),
    path(
        "<int:restaurant_id>/<int:pk>/",
        OrderDetailView.as_view(),
        name="order-detail",
    ),
    path(
        "<int:restaurant_id>/<int:pk>/complete/",
        OrderCompleteView.as_view(),
        name="order-complete",
    ),
]
