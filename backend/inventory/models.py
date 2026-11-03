
from django.conf import settings
from django.db import models
from django.db.models import Q


class Supplier(models.Model):
    """Suppliers registered under a restaurant."""

    restaurant = models.ForeignKey(
        "restaurants.Restaurant",
        on_delete=models.CASCADE,
        related_name="suppliers",
    )
    name = models.CharField(max_length=200)
    contact_person = models.CharField(max_length=150, blank=True)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=30, blank=True)
    address = models.TextField(blank=True)
    notes = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        indexes = [
            models.Index(fields=["restaurant", "is_active"]),
        ]

    def __str__(self):
        return self.name


class InventoryItem(models.Model):
    """A stock item or ingredient owned by a restaurant."""

    UNIT_CHOICES = [
        ("kg", "Kilogram"),
        ("g", "Gram"),
        ("litre", "Litre"),
        ("ml", "Millilitre"),
        ("piece", "Piece"),
        ("pack", "Pack"),
        ("bottle", "Bottle"),
        ("carton", "Carton"),
        ("dozen", "Dozen"),
        ("bag", "Bag"),
        ("other", "Other"),
    ]

    restaurant = models.ForeignKey(
        "restaurants.Restaurant",
        on_delete=models.CASCADE,
        related_name="inventory_items",
    )
    name = models.CharField(max_length=200)
    sku = models.CharField(max_length=60, blank=True)
    description = models.TextField(blank=True)
    category = models.CharField(max_length=100, blank=True)
    unit = models.CharField(
        max_length=20,
        choices=UNIT_CHOICES,
        default="piece",
    )
    reorder_level = models.DecimalField(
        max_digits=14,
        decimal_places=3,
        default=0,
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["restaurant", "sku"],
                condition=~Q(sku=""),
                name="unique_inventory_sku_per_restaurant",
            ),
        ]
        indexes = [
            models.Index(fields=["restaurant", "is_active"]),
            models.Index(fields=["restaurant", "category"]),
        ]

    def __str__(self):
        return f"{self.name} ({self.get_unit_display()})"


class StockLevel(models.Model):
    """Current quantity of an inventory item at a particular branch."""

    inventory_item = models.ForeignKey(
        InventoryItem,
        on_delete=models.CASCADE,
        related_name="stock_levels",
    )
    branch = models.ForeignKey(
        "restaurants.Branch",
        on_delete=models.CASCADE,
        related_name="stock_levels",
    )
    quantity = models.DecimalField(
        max_digits=14,
        decimal_places=3,
        default=0,
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["inventory_item__name"]
        constraints = [
            models.UniqueConstraint(
                fields=["inventory_item", "branch"],
                name="unique_stock_item_per_branch",
            ),
            models.CheckConstraint(
                condition=Q(quantity__gte=0),
                name="stock_quantity_cannot_be_negative",
            ),
        ]
        indexes = [
            models.Index(fields=["branch", "inventory_item"]),
        ]

    def __str__(self):
        return (
            f"{self.inventory_item.name} - "
            f"{self.branch.name}: {self.quantity}"
        )


class Purchase(models.Model):
    """A stock purchase from a supplier."""

    STATUS_CHOICES = [
        ("draft", "Draft"),
        ("received", "Received"),
        ("cancelled", "Cancelled"),
    ]

    restaurant = models.ForeignKey(
        "restaurants.Restaurant",
        on_delete=models.CASCADE,
        related_name="inventory_purchases",
    )
    supplier = models.ForeignKey(
        Supplier,
        on_delete=models.PROTECT,
        related_name="purchases",
    )
    branch = models.ForeignKey(
        "restaurants.Branch",
        on_delete=models.PROTECT,
        related_name="inventory_purchases",
    )
    reference = models.CharField(max_length=100, blank=True)
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="draft",
    )
    purchase_date = models.DateField()
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="inventory_purchases_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-purchase_date", "-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["restaurant", "reference"],
                condition=~Q(reference=""),
                name="unique_purchase_reference_per_restaurant",
            ),
        ]
        indexes = [
            models.Index(fields=["restaurant", "status"]),
            models.Index(fields=["branch", "purchase_date"]),
        ]

    def __str__(self):
        return self.reference or f"Purchase #{self.pk}"

    @property
    def total_cost(self):
        return sum(
            (item.line_total for item in self.items.all()),
            start=0,
        )


class PurchaseItem(models.Model):
    """An individual inventory item on a purchase."""

    purchase = models.ForeignKey(
        Purchase,
        on_delete=models.CASCADE,
        related_name="items",
    )
    inventory_item = models.ForeignKey(
        InventoryItem,
        on_delete=models.PROTECT,
        related_name="purchase_entries",
    )
    quantity = models.DecimalField(
        max_digits=14,
        decimal_places=3,
    )
    unit_cost = models.DecimalField(
        max_digits=14,
        decimal_places=2,
    )

    class Meta:
        ordering = ["id"]
        constraints = [
            models.CheckConstraint(
                condition=Q(quantity__gt=0),
                name="purchase_item_quantity_must_be_positive",
            ),
            models.CheckConstraint(
                condition=Q(unit_cost__gte=0),
                name="purchase_item_cost_cannot_be_negative",
            ),
        ]

    def __str__(self):
        return f"{self.inventory_item.name} - {self.quantity}"

    @property
    def line_total(self):
        return self.quantity * self.unit_cost


class StockMovement(models.Model):
    """An auditable record of stock entering or leaving a branch."""

    MOVEMENT_TYPES = [
        ("purchase", "Purchase"),
        ("usage", "Usage"),
        ("wastage", "Wastage"),
        ("adjustment", "Adjustment"),
        ("transfer_in", "Transfer In"),
        ("transfer_out", "Transfer Out"),
    ]

    restaurant = models.ForeignKey(
        "restaurants.Restaurant",
        on_delete=models.CASCADE,
        related_name="stock_movements",
    )
    inventory_item = models.ForeignKey(
        InventoryItem,
        on_delete=models.PROTECT,
        related_name="stock_movements",
    )
    branch = models.ForeignKey(
        "restaurants.Branch",
        on_delete=models.PROTECT,
        related_name="stock_movements",
    )
    movement_type = models.CharField(
        max_length=20,
        choices=MOVEMENT_TYPES,
    )
    quantity = models.DecimalField(
        max_digits=14,
        decimal_places=3,
    )
    reference = models.CharField(max_length=150, blank=True)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="stock_movements_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.CheckConstraint(
                condition=Q(quantity__gt=0),
                name="stock_movement_quantity_must_be_positive",
            ),
        ]
        indexes = [
            models.Index(fields=["restaurant", "created_at"]),
            models.Index(fields=["branch", "inventory_item"]),
            models.Index(fields=["movement_type", "created_at"]),
        ]

    def __str__(self):
        return (
            f"{self.get_movement_type_display()}: "
            f"{self.inventory_item.name} ({self.quantity})"
        )


class RecipeIngredient(models.Model):
    """Quantity of an inventory ingredient required by a menu item."""

    menu_item = models.ForeignKey(
        "restaurants.MenuItem",
        on_delete=models.CASCADE,
        related_name="recipe_ingredients",
    )
    inventory_item = models.ForeignKey(
        InventoryItem,
        on_delete=models.PROTECT,
        related_name="used_in_recipes",
    )
    quantity = models.DecimalField(
        max_digits=14,
        decimal_places=3,
    )
    notes = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["inventory_item__name"]
        constraints = [
            models.UniqueConstraint(
                fields=["menu_item", "inventory_item"],
                name="unique_ingredient_per_menu_item",
            ),
            models.CheckConstraint(
                condition=Q(quantity__gt=0),
                name="recipe_ingredient_quantity_must_be_positive",
            ),
        ]

    def __str__(self):
        return (
            f"{self.inventory_item.name} in "
            f"{self.menu_item.name}: {self.quantity}"
        )
