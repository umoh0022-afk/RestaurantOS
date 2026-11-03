from django.urls import path

from .views import (
    OverviewReportView,
    SalesReportView,
    PaymentsReportView,
    ProductsReportView,
    InventoryReportView,
    BranchesReportView,
)


urlpatterns = [
    path(
        "<int:restaurant_id>/overview/",
        OverviewReportView.as_view(),
        name="report-overview",
    ),
    path(
        "<int:restaurant_id>/sales/",
        SalesReportView.as_view(),
        name="report-sales",
    ),
    path(
        "<int:restaurant_id>/payments/",
        PaymentsReportView.as_view(),
        name="report-payments",
    ),
    path(
        "<int:restaurant_id>/products/",
        ProductsReportView.as_view(),
        name="report-products",
    ),
    path(
        "<int:restaurant_id>/inventory/",
        InventoryReportView.as_view(),
        name="report-inventory",
    ),
    path(
        "<int:restaurant_id>/branches/",
        BranchesReportView.as_view(),
        name="report-branches",
    ),
]