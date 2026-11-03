
from django.conf import settings
from django.db import models


class Restaurant(models.Model):
    RESTAURANT_TYPES = [
        ("fine_dining", "Fine Dining"),
        ("casual_dining", "Casual Dining"),
        ("fast_food", "Fast Food"),
        ("cafe", "Cafe"),
        ("bar", "Bar"),
        ("bakery", "Bakery"),
        ("food_truck", "Food Truck"),
        ("other", "Other"),
    ]

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="restaurants",
    )
    name = models.CharField(max_length=255)
    legal_name = models.CharField(max_length=255, blank=True)
    restaurant_type = models.CharField(
        max_length=30,
        choices=RESTAURANT_TYPES,
        default="other",
    )
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=30)
    address = models.TextField()
    city = models.CharField(max_length=100)
    state = models.CharField(max_length=100, blank=True)
    country = models.CharField(max_length=100, default="Nigeria")
    currency = models.CharField(max_length=3, default="NGN")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["owner", "is_active"]),
        ]

    def __str__(self):
        return self.name


class Branch(models.Model):
    restaurant = models.ForeignKey(
        Restaurant,
        on_delete=models.CASCADE,
        related_name="branches",
    )
    name = models.CharField(max_length=255)
    code = models.CharField(max_length=30)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=30, blank=True)
    address = models.TextField()
    city = models.CharField(max_length=100)
    state = models.CharField(max_length=100, blank=True)
    country = models.CharField(max_length=100, default="Nigeria")
    is_main_branch = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["restaurant", "code"],
                name="unique_branch_code_per_restaurant",
            ),
            models.UniqueConstraint(
                fields=["restaurant"],
                condition=models.Q(is_main_branch=True),
                name="one_main_branch_per_restaurant",
            ),
        ]

    def __str__(self):
        return f"{self.name} - {self.restaurant.name}"


class MenuCategory(models.Model):
    restaurant = models.ForeignKey(
        Restaurant,
        on_delete=models.CASCADE,
        related_name="menu_categories",
    )
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    display_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["display_order", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["restaurant", "name"],
                name="unique_menu_category_per_restaurant",
            ),
        ]

    def __str__(self):
        return f"{self.name} - {self.restaurant.name}"


class MenuItem(models.Model):
    restaurant = models.ForeignKey(
        Restaurant,
        on_delete=models.CASCADE,
        related_name="menu_items",
    )
    category = models.ForeignKey(
        MenuCategory,
        on_delete=models.PROTECT,
        related_name="items",
    )
    branches = models.ManyToManyField(
        Branch,
        blank=True,
        related_name="menu_items",
        help_text=(
            "Select branches where this item is available. "
            "Leave empty to make it available across all branches."
        ),
    )

    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    image = models.ImageField(
        upload_to="menu_items/",
        blank=True,
        null=True,
    )

    price = models.DecimalField(
        max_digits=12,
        decimal_places=2,
    )

    is_available = models.BooleanField(default=True)
    preparation_time = models.PositiveIntegerField(
        default=15,
        help_text="Estimated preparation time in minutes.",
    )

    display_order = models.PositiveIntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["display_order", "name"]
        indexes = [
            models.Index(fields=["restaurant", "is_available"]),
            models.Index(fields=["category", "is_available"]),
        ]

    def __str__(self):
        return f"{self.name} - {self.restaurant.name}"
