
from django.contrib import admin

from .models import (
    Restaurant,
    Branch,
    MenuCategory,
    MenuItem,
)


class BranchInline(admin.TabularInline):
    model = Branch
    extra = 0


class MenuItemInline(admin.TabularInline):
    model = MenuItem
    extra = 0
    fields = (
        "name",
        "category",
        "price",
        "is_available",
    )


@admin.register(Restaurant)
class RestaurantAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "owner",
        "restaurant_type",
        "city",
        "country",
        "is_active",
        "created_at",
    )

    list_filter = (
        "restaurant_type",
        "is_active",
        "country",
    )

    search_fields = (
        "name",
        "legal_name",
        "owner__email",
        "email",
        "city",
    )

    readonly_fields = (
        "created_at",
        "updated_at",
    )

    inlines = [BranchInline]


@admin.register(Branch)
class BranchAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "code",
        "restaurant",
        "city",
        "is_main_branch",
        "is_active",
    )

    list_filter = (
        "is_main_branch",
        "is_active",
        "country",
    )

    search_fields = (
        "name",
        "code",
        "restaurant__name",
        "city",
    )

    readonly_fields = (
        "created_at",
        "updated_at",
    )


@admin.register(MenuCategory)
class MenuCategoryAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "restaurant",
        "display_order",
        "is_active",
    )

    list_filter = (
        "is_active",
        "restaurant",
    )

    search_fields = (
        "name",
        "restaurant__name",
    )

    inlines = [MenuItemInline]

    readonly_fields = (
        "created_at",
        "updated_at",
    )


@admin.register(MenuItem)
class MenuItemAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "restaurant",
        "category",
        "price",
        "is_available",
    )

    list_filter = (
        "is_available",
        "category",
        "restaurant",
    )

    search_fields = (
        "name",
        "description",
        "restaurant__name",
    )

    filter_horizontal = ("branches",)

    readonly_fields = (
        "created_at",
        "updated_at",
    )
