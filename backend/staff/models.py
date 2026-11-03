from django.conf import settings
from django.db import models


class StaffMember(models.Model):
    ROLE_CHOICES = [
        ("manager", "Manager"),
        ("cashier", "Cashier"),
        ("waiter", "Waiter"),
        ("kitchen_staff", "Kitchen Staff"),
    ]

    restaurant = models.ForeignKey(
        "restaurants.Restaurant",
        on_delete=models.CASCADE,
        related_name="staff_members",
    )

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="staff_profile",
    )

    branches = models.ManyToManyField(
        "restaurants.Branch",
        blank=True,
        related_name="staff_members",
    )

    role = models.CharField(
        max_length=30,
        choices=ROLE_CHOICES,
        default="waiter",
    )

    phone = models.CharField(max_length=30, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["user__first_name", "user__email"]
        indexes = [
            models.Index(fields=["restaurant", "role"]),
        ]

    @property
    def is_active(self):
        return self.user.is_active

    def __str__(self):
        return f"{self.user.email} - {self.restaurant.name}"