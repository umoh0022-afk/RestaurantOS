from rest_framework import serializers

from .models import MenuCategory, MenuItem, Branch


class MenuCategorySerializer(serializers.ModelSerializer):
    item_count = serializers.SerializerMethodField()

    class Meta:
        model = MenuCategory
        fields = [
            "id",
            "name",
            "description",
            "display_order",
            "is_active",
            "item_count",
            "created_at",
            "updated_at",
        ]

        read_only_fields = [
            "id",
            "item_count",
            "created_at",
            "updated_at",
        ]

    def get_item_count(self, obj):
        return obj.items.count()


class MenuItemSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(
        source="category.name",
        read_only=True,
    )

    branch_names = serializers.SerializerMethodField()

    category = serializers.PrimaryKeyRelatedField(
        queryset=MenuCategory.objects.none()
    )

    branches = serializers.PrimaryKeyRelatedField(
        queryset=Branch.objects.none(),
        many=True,
        required=False,
    )

    class Meta:
        model = MenuItem

        fields = [
            "id",
            "name",
            "description",
            "image",
            "price",
            "category",
            "category_name",
            "branches",
            "branch_names",
            "is_available",
            "preparation_time",
            "display_order",
            "created_at",
            "updated_at",
        ]

        read_only_fields = [
            "id",
            "category_name",
            "branch_names",
            "created_at",
            "updated_at",
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

        restaurant = self.context.get("restaurant")

        if restaurant:
            self.fields["category"].queryset = (
                MenuCategory.objects.filter(
                    restaurant=restaurant
                )
            )

            self.fields["branches"].queryset = (
                Branch.objects.filter(
                    restaurant=restaurant,
                    is_active=True,
                )
            )

    def validate_price(self, value):
        if value < 0:
            raise serializers.ValidationError(
                "Price cannot be negative."
            )

        return value

    def validate_preparation_time(self, value):
        if value < 0:
            raise serializers.ValidationError(
                "Preparation time cannot be negative."
            )

        return value

    def get_branch_names(self, obj):
        branches = obj.branches.all()

        if not branches.exists():
            return ["All branches"]

        return list(
            branches.values_list("name", flat=True)
        )

    def validate(self, attrs):
        restaurant = self.context.get("restaurant")

        if restaurant is None:
            raise serializers.ValidationError(
                "Restaurant context is required."
            )

        category = attrs.get(
            "category",
            getattr(self.instance, "category", None),
        )

        if category and category.restaurant_id != restaurant.id:
            raise serializers.ValidationError({
                "category": (
                    "This category does not belong "
                    "to this restaurant."
                )
            })

        branches_were_supplied = "branches" in attrs

        if branches_were_supplied:
            selected_branches = attrs["branches"]
        elif self.instance:
            selected_branches = list(
                self.instance.branches.all()
            )
        else:
            selected_branches = []

        for branch in selected_branches:
            if branch.restaurant_id != restaurant.id:
                raise serializers.ValidationError({
                    "branches": (
                        "All selected branches must belong "
                        "to this restaurant."
                    )
                })

            if not branch.is_active:
                raise serializers.ValidationError({
                    "branches": (
                        "Inactive branches cannot be selected."
                    )
                })

        access = self.context.get("access", {})

        if access and not access.get("is_owner", False):
            staff_member = access.get("staff_member")

            if not staff_member:
                raise serializers.ValidationError(
                    "You do not have permission to manage this menu."
                )

            if access.get("role") == "manager":
                assigned_branch_ids = set(
                    staff_member.branches.values_list(
                        "id",
                        flat=True,
                    )
                )

                selected_branch_ids = {
                    branch.id
                    for branch in selected_branches
                }

                all_active_branch_ids = set(
                    Branch.objects.filter(
                        restaurant=restaurant,
                        is_active=True,
                    ).values_list(
                        "id",
                        flat=True,
                    )
                )

                # An empty branch selection means all branches.
                if not selected_branch_ids:
                    if not all_active_branch_ids.issubset(
                        assigned_branch_ids
                    ):
                        raise serializers.ValidationError({
                            "branches": (
                                "You must be assigned to every "
                                "active branch to make an item "
                                "available across all branches."
                            )
                        })

                elif not selected_branch_ids.issubset(
                    assigned_branch_ids
                ):
                    raise serializers.ValidationError({
                        "branches": (
                            "You can only assign menu items "
                            "to your allocated branches."
                        )
                    })

        return attrs