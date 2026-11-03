
from rest_framework import serializers

from .models import Payment


class PaymentSerializer(serializers.ModelSerializer):
    order_number = serializers.CharField(
        source="order.order_number",
        read_only=True,
    )

    order_total = serializers.SerializerMethodField()

    class Meta:
        model = Payment
        fields = [
            "id",
            "payment_number",
            "order",
            "order_number",
            "order_total",
            "payment_method",
            "amount",
            "status",
            "reference",
            "notes",
            "received_by",
            "paid_at",
            "created_at",
            "updated_at",
        ]

        read_only_fields = [
            "id",
            "payment_number",
            "order_number",
            "order_total",
            "status",
            "received_by",
            "paid_at",
            "created_at",
            "updated_at",
        ]

    def get_order_total(self, obj):
        return obj.order.subtotal

    def validate_order(self, order):
        restaurant = self.context.get("restaurant")

        if restaurant is None:
            raise serializers.ValidationError(
                "Restaurant context is required."
            )

        if order.restaurant_id != restaurant.id:
            raise serializers.ValidationError(
                "This order does not belong to this restaurant."
            )

        return order

    def validate_amount(self, amount):
        if amount <= 0:
            raise serializers.ValidationError(
                "Payment amount must be greater than zero."
            )

        return amount
