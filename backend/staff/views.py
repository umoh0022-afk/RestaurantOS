from rest_framework import generics, permissions

from staff.permissions import (
    RestaurantAccessMixin,
    RestaurantRolePermission,
)

from .models import StaffMember
from .serializers import StaffMemberSerializer


class StaffRestaurantMixin(RestaurantAccessMixin):
    permission_classes = [
        permissions.IsAuthenticated,
        RestaurantRolePermission,
    ]

    # Owners have full access. Managers can manage staff.
    role_permissions = {
        "GET": ["manager"],
        "POST": ["manager"],
        "PUT": ["manager"],
        "PATCH": ["manager"],
        "DELETE": ["manager"],
    }

    def get_queryset(self):
        return (
            StaffMember.objects
            .filter(restaurant=self.get_restaurant())
            .exclude(user=self.request.user)
            .select_related("user", "restaurant")
            .prefetch_related("branches")
        )

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["restaurant"] = self.get_restaurant()
        return context


class StaffMemberListCreateView(
    StaffRestaurantMixin,
    generics.ListCreateAPIView,
):
    serializer_class = StaffMemberSerializer


class StaffMemberDetailView(
    StaffRestaurantMixin,
    generics.RetrieveUpdateDestroyAPIView,
):
    serializer_class = StaffMemberSerializer
    lookup_url_kwarg = "pk"

    def perform_destroy(self, instance):
        # Deactivate the account instead of deleting it.
        instance.user.is_active = False
        instance.user.save(update_fields=["is_active"])