
from django.contrib import admin

from .models import Order, OrderItem


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0
    readonly_fields = (
        "unit_price",
        "line_total",
    )


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = (
        "order_number",
        "restaurant",
        "branch",
        "order_type",
        "status",
        "created_at",
        "completed_at",
    )

    list_filter = (
        "status",
        "order_type",
        "restaurant",
        "created_at",
    )

    search_fields = (
        "order_number",
        "customer_name",
        "customer_phone",
        "restaurant__name",
    )

    readonly_fields = (
        "order_number",
        "completed_at",
        "stock_deducted_at",
        "created_at",
        "updated_at",
    )

    inlines = [OrderItemInline]

    ordering = ("-created_at",)


@admin.register(OrderItem)
class OrderItemAdmin(admin.ModelAdmin):
    list_display = (
        "order",
        "menu_item",
        "quantity",
        "unit_price",
        "line_total",
    )

    search_fields = (
        "order__order_number",
        "menu_item__name",
    )

    readonly_fields = (
        "unit_price",
        "line_total",
    )
