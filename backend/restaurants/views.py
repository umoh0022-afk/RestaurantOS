from django.shortcuts import get_object_or_404

from rest_framework import generics, permissions

from staff.permissions import (
    RestaurantAccessMixin,
    RestaurantRolePermission,
)

from .models import Restaurant, Branch
from .serializers import RestaurantSerializer, BranchSerializer


class RestaurantListCreateView(generics.ListCreateAPIView):
    serializer_class = RestaurantSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Restaurant.objects.filter(
            owner=self.request.user
        ).order_by("-created_at")


class RestaurantDetailView(generics.RetrieveUpdateAPIView):
    serializer_class = RestaurantSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Restaurant.objects.filter(
            owner=self.request.user
        )


class BranchAccessMixin(RestaurantAccessMixin):
    permission_classes = [
        permissions.IsAuthenticated,
        RestaurantRolePermission,
    ]

    role_permissions = {
        "GET": [
            "manager",
            "cashier",
            "waiter",
            "kitchen_staff",
        ],
        "POST": [],
        "PUT": [],
        "PATCH": [],
        "DELETE": [],
    }

    def get_queryset(self):
        queryset = Branch.objects.filter(
            restaurant=self.get_restaurant()
        )

        access = self.get_restaurant_access()

        if access["is_owner"]:
            return queryset.order_by("name")

        staff_member = access["staff_member"]

        if not staff_member:
            return queryset.none()

        branch_ids = staff_member.branches.values_list(
            "id",
            flat=True,
        )

        return queryset.filter(
            id__in=branch_ids
        ).order_by("name")


class BranchListCreateView(
    BranchAccessMixin,
    generics.ListCreateAPIView,
):
    serializer_class = BranchSerializer

    def perform_create(self, serializer):
        restaurant = self.get_restaurant()

        serializer.save(
            restaurant=restaurant,
            is_main_branch=False,
        )


class BranchDetailView(
    BranchAccessMixin,
    generics.RetrieveUpdateDestroyAPIView,
):
    serializer_class = BranchSerializer

    def get_queryset(self):
        queryset = super().get_queryset()

        # The main branch cannot be updated or deleted.
        if self.request.method in ("PUT", "PATCH", "DELETE"):
            queryset = queryset.filter(
                is_main_branch=False
            )

        return queryset

    def perform_update(self, serializer):
        branch = self.get_object()

        serializer.save(
            restaurant=branch.restaurant,
            is_main_branch=False,
        )