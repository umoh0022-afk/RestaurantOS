from django.contrib import admin
from .models import (
    Supplier,
    InventoryItem,
    StockLevel,
    Purchase,
    PurchaseItem,
    StockMovement,
    RecipeIngredient,
)


class PurchaseItemInline(admin.TabularInline):
    model = PurchaseItem
    extra = 1


class StockLevelInline(admin.TabularInline):
    model = StockLevel
    extra = 0


@admin.register(Supplier)
class SupplierAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "restaurant",
        "contact_person",
        "phone",
        "is_active",
    )
    list_filter = ("is_active", "restaurant")
    search_fields = ("name", "contact_person", "email", "phone")


@admin.register(InventoryItem)
class InventoryItemAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "restaurant",
        "category",
        "unit",
        "reorder_level",
        "is_active",
    )
    list_filter = ("category", "unit", "is_active", "restaurant")
    search_fields = ("name", "sku", "category")
    inlines = [StockLevelInline]


@admin.register(StockLevel)
class StockLevelAdmin(admin.ModelAdmin):
    list_display = (
        "inventory_item",
        "branch",
        "quantity",
        "updated_at",
    )
    list_filter = ("branch",)
    search_fields = ("inventory_item__name", "branch__name")


@admin.register(Purchase)
class PurchaseAdmin(admin.ModelAdmin):
    list_display = (
        "reference",
        "restaurant",
        "supplier",
        "branch",
        "purchase_date",
        "status",
    )
    list_filter = ("status", "purchase_date", "restaurant")
    search_fields = ("reference", "supplier__name")
    inlines = [PurchaseItemInline]
    readonly_fields = ("created_at", "updated_at")


@admin.register(StockMovement)
class StockMovementAdmin(admin.ModelAdmin):
    list_display = (
        "inventory_item",
        "branch",
        "movement_type",
        "quantity",
        "created_by",
        "created_at",
    )
    list_filter = ("movement_type", "branch", "created_at")
    search_fields = ("inventory_item__name", "reference", "notes")
    readonly_fields = ("created_at",)


@admin.register(RecipeIngredient)
class RecipeIngredientAdmin(admin.ModelAdmin):
    list_display = (
        "menu_item",
        "inventory_item",
        "quantity",
    )
    search_fields = (
        "menu_item__name",
        "inventory_item__name",
    )