from django.db.models import Q

from rest_framework import generics, permissions

from staff.permissions import (
    RestaurantAccessMixin,
    RestaurantRolePermission,
)

from .models import MenuCategory, MenuItem


class RestaurantMenuAccessMixin(RestaurantAccessMixin):
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
        "POST": ["manager"],
        "PUT": ["manager"],
        "PATCH": ["manager"],
        "DELETE": ["manager"],
    }

    def get_serializer_context(self):
        context = super().get_serializer_context()

        context["restaurant"] = self.get_restaurant()
        context["access"] = self.get_restaurant_access()

        return context

    def get_accessible_menu_items(self, queryset):
        access = self.get_restaurant_access()

        if access["is_owner"]:
            return queryset

        staff_member = access["staff_member"]

        if not staff_member:
            return queryset.none()

        branch_ids = list(
            staff_member.branches.values_list(
                "id",
                flat=True,
            )
        )

        if not branch_ids:
            return queryset.none()

        return queryset.filter(
            Q(branches__isnull=True)
            | Q(branches__in=branch_ids)
        ).distinct()


class MenuCategoryListCreateView(
    RestaurantMenuAccessMixin,
    generics.ListCreateAPIView,
):
    serializer_class = None

    def get_serializer_class(self):
        from .menu_serializers import MenuCategorySerializer

        return MenuCategorySerializer

    def get_queryset(self):
        return MenuCategory.objects.filter(
            restaurant=self.get_restaurant()
        ).order_by("display_order", "name")

    def perform_create(self, serializer):
        serializer.save(
            restaurant=self.get_restaurant()
        )


class MenuCategoryDetailView(
    RestaurantMenuAccessMixin,
    generics.RetrieveUpdateDestroyAPIView,
):
    def get_serializer_class(self):
        from .menu_serializers import MenuCategorySerializer

        return MenuCategorySerializer

    def get_queryset(self):
        return MenuCategory.objects.filter(
            restaurant=self.get_restaurant()
        )


class MenuItemListCreateView(
    RestaurantMenuAccessMixin,
    generics.ListCreateAPIView,
):
    def get_serializer_class(self):
        from .menu_serializers import MenuItemSerializer

        return MenuItemSerializer

    def get_queryset(self):
        queryset = MenuItem.objects.filter(
            restaurant=self.get_restaurant()
        ).select_related(
            "category"
        ).prefetch_related(
            "branches"
        )

        queryset = self.get_accessible_menu_items(queryset)

        category_id = self.request.query_params.get("category")
        availability = self.request.query_params.get("available")

        if category_id:
            queryset = queryset.filter(
                category_id=category_id
            )

        if availability in ("true", "false"):
            queryset = queryset.filter(
                is_available=(availability == "true")
            )

        return queryset.order_by(
            "display_order",
            "name",
        )

    def perform_create(self, serializer):
        serializer.save(
            restaurant=self.get_restaurant()
        )


class MenuItemDetailView(
    RestaurantMenuAccessMixin,
    generics.RetrieveUpdateDestroyAPIView,
):
    def get_serializer_class(self):
        from .menu_serializers import MenuItemSerializer

        return MenuItemSerializer

    def get_queryset(self):
        queryset = MenuItem.objects.filter(
            restaurant=self.get_restaurant()
        ).select_related(
            "category"
        ).prefetch_related(
            "branches"
        )

        return self.get_accessible_menu_items(queryset)