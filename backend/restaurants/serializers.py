
from django.db import transaction
from rest_framework import serializers

from .models import Restaurant, Branch


class BranchSerializer(serializers.ModelSerializer):
    class Meta:
        model = Branch
        fields = [
            "id",
            "restaurant",
            "name",
            "code",
            "email",
            "phone",
            "address",
            "city",
            "state",
            "country",
            "is_main_branch",
            "is_active",
            "created_at",
            "updated_at",
        ]

        read_only_fields = [
            "id",
            "restaurant",
            "is_main_branch",
            "created_at",
            "updated_at",
        ]


class RestaurantSerializer(serializers.ModelSerializer):
    owner = serializers.ReadOnlyField(source="owner.email")

    class Meta:
        model = Restaurant
        fields = [
            "id",
            "owner",
            "name",
            "legal_name",
            "restaurant_type",
            "email",
            "phone",
            "address",
            "city",
            "state",
            "country",
            "currency",
            "is_active",
            "created_at",
            "updated_at",
        ]

        read_only_fields = [
            "id",
            "owner",
            "is_active",
            "created_at",
            "updated_at",
        ]

    @transaction.atomic
    def create(self, validated_data):
        request = self.context["request"]

        restaurant = Restaurant.objects.create(
            owner=request.user,
            **validated_data,
        )

        Branch.objects.create(
            restaurant=restaurant,
            name="Main Branch",
            code="MAIN",
            email=restaurant.email,
            phone=restaurant.phone,
            address=restaurant.address,
            city=restaurant.city,
            state=restaurant.state,
            country=restaurant.country,
            is_main_branch=True,
        )

        return restaurant
