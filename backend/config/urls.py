
from django.contrib import admin
from django.urls import include, path
from django.http import JsonResponse
from django.conf import settings
from django.conf.urls.static import static


def health_check(request):
    return JsonResponse({
        "success": True,
        "message": "RestaurantOS API is running.",
    })


urlpatterns = [
    path("admin/", admin.site.urls),

    path("api/health/", health_check, name="health_check"),

    path("api/auth/", include("accounts.urls")),

    path("api/restaurants/", include("restaurants.urls")),

    path("api/inventory/", include("inventory.urls")),

    path("api/orders/", include("orders.urls")),

    path("api/payments/", include("payments.urls")),

    path("api/customers/", include("customers.urls")),

    path("api/staff/", include("staff.urls")),

    path("api/reports/", include("reports.urls")),
]


# Serve local uploaded files during development only.
# Production media files are served by Cloudinary.

if settings.DEBUG and not settings.CLOUDINARY_ENABLED:
    urlpatterns += static(
        settings.MEDIA_URL,
        document_root=settings.MEDIA_ROOT,
    )
