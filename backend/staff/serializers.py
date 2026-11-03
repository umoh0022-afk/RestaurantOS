from django.contrib.auth import get_user_model
from django.db import transaction

from rest_framework import serializers

from restaurants.models import Branch
from .models import StaffMember


User = get_user_model()


class StaffMemberSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(source="user.email")

    first_name = serializers.CharField(
        source="user.first_name",
        required=False,
        allow_blank=True,
    )

    last_name = serializers.CharField(
        source="user.last_name",
        required=False,
        allow_blank=True,
    )

    password = serializers.CharField(
        write_only=True,
        required=False,
        min_length=8,
    )

    is_active = serializers.BooleanField(
        source="user.is_active",
        required=False,
    )

    branch_ids = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=Branch.objects.all(),
        source="branches",
        required=False,
    )

    branch_names = serializers.SerializerMethodField()

    role_display = serializers.CharField(
        source="get_role_display",
        read_only=True,
    )

    class Meta:
        model = StaffMember
        fields = [
            "id",
            "email",
            "first_name",
            "last_name",
            "password",
            "phone",
            "role",
            "role_display",
            "branch_ids",
            "branch_names",
            "is_active",
            "created_at",
            "updated_at",
        ]

        read_only_fields = [
            "id",
            "created_at",
            "updated_at",
        ]

    def get_branch_names(self, obj):
        return list(
            obj.branches.values_list("name", flat=True)
        )

    def validate_email(self, value):
        queryset = User.objects.filter(email__iexact=value)

        if self.instance:
            queryset = queryset.exclude(
                pk=self.instance.user_id
            )

        if queryset.exists():
            raise serializers.ValidationError(
                "An account with this email address already exists."
            )

        return value

    def validate(self, attrs):
        restaurant = self.context["restaurant"]
        request = self.context["request"]

        branches = attrs.get("branches", [])

        # Every assigned branch must belong to this restaurant.
        for branch in branches:
            if branch.restaurant_id != restaurant.id:
                raise serializers.ValidationError({
                    "branch_ids": (
                        "All selected branches must belong "
                        "to this restaurant."
                    )
                })

        if self.instance is None and not attrs.get("password"):
            raise serializers.ValidationError({
                "password": "A password is required for new staff."
            })

        # Managers cannot create or promote another manager.
        manager = StaffMember.objects.filter(
            user=request.user,
            restaurant=restaurant,
            role="manager",
            user__is_active=True,
        ).exists()

        if manager and attrs.get("role") == "manager":
            raise serializers.ValidationError({
                "role": (
                    "Only the restaurant owner can assign "
                    "the manager role."
                )
            })

        return attrs

    @transaction.atomic
    def create(self, validated_data):
        user_data = validated_data.pop("user", {})
        password = validated_data.pop("password")
        branches = validated_data.pop("branches", [])

        user = User.objects.create_user(
            email=user_data["email"],
            password=password,
            first_name=user_data.get("first_name", ""),
            last_name=user_data.get("last_name", ""),
            is_active=user_data.get("is_active", True),
            is_staff=False,
            is_superuser=False,
        )

        staff = StaffMember.objects.create(
            user=user,
            restaurant=self.context["restaurant"],
            **validated_data,
        )

        staff.branches.set(branches)

        return staff

    @transaction.atomic
    def update(self, instance, validated_data):
        user_data = validated_data.pop("user", {})
        password = validated_data.pop("password", None)
        branches = validated_data.pop("branches", None)

        for field, value in user_data.items():
            setattr(instance.user, field, value)

        if password:
            instance.user.set_password(password)

        instance.user.save()

        for field, value in validated_data.items():
            setattr(instance, field, value)

        instance.save()

        if branches is not None:
            instance.branches.set(branches)

        return instance