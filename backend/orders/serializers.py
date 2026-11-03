from django.db import transaction

from rest_framework import serializers

from restaurants.models import Branch
from customers.models import Customer

from .models import Order, OrderItem


class OrderItemSerializer(serializers.ModelSerializer):
    menu_item_name = serializers.CharField(
        source="menu_item.name",
        read_only=True,
    )

    class Meta:
        model = OrderItem
        fields = [
            "id",
            "menu_item",
            "menu_item_name",
            "quantity",
            "unit_price",
            "line_total",
        ]

        read_only_fields = [
            "id",
            "unit_price",
            "line_total",
            "menu_item_name",
        ]

    def validate_quantity(self, value):
        if value <= 0:
            raise serializers.ValidationError(
                "Quantity must be greater than zero."
            )

        return value


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True)

    branch_name = serializers.CharField(
        source="branch.name",
        read_only=True,
    )

    customer_id = serializers.IntegerField(
        source="customer.id",
        read_only=True,
    )

    subtotal = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        read_only=True,
    )

    class Meta:
        model = Order

        fields = [
            "id",
            "order_number",
            "restaurant",
            "branch",
            "branch_name",
            "customer_id",
            "order_type",
            "customer_name",
            "customer_phone",
            "table_number",
            "status",
            "notes",
            "items",
            "subtotal",
            "completed_at",
            "stock_deducted_at",
            "created_at",
            "updated_at",
        ]

        read_only_fields = [
            "id",
            "order_number",
            "restaurant",
            "customer_id",
            "status",
            "subtotal",
            "completed_at",
            "stock_deducted_at",
            "created_at",
            "updated_at",
        ]

    def validate(self, attrs):
        restaurant = self.context["restaurant"]
        access = self.context["access"]

        branch = attrs.get("branch")

        if not branch:
            raise serializers.ValidationError({
                "branch": "A branch must be selected for this order."
            })

        if (
            branch.restaurant_id != restaurant.id
            or not branch.is_active
        ):
            raise serializers.ValidationError({
                "branch": (
                    "Select an active branch belonging "
                    "to this restaurant."
                )
            })

        # Staff can only create orders for assigned branches.
        if not access["is_owner"]:
            staff_member = access["staff_member"]

            if not staff_member.branches.filter(
                pk=branch.pk
            ).exists():
                raise serializers.ValidationError({
                    "branch": (
                        "You do not have access to the selected branch."
                    )
                })

        items = attrs.get("items")

        if items is not None:
            if not items:
                raise serializers.ValidationError({
                    "items": (
                        "An order must contain at least one item."
                    )
                })

            for item_data in items:
                menu_item = item_data["menu_item"]

                if (
                    menu_item.restaurant_id != restaurant.id
                    or not menu_item.is_available
                ):
                    raise serializers.ValidationError({
                        "items": (
                            f"{menu_item.name} is unavailable "
                            "for this restaurant."
                        )
                    })

                if (
                    menu_item.branches.exists()
                    and not menu_item.branches.filter(
                        pk=branch.pk
                    ).exists()
                ):
                    raise serializers.ValidationError({
                        "items": (
                            f"{menu_item.name} is not available "
                            "at the selected branch."
                        )
                    })

        return attrs

    @transaction.atomic
    def create(self, validated_data):
        items_data = validated_data.pop("items")
        restaurant = self.context["restaurant"]

        customer_name = validated_data.get(
            "customer_name",
            "",
        ).strip()

        customer_phone = "".join(
            validated_data.get(
                "customer_phone",
                "",
            ).split()
        )

        customer = None

        if customer_phone:
            customer, created = Customer.objects.get_or_create(
                restaurant=restaurant,
                phone=customer_phone,
                defaults={
                    "full_name": customer_name or "Walk-in Customer",
                },
            )

        elif customer_name:
            customer = Customer.objects.create(
                restaurant=restaurant,
                full_name=customer_name,
            )

        order = Order.objects.create(
            restaurant=restaurant,
            customer=customer,
            customer_name=customer_name,
            customer_phone=customer_phone,
            created_by=self.context["request"].user,
            **{
                key: value
                for key, value in validated_data.items()
                if key not in [
                    "customer_name",
                    "customer_phone",
                ]
            },
        )

        for item_data in items_data:
            menu_item = item_data["menu_item"]

            OrderItem.objects.create(
                order=order,
                menu_item=menu_item,
                quantity=item_data["quantity"],
                unit_price=menu_item.price,
            )

        return order