from django.contrib import admin

from .models import StaffMember


@admin.register(StaffMember)
class StaffMemberAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "user",
        "restaurant",
        "role",
        "is_active",
        "created_at",
    )

    list_filter = (
        "role",
        "restaurant",
        "user__is_active",
    )

    search_fields = (
        "user__email",
        "user__first_name",
        "user__last_name",
        "phone",
        "restaurant__name",
    )

    filter_horizontal = ("branches",)

    @admin.display(boolean=True, description="Active")
    def is_active(self, obj):
        return obj.user.is_active