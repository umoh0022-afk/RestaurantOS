from django.db.models import Sum
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from rest_framework.exceptions import ValidationError

from orders.models import Order
from .models import Payment


@transaction.atomic
def record_payment(
    *,
    order_id,
    restaurant,
    amount,
    payment_method,
    received_by=None,
    reference="",
    notes="",
):
    """
    Records a completed manual payment against an order.

    The order is locked while checking its outstanding balance
    to prevent simultaneous payments from exceeding the order total.
    """

    try:
        order = (
            Order.objects
            .select_for_update(of=("self",))
            .get(
                pk=order_id,
                restaurant=restaurant,
            )
        )
    except Order.DoesNotExist:
        raise ValidationError({
            "order": "Order not found for this restaurant."
        })

    if order.status != "completed":
        raise ValidationError({
            "order": "Only completed orders can receive payments."
        })

    amount = Decimal(str(amount))

    if amount <= 0:
        raise ValidationError({
            "amount": "Payment amount must be greater than zero."
        })

    order_total = Decimal(str(order.subtotal))

    already_paid = (
    Payment.objects
    .filter(order=order, status="completed")
    .aggregate(total=Sum("amount"))["total"]
    or Decimal("0.00")
)
    outstanding = order_total - already_paid

    if outstanding <= 0:
        raise ValidationError({
            "amount": "This order has already been fully paid."
        })

    if amount > outstanding:
        raise ValidationError({
            "amount": (
                f"Payment exceeds the outstanding balance of "
                f"{outstanding}."
            )
        })

    payment = Payment.objects.create(
        order=order,
        amount=amount,
        payment_method=payment_method,
        status="completed",
        reference=reference,
        notes=notes,
        received_by=received_by,
        paid_at=timezone.now(),
    )

    return payment
