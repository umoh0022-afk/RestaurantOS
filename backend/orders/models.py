
import uuid

from django.conf import settings
from django.db import models
from django.db.models import Q


class Order(models.Model):
    ORDER_TYPES = [
        ("dine_in", "Dine In"),
        ("takeaway", "Takeaway"),
        ("delivery", "Delivery"),
    ]

    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("confirmed", "Confirmed"),
        ("preparing", "Preparing"),
        ("ready", "Ready"),
        ("completed", "Completed"),
        ("cancelled", "Cancelled"),
    ]

    restaurant = models.ForeignKey(
        "restaurants.Restaurant",
        on_delete=models.CASCADE,
        related_name="orders",
    )

    branch = models.ForeignKey(
        "restaurants.Branch",
        on_delete=models.PROTECT,
        related_name="orders",
    )

    # Link each order to a permanent customer record.
    # Nullable to preserve existing orders.
    customer = models.ForeignKey(
        "customers.Customer",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="orders",
    )

    order_number = models.CharField(
        max_length=30,
        blank=True,
        editable=False,
    )

    order_type = models.CharField(
        max_length=20,
        choices=ORDER_TYPES,
        default="dine_in",
    )

    # Retained for backward compatibility and order snapshots.
    customer_name = models.CharField(
        max_length=200,
        blank=True,
    )

    customer_phone = models.CharField(
        max_length=30,
        blank=True,
    )

    table_number = models.CharField(
        max_length=30,
        blank=True,
    )

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="pending",
    )

    notes = models.TextField(blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="restaurant_orders_created",
    )

    completed_at = models.DateTimeField(
        null=True,
        blank=True,
    )

    stock_deducted_at = models.DateTimeField(
        null=True,
        blank=True,
        editable=False,
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

        constraints = [
            models.UniqueConstraint(
                fields=["restaurant", "order_number"],
                condition=~Q(order_number=""),
                name="unique_order_number_per_restaurant",
            ),
        ]

        indexes = [
            models.Index(fields=["restaurant", "status"]),
            models.Index(fields=["branch", "created_at"]),
            models.Index(fields=["restaurant", "created_at"]),
            models.Index(fields=["customer", "created_at"]),
        ]

    def save(self, *args, **kwargs):
        if not self.order_number:
            self.order_number = (
                f"ORD-{uuid.uuid4().hex[:12].upper()}"
            )

        self.customer_phone = "".join(
            self.customer_phone.split()
        )

        super().save(*args, **kwargs)

    def __str__(self):
        return self.order_number

    @property
    def subtotal(self):
        return sum(
            (item.line_total for item in self.items.all()),
            start=0,
        )


class OrderItem(models.Model):
    order = models.ForeignKey(
        Order,
        on_delete=models.CASCADE,
        related_name="items",
    )

    menu_item = models.ForeignKey(
        "restaurants.MenuItem",
        on_delete=models.PROTECT,
        related_name="order_entries",
    )

    quantity = models.PositiveIntegerField()

    unit_price = models.DecimalField(
        max_digits=12,
        decimal_places=2,
    )

    line_total = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=0,
    )

    class Meta:
        ordering = ["id"]

        constraints = [
            models.CheckConstraint(
                condition=Q(quantity__gt=0),
                name="order_item_quantity_must_be_positive",
            ),
            models.CheckConstraint(
                condition=Q(unit_price__gte=0),
                name="order_item_price_cannot_be_negative",
            ),
        ]

    def save(self, *args, **kwargs):
        self.line_total = self.unit_price * self.quantity
        super().save(*args, **kwargs)

    def __str__(self):
        return (
            f"{self.menu_item.name} x {self.quantity} "
            f"({self.order.order_number})"
        )
