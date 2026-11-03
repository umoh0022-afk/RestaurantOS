from django.urls import path

from .views import (
    StaffMemberListCreateView,
    StaffMemberDetailView,
)

urlpatterns = [
    path(
        "<int:restaurant_id>/",
        StaffMemberListCreateView.as_view(),
        name="staff-list-create",
    ),
    path(
        "<int:restaurant_id>/<int:pk>/",
        StaffMemberDetailView.as_view(),
        name="staff-detail",
    ),
]