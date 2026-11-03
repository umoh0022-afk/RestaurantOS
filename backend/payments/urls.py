from django.urls import path

from .views import PaymentListCreateView, PaymentDetailView

urlpatterns = [
    path(
        "<int:restaurant_id>/",
        PaymentListCreateView.as_view(),
        name="payment-list-create",
    ),
    path(
        "<int:restaurant_id>/<int:pk>/",
        PaymentDetailView.as_view(),
        name="payment-detail",
    ),
]