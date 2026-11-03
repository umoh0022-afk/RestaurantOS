from django.contrib import admin
from .models import Payment


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = (
        "payment_number",
        "order",
        "payment_method",
        "amount",
        "status",
        "paid_at",
    )

    list_filter = (
        "payment_method",
        "status",
        "created_at",
    )

    search_fields = (
        "payment_number",
        "reference",
        "order__order_number",
        "order__customer_name",
    )

    readonly_fields = (
        "payment_number",
        "created_at",
        "updated_at",
    )

    ordering = ("-created_at",)