from django.shortcuts import get_object_or_404
from rest_framework.permissions import BasePermission

from restaurants.models import Restaurant
from .models import StaffMember


class RestaurantAccessMixin:
    """
    Resolves the authenticated user's access to a restaurant.

    Restaurant owners receive full access.
    Staff members receive access based on their assigned role and branches.
    """

    def get_restaurant_access(self):
        if not hasattr(self, "_restaurant_access"):
            user = self.request.user
            restaurant_id = self.kwargs.get("restaurant_id")

            # Restaurant owners have full access.
            restaurant = Restaurant.objects.filter(
                pk=restaurant_id,
                owner=user,
            ).first()

            if restaurant:
                self._restaurant_access = {
                    "restaurant": restaurant,
                    "staff_member": None,
                    "is_owner": True,
                    "role": "owner",
                }
            else:
                # Otherwise, check whether the user is staff.
                staff_member = (
                    StaffMember.objects
                    .select_related("restaurant", "user")
                    .prefetch_related("branches")
                    .filter(
                        restaurant_id=restaurant_id,
                        user=user,
                        user__is_active=True,
                        restaurant__is_active=True,
                    )
                    .first()
                )

                if not staff_member:
                    from django.http import Http404
                    raise Http404("Restaurant not found.")

                self._restaurant_access = {
                    "restaurant": staff_member.restaurant,
                    "staff_member": staff_member,
                    "is_owner": False,
                    "role": staff_member.role,
                }

        return self._restaurant_access

    def get_restaurant(self):
        return self.get_restaurant_access()["restaurant"]

    def get_staff_member(self):
        return self.get_restaurant_access()["staff_member"]

    def is_restaurant_owner(self):
        return self.get_restaurant_access()["is_owner"]

    def filter_by_branch_access(
        self,
        queryset,
        branch_lookup="branch_id",
    ):
        """
        Restricts staff querysets to their assigned branches.

        Owners can access every branch.
        Staff with no assigned branches receive no branch records.
        """

        access = self.get_restaurant_access()

        if access["is_owner"]:
            return queryset

        staff_member = access["staff_member"]

        branch_ids = staff_member.branches.values_list(
            "id",
            flat=True,
        )

        return queryset.filter(
            **{f"{branch_lookup}__in": branch_ids}
        )


class RestaurantRolePermission(BasePermission):
    """
    Role-based permission class.

    Views should define role_permissions, for example:

        role_permissions = {
            "GET": ["manager", "cashier"],
            "POST": ["manager", "cashier"],
        }

    Owners always have full access.
    Staff are denied by default when a method is not configured.
    """

    message = "You do not have permission to perform this action."

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        if not hasattr(view, "get_restaurant_access"):
            return False

        access = view.get_restaurant_access()

        if access["is_owner"]:
            return True

        role_permissions = getattr(view, "role_permissions", {})

        allowed_roles = role_permissions.get(
            request.method,
            [],
        )

        return access["role"] in allowed_roles