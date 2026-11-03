from django.db import models

from rest_framework import generics, permissions

from staff.permissions import (
    RestaurantAccessMixin,
    RestaurantRolePermission,
)

from .models import Customer
from .serializers import CustomerSerializer


class RestaurantCustomerMixin(RestaurantAccessMixin):
    permission_classes = [
        permissions.IsAuthenticated,
        RestaurantRolePermission,
    ]

    role_permissions = {
        "GET": ["manager", "cashier", "waiter"],
        "POST": ["manager", "cashier", "waiter"],
        "PUT": ["manager", "cashier"],
        "PATCH": ["manager", "cashier"],
        "DELETE": ["manager"],
    }

    def get_serializer_context(self):
        context = super().get_serializer_context()

        context["restaurant"] = self.get_restaurant()
        context["access"] = self.get_restaurant_access()

        return context


class CustomerListCreateView(
    RestaurantCustomerMixin,
    generics.ListCreateAPIView,
):
    serializer_class = CustomerSerializer

    def get_queryset(self):
        queryset = Customer.objects.filter(
            restaurant=self.get_restaurant()
        )

        search = self.request.query_params.get(
            "search",
            "",
        ).strip()

        if search:
            queryset = queryset.filter(
                models.Q(full_name__icontains=search)
                | models.Q(phone__icontains=search)
                | models.Q(email__icontains=search)
            )

        return queryset.order_by("-created_at")

    def perform_create(self, serializer):
        serializer.save(
            restaurant=self.get_restaurant()
        )


class CustomerDetailView(
    RestaurantCustomerMixin,
    generics.RetrieveUpdateDestroyAPIView,
):
    serializer_class = CustomerSerializer

    def get_queryset(self):
        return Customer.objects.filter(
            restaurant=self.get_restaurant()
        )