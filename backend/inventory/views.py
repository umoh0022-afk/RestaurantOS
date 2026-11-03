from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models import F
from django.shortcuts import get_object_or_404

from rest_framework import generics, status
from rest_framework.exceptions import ValidationError, PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from staff.permissions import (
    RestaurantAccessMixin,
    RestaurantRolePermission,
)

from .models import (
    Supplier,
    InventoryItem,
    StockLevel,
    Purchase,
    StockMovement,
    RecipeIngredient,
)

from .serializers import (
    SupplierSerializer,
    InventoryItemSerializer,
    StockLevelSerializer,
    PurchaseSerializer,
    StockMovementSerializer,
    RecipeIngredientSerializer,
)


# ---------------------------------------------------------
# SHARED RESTAURANT AND BRANCH ACCESS
# ---------------------------------------------------------

class RestaurantScopedMixin(RestaurantAccessMixin):
    permission_classes = [
        IsAuthenticated,
        RestaurantRolePermission,
    ]

    role_permissions = {
        "GET": ["manager"],
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

    def validate_branch_access(self, branch):
        """
        Ensure staff can only operate on assigned branches.
        Owners can access every branch.
        """

        access = self.get_restaurant_access()

        if access["is_owner"]:
            return

        staff_member = access["staff_member"]

        if not staff_member.branches.filter(
            pk=branch.pk
        ).exists():
            raise PermissionDenied(
                "You do not have access to this branch."
            )

    def filter_branch_queryset(
        self,
        queryset,
        branch_lookup="branch_id",
    ):
        return self.filter_by_branch_access(
            queryset,
            branch_lookup=branch_lookup,
        )


# ---------------------------------------------------------
# SUPPLIERS
# ---------------------------------------------------------

class SupplierListCreateView(
    RestaurantScopedMixin,
    generics.ListCreateAPIView,
):
    serializer_class = SupplierSerializer

    def get_queryset(self):
        return Supplier.objects.filter(
            restaurant=self.get_restaurant()
        ).order_by("name")

    def perform_create(self, serializer):
        serializer.save(
            restaurant=self.get_restaurant()
        )


class SupplierDetailView(
    RestaurantScopedMixin,
    generics.RetrieveUpdateAPIView,
):
    serializer_class = SupplierSerializer

    def get_queryset(self):
        return Supplier.objects.filter(
            restaurant=self.get_restaurant()
        )


# ---------------------------------------------------------
# INVENTORY ITEMS
# ---------------------------------------------------------

class InventoryItemListCreateView(
    RestaurantScopedMixin,
    generics.ListCreateAPIView,
):
    serializer_class = InventoryItemSerializer

    def get_queryset(self):
        queryset = InventoryItem.objects.filter(
            restaurant=self.get_restaurant()
        )

        category = self.request.query_params.get("category")
        search = self.request.query_params.get("search")
        active = self.request.query_params.get("active")

        if category:
            queryset = queryset.filter(
                category__iexact=category
            )

        if search:
            queryset = queryset.filter(
                name__icontains=search
            )

        if active in ("true", "false"):
            queryset = queryset.filter(
                is_active=(active == "true")
            )

        return queryset.order_by("name")

    def perform_create(self, serializer):
        serializer.save(
            restaurant=self.get_restaurant()
        )


class InventoryItemDetailView(
    RestaurantScopedMixin,
    generics.RetrieveUpdateAPIView,
):
    serializer_class = InventoryItemSerializer

    def get_queryset(self):
        return InventoryItem.objects.filter(
            restaurant=self.get_restaurant()
        )


# ---------------------------------------------------------
# STOCK LEVELS
# ---------------------------------------------------------

class StockLevelListView(
    RestaurantScopedMixin,
    generics.ListAPIView,
):
    serializer_class = StockLevelSerializer

    def get_queryset(self):
        queryset = StockLevel.objects.filter(
            branch__restaurant=self.get_restaurant()
        ).select_related(
            "inventory_item",
            "branch",
        )

        queryset = self.filter_branch_queryset(queryset)

        branch_id = self.request.query_params.get("branch")
        item_id = self.request.query_params.get("item")

        if branch_id:
            queryset = queryset.filter(
                branch_id=branch_id
            )

        if item_id:
            queryset = queryset.filter(
                inventory_item_id=item_id
            )

        return queryset.order_by(
            "inventory_item__name"
        )


# ---------------------------------------------------------
# PURCHASES
# ---------------------------------------------------------

class PurchaseListCreateView(
    RestaurantScopedMixin,
    generics.ListCreateAPIView,
):
    serializer_class = PurchaseSerializer

    def get_queryset(self):
        queryset = Purchase.objects.filter(
            restaurant=self.get_restaurant()
        ).select_related(
            "supplier",
            "branch",
            "created_by",
        ).prefetch_related(
            "items__inventory_item"
        )

        queryset = self.filter_branch_queryset(queryset)

        purchase_status = self.request.query_params.get("status")
        branch_id = self.request.query_params.get("branch")

        if purchase_status:
            queryset = queryset.filter(
                status=purchase_status
            )

        if branch_id:
            queryset = queryset.filter(
                branch_id=branch_id
            )

        return queryset.order_by("-created_at")

    def perform_create(self, serializer):
        branch = serializer.validated_data.get("branch")

        if branch:
            self.validate_branch_access(branch)

        serializer.save(
            restaurant=self.get_restaurant(),
            created_by=self.request.user,
        )


class PurchaseDetailView(
    RestaurantScopedMixin,
    generics.RetrieveUpdateDestroyAPIView,
):
    serializer_class = PurchaseSerializer

    def get_queryset(self):
        queryset = Purchase.objects.filter(
            restaurant=self.get_restaurant()
        ).select_related(
            "supplier",
            "branch",
            "created_by",
        ).prefetch_related(
            "items__inventory_item"
        )

        return self.filter_branch_queryset(queryset)

    def perform_update(self, serializer):
        branch = serializer.validated_data.get(
            "branch",
            serializer.instance.branch,
        )

        self.validate_branch_access(branch)

        serializer.save()

    def perform_destroy(self, instance):
        if instance.status != "draft":
            raise ValidationError(
                "Only draft purchases can be deleted."
            )

        instance.delete()


# ---------------------------------------------------------
# RECEIVE PURCHASE
# ---------------------------------------------------------

class PurchaseReceiveView(
    RestaurantScopedMixin,
    APIView,
):
    role_permissions = {
        "POST": ["manager"],
    }

    @transaction.atomic
    def post(self, request, restaurant_id, pk):
        restaurant = self.get_restaurant()

        purchase_queryset = Purchase.objects.filter(
            restaurant=restaurant
        )

        purchase_queryset = self.filter_branch_queryset(
            purchase_queryset
        )

        purchase = get_object_or_404(
            purchase_queryset.select_for_update().prefetch_related(
                "items__inventory_item"
            ),
            pk=pk,
        )

        if purchase.status != "draft":
            return Response(
                {
                    "success": False,
                    "message": (
                        "This purchase has already been processed."
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        purchase_items = list(
            purchase.items.all()
        )

        if not purchase_items:
            return Response(
                {
                    "success": False,
                    "message": "This purchase has no items.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        for purchase_item in purchase_items:
            inventory_item = purchase_item.inventory_item

            if inventory_item.restaurant_id != restaurant.id:
                raise ValidationError(
                    "A purchase item does not belong to this restaurant."
                )

            stock_level, created = StockLevel.objects.get_or_create(
                inventory_item=inventory_item,
                branch=purchase.branch,
                defaults={
                    "quantity": Decimal("0.000")
                },
            )

            stock_level = StockLevel.objects.select_for_update().get(
                pk=stock_level.pk
            )

            StockLevel.objects.filter(
                pk=stock_level.pk
            ).update(
                quantity=F("quantity") + purchase_item.quantity
            )

            stock_level.refresh_from_db()

            StockMovement.objects.create(
                restaurant=restaurant,
                inventory_item=inventory_item,
                branch=purchase.branch,
                movement_type="purchase",
                quantity=purchase_item.quantity,
                reference=(
                    purchase.reference
                    or f"Purchase #{purchase.pk}"
                ),
                notes=(
                    f"Stock received from purchase #{purchase.pk}."
                ),
                created_by=request.user,
            )

        purchase.status = "received"

        purchase.save(
            update_fields=[
                "status",
                "updated_at",
            ]
        )

        return Response(
            {
                "success": True,
                "message": (
                    "Purchase received and stock levels "
                    "updated successfully."
                ),
                "purchase": PurchaseSerializer(
                    purchase,
                    context={
                        "request": request,
                        "restaurant": restaurant,
                        "access": self.get_restaurant_access(),
                    },
                ).data,
            },
            status=status.HTTP_200_OK,
        )


# ---------------------------------------------------------
# STOCK MOVEMENTS
# ---------------------------------------------------------

class StockMovementListView(
    RestaurantScopedMixin,
    generics.ListAPIView,
):
    serializer_class = StockMovementSerializer

    def get_queryset(self):
        queryset = StockMovement.objects.filter(
            restaurant=self.get_restaurant()
        ).select_related(
            "inventory_item",
            "branch",
            "created_by",
        )

        queryset = self.filter_branch_queryset(queryset)

        movement_type = self.request.query_params.get("type")
        branch_id = self.request.query_params.get("branch")
        item_id = self.request.query_params.get("item")

        if movement_type:
            queryset = queryset.filter(
                movement_type=movement_type
            )

        if branch_id:
            queryset = queryset.filter(
                branch_id=branch_id
            )

        if item_id:
            queryset = queryset.filter(
                inventory_item_id=item_id
            )

        return queryset.order_by("-created_at")


# ---------------------------------------------------------
# STOCK ADJUSTMENTS
# ---------------------------------------------------------

class StockAdjustmentView(
    RestaurantScopedMixin,
    APIView,
):
    """
    Records stock usage, wastage or manual adjustments.

    Usage and wastage reduce stock.
    Adjustments require an explicit increase/decrease direction.
    """

    role_permissions = {
        "POST": ["manager"],
    }

    @transaction.atomic
    def post(self, request, restaurant_id):
        restaurant = self.get_restaurant()

        item_id = request.data.get("inventory_item")
        branch_id = request.data.get("branch")
        movement_type = request.data.get("movement_type")
        direction = request.data.get("direction")
        raw_quantity = request.data.get("quantity")

        if not all([
            item_id,
            branch_id,
            movement_type,
            raw_quantity,
        ]):
            raise ValidationError(
                "Inventory item, branch, movement type and quantity are required."
            )

        try:
            quantity = Decimal(str(raw_quantity))

        except (
            InvalidOperation,
            TypeError,
            ValueError,
        ):
            raise ValidationError({
                "quantity": "Enter a valid numeric quantity."
            })

        if not quantity.is_finite() or quantity <= 0:
            raise ValidationError({
                "quantity": "Quantity must be greater than zero."
            })

        allowed_types = [
            "usage",
            "wastage",
            "adjustment",
        ]

        if movement_type not in allowed_types:
            raise ValidationError({
                "movement_type": (
                    "Allowed types are usage, wastage and adjustment. "
                    "Purchases must be received through the purchase endpoint."
                )
            })

        if movement_type in ["usage", "wastage"]:
            direction = "decrease"

        elif direction not in ["increase", "decrease"]:
            raise ValidationError({
                "direction": (
                    "For adjustments, direction must be increase or decrease."
                )
            })

        inventory_item = get_object_or_404(
            InventoryItem,
            pk=item_id,
            restaurant=restaurant,
            is_active=True,
        )

        branch = get_object_or_404(
            restaurant.branches,
            pk=branch_id,
            is_active=True,
        )

        self.validate_branch_access(branch)

        stock_level, created = StockLevel.objects.get_or_create(
            inventory_item=inventory_item,
            branch=branch,
            defaults={
                "quantity": Decimal("0.000")
            },
        )

        stock_level = StockLevel.objects.select_for_update().get(
            pk=stock_level.pk
        )

        if direction == "decrease":
            if stock_level.quantity < quantity:
                raise ValidationError({
                    "quantity": (
                        f"Insufficient stock. Available quantity: "
                        f"{stock_level.quantity} {inventory_item.unit}."
                    )
                })

            StockLevel.objects.filter(
                pk=stock_level.pk
            ).update(
                quantity=F("quantity") - quantity
            )

        else:
            StockLevel.objects.filter(
                pk=stock_level.pk
            ).update(
                quantity=F("quantity") + quantity
            )

        movement = StockMovement.objects.create(
            restaurant=restaurant,
            inventory_item=inventory_item,
            branch=branch,
            movement_type=movement_type,
            quantity=quantity,
            reference=request.data.get("reference", ""),
            notes=request.data.get("notes", ""),
            created_by=request.user,
        )

        stock_level.refresh_from_db()

        return Response(
            {
                "success": True,
                "message": "Stock updated successfully.",
                "new_quantity": stock_level.quantity,
                "movement": StockMovementSerializer(
                    movement
                ).data,
            },
            status=status.HTTP_201_CREATED,
        )


# ---------------------------------------------------------
# RECIPE INGREDIENTS
# ---------------------------------------------------------

class RecipeIngredientListCreateView(
    RestaurantScopedMixin,
    generics.ListCreateAPIView,
):
    serializer_class = RecipeIngredientSerializer

    def get_queryset(self):
        queryset = RecipeIngredient.objects.filter(
            menu_item__restaurant=self.get_restaurant()
        ).select_related(
            "menu_item",
            "inventory_item",
        )

        menu_item_id = self.request.query_params.get("menu_item")

        if menu_item_id:
            queryset = queryset.filter(
                menu_item_id=menu_item_id
            )

        return queryset.order_by("menu_item__name")


class RecipeIngredientDetailView(
    RestaurantScopedMixin,
    generics.RetrieveUpdateDestroyAPIView,
):
    serializer_class = RecipeIngredientSerializer

    def get_queryset(self):
        return RecipeIngredient.objects.filter(
            menu_item__restaurant=self.get_restaurant()
        ).select_related(
            "menu_item",
            "inventory_item",
        )