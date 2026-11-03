from django.db import transaction

from rest_framework import serializers

from restaurants.models import Branch, MenuItem

from .models import (
    Supplier,
    InventoryItem,
    StockLevel,
    Purchase,
    PurchaseItem,
    StockMovement,
    RecipeIngredient,
)


def get_restaurant(serializer):
    """
    Get the restaurant assigned to the authenticated request.
    Views must pass the restaurant through serializer context.
    """
    restaurant = serializer.context.get("restaurant")

    if restaurant is None:
        raise serializers.ValidationError(
            "Restaurant context is required."
        )

    return restaurant


# ---------------------------------------------------------
# SUPPLIERS
# ---------------------------------------------------------

class SupplierSerializer(serializers.ModelSerializer):
    restaurant = serializers.PrimaryKeyRelatedField(
        read_only=True
    )

    class Meta:
        model = Supplier
        fields = [
            "id",
            "restaurant",
            "name",
            "contact_person",
            "email",
            "phone",
            "address",
            "notes",
            "is_active",
            "created_at",
            "updated_at",
        ]

        read_only_fields = [
            "id",
            "restaurant",
            "created_at",
            "updated_at",
        ]

    def create(self, validated_data):
        validated_data["restaurant"] = get_restaurant(self)
        return super().create(validated_data)


# ---------------------------------------------------------
# INVENTORY ITEMS
# ---------------------------------------------------------

class InventoryItemSerializer(serializers.ModelSerializer):
    restaurant = serializers.PrimaryKeyRelatedField(
        read_only=True
    )

    unit_display = serializers.CharField(
        source="get_unit_display",
        read_only=True,
    )

    class Meta:
        model = InventoryItem
        fields = [
            "id",
            "restaurant",
            "name",
            "sku",
            "description",
            "category",
            "unit",
            "unit_display",
            "reorder_level",
            "is_active",
            "created_at",
            "updated_at",
        ]

        read_only_fields = [
            "id",
            "restaurant",
            "created_at",
            "updated_at",
        ]

    def validate_sku(self, value):
        restaurant = get_restaurant(self)

        if not value:
            return value

        queryset = InventoryItem.objects.filter(
            restaurant=restaurant,
            sku=value,
        )

        if self.instance:
            queryset = queryset.exclude(
                pk=self.instance.pk
            )

        if queryset.exists():
            raise serializers.ValidationError(
                "This SKU is already in use by this restaurant."
            )

        return value

    def create(self, validated_data):
        validated_data["restaurant"] = get_restaurant(self)
        return super().create(validated_data)


# ---------------------------------------------------------
# STOCK LEVELS
# ---------------------------------------------------------

class StockLevelSerializer(serializers.ModelSerializer):
    inventory_item_name = serializers.CharField(
        source="inventory_item.name",
        read_only=True,
    )

    branch_name = serializers.CharField(
        source="branch.name",
        read_only=True,
    )

    unit = serializers.CharField(
        source="inventory_item.unit",
        read_only=True,
    )

    class Meta:
        model = StockLevel
        fields = [
            "id",
            "inventory_item",
            "inventory_item_name",
            "branch",
            "branch_name",
            "quantity",
            "unit",
            "updated_at",
        ]

        read_only_fields = fields


# ---------------------------------------------------------
# PURCHASE ITEMS
# ---------------------------------------------------------

class PurchaseItemSerializer(serializers.ModelSerializer):
    inventory_item_name = serializers.CharField(
        source="inventory_item.name",
        read_only=True,
    )

    line_total = serializers.DecimalField(
        max_digits=16,
        decimal_places=2,
        read_only=True,
    )

    class Meta:
        model = PurchaseItem
        fields = [
            "id",
            "inventory_item",
            "inventory_item_name",
            "quantity",
            "unit_cost",
            "line_total",
        ]

        read_only_fields = [
            "id",
            "inventory_item_name",
            "line_total",
        ]


# ---------------------------------------------------------
# PURCHASES
# ---------------------------------------------------------

class PurchaseSerializer(serializers.ModelSerializer):
    restaurant = serializers.PrimaryKeyRelatedField(
        read_only=True
    )

    supplier_name = serializers.CharField(
        source="supplier.name",
        read_only=True,
    )

    branch_name = serializers.CharField(
        source="branch.name",
        read_only=True,
    )

    status_display = serializers.CharField(
        source="get_status_display",
        read_only=True,
    )

    items = PurchaseItemSerializer(many=True)

    total_cost = serializers.DecimalField(
        max_digits=18,
        decimal_places=2,
        read_only=True,
    )

    class Meta:
        model = Purchase
        fields = [
            "id",
            "restaurant",
            "supplier",
            "supplier_name",
            "branch",
            "branch_name",
            "reference",
            "status",
            "status_display",
            "purchase_date",
            "notes",
            "items",
            "total_cost",
            "created_by",
            "created_at",
            "updated_at",
        ]

        read_only_fields = [
            "id",
            "restaurant",
            "status",
            "status_display",
            "supplier_name",
            "branch_name",
            "total_cost",
            "created_by",
            "created_at",
            "updated_at",
        ]

    def validate(self, attrs):
        restaurant = get_restaurant(self)

        supplier = attrs.get(
            "supplier",
            self.instance.supplier if self.instance else None,
        )

        branch = attrs.get(
            "branch",
            self.instance.branch if self.instance else None,
        )

        # Validate supplier ownership and activity.
        if supplier:
            if supplier.restaurant_id != restaurant.id:
                raise serializers.ValidationError({
                    "supplier": (
                        "This supplier does not belong "
                        "to this restaurant."
                    )
                })

            if not supplier.is_active:
                raise serializers.ValidationError({
                    "supplier": "This supplier is inactive."
                })

        # Validate branch ownership and activity.
        if branch:
            if branch.restaurant_id != restaurant.id:
                raise serializers.ValidationError({
                    "branch": (
                        "This branch does not belong "
                        "to this restaurant."
                    )
                })

            if not branch.is_active:
                raise serializers.ValidationError({
                    "branch": "This branch is inactive."
                })

        # Only draft purchases can be edited.
        if self.instance and self.instance.status != "draft":
            raise serializers.ValidationError(
                "Only draft purchases can be edited."
            )

        items = attrs.get("items")

        if items is not None:
            if not items:
                raise serializers.ValidationError({
                    "items": (
                        "A purchase must contain at least one item."
                    )
                })

            item_ids = [
                item["inventory_item"].id
                for item in items
            ]

            if len(item_ids) != len(set(item_ids)):
                raise serializers.ValidationError({
                    "items": (
                        "An inventory item can only appear "
                        "once per purchase."
                    )
                })

            for item in items:
                inventory_item = item["inventory_item"]

                if inventory_item.restaurant_id != restaurant.id:
                    raise serializers.ValidationError({
                        "items": (
                            f"{inventory_item.name} does not belong "
                            "to this restaurant."
                        )
                    })

                if not inventory_item.is_active:
                    raise serializers.ValidationError({
                        "items": (
                            f"{inventory_item.name} is inactive."
                        )
                    })

        return attrs

    @transaction.atomic
    def create(self, validated_data):
        items_data = validated_data.pop("items")

        validated_data["restaurant"] = get_restaurant(self)

        request = self.context.get("request")

        if request and request.user.is_authenticated:
            validated_data["created_by"] = request.user

        purchase = Purchase.objects.create(
            **validated_data
        )

        for item_data in items_data:
            PurchaseItem.objects.create(
                purchase=purchase,
                **item_data,
            )

        return purchase

    @transaction.atomic
    def update(self, instance, validated_data):
        items_data = validated_data.pop("items", None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        instance.save()

        if items_data is not None:
            instance.items.all().delete()

            for item_data in items_data:
                PurchaseItem.objects.create(
                    purchase=instance,
                    **item_data,
                )

        return instance


# ---------------------------------------------------------
# STOCK MOVEMENTS
# ---------------------------------------------------------

class StockMovementSerializer(serializers.ModelSerializer):
    inventory_item_name = serializers.CharField(
        source="inventory_item.name",
        read_only=True,
    )

    branch_name = serializers.CharField(
        source="branch.name",
        read_only=True,
    )

    movement_type_display = serializers.CharField(
        source="get_movement_type_display",
        read_only=True,
    )

    created_by_email = serializers.EmailField(
        source="created_by.email",
        read_only=True,
    )

    class Meta:
        model = StockMovement
        fields = [
            "id",
            "restaurant",
            "inventory_item",
            "inventory_item_name",
            "branch",
            "branch_name",
            "movement_type",
            "movement_type_display",
            "quantity",
            "reference",
            "notes",
            "created_by",
            "created_by_email",
            "created_at",
        ]

        read_only_fields = fields


# ---------------------------------------------------------
# RECIPE INGREDIENTS
# ---------------------------------------------------------

class RecipeIngredientSerializer(serializers.ModelSerializer):
    menu_item_name = serializers.CharField(
        source="menu_item.name",
        read_only=True,
    )

    inventory_item_name = serializers.CharField(
        source="inventory_item.name",
        read_only=True,
    )

    unit = serializers.CharField(
        source="inventory_item.unit",
        read_only=True,
    )

    class Meta:
        model = RecipeIngredient
        fields = [
            "id",
            "menu_item",
            "menu_item_name",
            "inventory_item",
            "inventory_item_name",
            "quantity",
            "unit",
            "notes",
        ]

        read_only_fields = [
            "id",
            "menu_item_name",
            "inventory_item_name",
            "unit",
        ]

    def validate(self, attrs):
        restaurant = get_restaurant(self)

        menu_item = attrs.get(
            "menu_item",
            self.instance.menu_item if self.instance else None,
        )

        inventory_item = attrs.get(
            "inventory_item",
            self.instance.inventory_item if self.instance else None,
        )

        if menu_item and menu_item.restaurant_id != restaurant.id:
            raise serializers.ValidationError({
                "menu_item": (
                    "This menu item does not belong "
                    "to this restaurant."
                )
            })

        if inventory_item and inventory_item.restaurant_id != restaurant.id:
            raise serializers.ValidationError({
                "inventory_item": (
                    "This inventory item does not belong "
                    "to this restaurant."
                )
            })

        if menu_item and not menu_item.is_available:
            raise serializers.ValidationError({
                "menu_item": "This menu item is unavailable."
            })

        if inventory_item and not inventory_item.is_active:
            raise serializers.ValidationError({
                "inventory_item": "This inventory item is inactive."
            })

        return attrs