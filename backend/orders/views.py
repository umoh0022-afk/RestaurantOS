from django.shortcuts import get_object_or_404

from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from staff.permissions import (
    RestaurantAccessMixin,
    RestaurantRolePermission,
)

from .models import Order
from .serializers import OrderSerializer
from .services import complete_order


class OrderRestaurantMixin(RestaurantAccessMixin):
    permission_classes = [
        IsAuthenticated,
        RestaurantRolePermission,
    ]

    role_permissions = {
        "GET": [
            "manager",
            "cashier",
            "waiter",
            "kitchen_staff",
        ],
        "POST": [
            "manager",
            "cashier",
            "waiter",
        ],
    }

    def get_queryset(self):
        queryset = (
            Order.objects
            .filter(restaurant=self.get_restaurant())
            .select_related("restaurant", "branch", "created_by")
            .prefetch_related("items__menu_item")
            .order_by("-created_at")
        )

        return self.filter_by_branch_access(
            queryset,
            branch_lookup="branch_id",
        )

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["restaurant"] = self.get_restaurant()
        context["access"] = self.get_restaurant_access()
        return context


class OrderListCreateView(
    OrderRestaurantMixin,
    generics.ListCreateAPIView,
):
    serializer_class = OrderSerializer


class OrderDetailView(
    OrderRestaurantMixin,
    generics.RetrieveAPIView,
):
    serializer_class = OrderSerializer


class OrderCompleteView(
    OrderRestaurantMixin,
    APIView,
):
    role_permissions = {
        "POST": ["manager", "cashier"],
    }

    def post(self, request, restaurant_id, pk):
        order = get_object_or_404(
            self.get_queryset(),
            pk=pk,
        )

        completed_order = complete_order(order.id)

        serializer = OrderSerializer(
            completed_order,
            context={
                "request": request,
                "restaurant": self.get_restaurant(),
                "access": self.get_restaurant_access(),
            },
        )

        return Response(
            {
                "message": (
                    "Order completed successfully. "
                    "Stock has been updated."
                ),
                "order": serializer.data,
            },
            status=status.HTTP_200_OK,
        )