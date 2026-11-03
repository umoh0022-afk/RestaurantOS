from django.db import models

# Create your models here.

import uuid

from django.conf import settings
from django.db import models
from django.db.models import Q


class Payment(models.Model):

    PAYMENT_METHODS = [
        ("cash", "Cash"),
        ("pos", "POS"),
        ("bank_transfer", "Bank Transfer"),
        ("card", "Card"),
        ("mobile_money", "Mobile Money"),
        ("other", "Other"),
    ]

    PAYMENT_STATUSES = [
        ("pending", "Pending"),
        ("completed", "Completed"),
        ("failed", "Failed"),
        ("refunded", "Refunded"),
    ]

    order = models.ForeignKey(
        "orders.Order",
        on_delete=models.PROTECT,
        related_name="payments",
    )

    payment_number = models.CharField(
        max_length=40,
        unique=True,
        blank=True,
        editable=False,
    )

    payment_method = models.CharField(
        max_length=30,
        choices=PAYMENT_METHODS,
    )

    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
    )

    status = models.CharField(
        max_length=20,
        choices=PAYMENT_STATUSES,
        default="pending",
    )

    reference = models.CharField(
        max_length=150,
        blank=True,
    )

    notes = models.TextField(blank=True)

    received_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="restaurant_payments_received",
    )

    paid_at = models.DateTimeField(
        null=True,
        blank=True,
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.CheckConstraint(
                condition=Q(amount__gt=0),
                name="payment_amount_must_be_positive",
            ),
        ]
        indexes = [
            models.Index(fields=["status", "created_at"]),
            models.Index(fields=["order", "status"]),
        ]

    def save(self, *args, **kwargs):
        if not self.payment_number:
            self.payment_number = (
                f"PAY-{uuid.uuid4().hex[:12].upper()}"
            )

        super().save(*args, **kwargs)

    def __str__(self):
        return (
            f"{self.payment_number} - "
            f"{self.amount} - {self.get_status_display()}"
        )
