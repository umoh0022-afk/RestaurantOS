from django.db import models
from django.db.models import Q

from restaurants.models import Restaurant


class Customer(models.Model):
    restaurant = models.ForeignKey(
        Restaurant,
        on_delete=models.CASCADE,
        related_name="customers",
    )

    full_name = models.CharField(max_length=150)

    phone = models.CharField(
        max_length=30,
        blank=True,
    )

    email = models.EmailField(
        blank=True,
    )

    birthday = models.DateField(
        null=True,
        blank=True,
    )

    address = models.TextField(
        blank=True,
    )

    notes = models.TextField(
        blank=True,
    )

    created_at = models.DateTimeField(
        auto_now_add=True,
    )

    updated_at = models.DateTimeField(
        auto_now=True,
    )

    class Meta:
        ordering = ["full_name"]
        constraints = [
            models.UniqueConstraint(
                fields=["restaurant", "phone"],
                condition=~Q(phone=""),
                name="unique_customer_phone_per_restaurant",
            ),
        ]
        indexes = [
            models.Index(
                fields=["restaurant", "full_name"],
            ),
            models.Index(
                fields=["restaurant", "phone"],
            ),
        ]

    def save(self, *args, **kwargs):
        self.phone = "".join(
            self.phone.split()
        )

        super().save(*args, **kwargs)

    def __str__(self):
        return self.full_name