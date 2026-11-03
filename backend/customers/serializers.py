from rest_framework import serializers

from .models import Customer


class CustomerSerializer(serializers.ModelSerializer):

    class Meta:
        model = Customer

        fields = [
            "id",
            "restaurant",
            "full_name",
            "phone",
            "email",
            "birthday",
            "address",
            "notes",
            "created_at",
            "updated_at",
        ]

        read_only_fields = [
            "id",
            "restaurant",
            "created_at",
            "updated_at",
        ]

    def validate_full_name(self, value):
        value = value.strip()

        if not value:
            raise serializers.ValidationError(
                "Customer name is required."
            )

        return value

    def validate_phone(self, value):
        return "".join(value.split())

    def validate(self, attrs):
        restaurant = self.context.get("restaurant")

        if restaurant is None:
            raise serializers.ValidationError(
                "Restaurant context is required."
            )

        phone = attrs.get(
            "phone",
            getattr(self.instance, "phone", ""),
        )

        if phone:
            queryset = Customer.objects.filter(
                restaurant=restaurant,
                phone=phone,
            )

            if self.instance:
                queryset = queryset.exclude(
                    pk=self.instance.pk
                )

            if queryset.exists():
                raise serializers.ValidationError({
                    "phone": (
                        "A customer with this phone number "
                        "already exists in this restaurant."
                    )
                })

        return attrs