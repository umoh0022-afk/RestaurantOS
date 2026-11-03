
from collections import defaultdict
from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from inventory.models import (
    RecipeIngredient,
    StockLevel,
    StockMovement,
)
from .models import Order


@transaction.atomic
def complete_order(order_id):
    """
    Complete an order and deduct its recipe ingredients
    from the stock at the order's branch.

    All stock deductions and movements are atomic.
    """

    # Lock the order to prevent simultaneous completion.
    try:
        order = (
            Order.objects.select_related(
    "branch"
).select_for_update(of=("self",)).get(pk=order_id)
        )
    except Order.DoesNotExist:
        raise ValidationError({
            "order": "Order not found."
        })

    if order.status == "completed" or order.stock_deducted_at:
        raise ValidationError({
            "order": "This order has already been completed."
        })

    if order.status == "cancelled":
        raise ValidationError({
            "order": "A cancelled order cannot be completed."
        })

    if not order.branch.is_active:
        raise ValidationError({
            "branch": "The order's branch is inactive."
        })

    order_items = list(
        order.items.select_related("menu_item").all()
    )

    if not order_items:
        raise ValidationError({
            "items": "Cannot complete an order without items."
        })

    # Calculate total ingredient requirements.
    required_stock = defaultdict(lambda: Decimal("0"))

    for order_item in order_items:
        recipe_ingredients = RecipeIngredient.objects.filter(
            menu_item=order_item.menu_item
        )

        for recipe in recipe_ingredients:
            required_stock[recipe.inventory_item_id] += (
                recipe.quantity * order_item.quantity
            )

    # Lock all existing stock records in a consistent order.
    stock_levels = list(
        StockLevel.objects
        .select_for_update()
        .filter(
            branch=order.branch,
            inventory_item_id__in=list(required_stock.keys()),
        )
        .select_related("inventory_item")
        .order_by("inventory_item_id")
    )

    stock_by_item = {
        stock.inventory_item_id: stock
        for stock in stock_levels
    }

    # Validate every ingredient before making any deduction.
    insufficient = []

    for inventory_item_id, required_quantity in required_stock.items():
        stock = stock_by_item.get(inventory_item_id)

        if stock is None:
            item_name = next(
                (
                    recipe.inventory_item.name
                    for recipe in RecipeIngredient.objects.filter(
                        inventory_item_id=inventory_item_id
                    ).select_related("inventory_item")
                ),
                f"Inventory item #{inventory_item_id}",
            )

            insufficient.append({
                "item": item_name,
                "required": str(required_quantity),
                "available": "0",
            })
            continue

        if stock.quantity < required_quantity:
            insufficient.append({
                "item": stock.inventory_item.name,
                "required": str(required_quantity),
                "available": str(stock.quantity),
            })

    if insufficient:
        raise ValidationError({
            "insufficient_stock": insufficient,
            "message": (
                "The order cannot be completed because "
                "there is insufficient stock."
            ),
        })

    # All ingredients are available. Deduct stock.
    for inventory_item_id, required_quantity in required_stock.items():
        stock = stock_by_item[inventory_item_id]

        stock.quantity -= required_quantity
        stock.save(update_fields=["quantity", "updated_at"])

        StockMovement.objects.create(
            restaurant=order.restaurant,
            inventory_item=stock.inventory_item,
            branch=order.branch,
            movement_type="usage",
            quantity=required_quantity,
            reference=order.order_number,
            notes=(
                f"Ingredient usage for completed order "
                f"{order.order_number}"
            ),
            created_by=order.created_by,
        )

    # Mark the order completed only after successful deductions.
    now = timezone.now()

    order.status = "completed"
    order.completed_at = now
    order.stock_deducted_at = now

    order.save(update_fields=[
        "status",
        "completed_at",
        "stock_deducted_at",
        "updated_at",
    ])

    return order

