from django.urls import path

from .views import (
    CustomerListCreateView,
    CustomerDetailView,
)

urlpatterns = [
    path(
        "<int:restaurant_id>/",
        CustomerListCreateView.as_view(),
        name="customer-list-create",
    ),

    path(
        "<int:restaurant_id>/<int:pk>/",
        CustomerDetailView.as_view(),
        name="customer-detail",
    ),
]