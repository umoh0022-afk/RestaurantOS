
from django.urls import include, path

from .views import (
    RestaurantListCreateView,
    RestaurantDetailView,
    BranchListCreateView,
    BranchDetailView,
)


urlpatterns = [
    path(
        "",
        RestaurantListCreateView.as_view(),
        name="restaurant-list-create",
    ),

    path(
        "<int:pk>/",
        RestaurantDetailView.as_view(),
        name="restaurant-detail",
    ),

    path(
        "<int:restaurant_id>/branches/",
        BranchListCreateView.as_view(),
        name="branch-list-create",
    ),

    path(
        "<int:restaurant_id>/branches/<int:pk>/",
        BranchDetailView.as_view(),
        name="branch-detail",
    ),

    path(
        "<int:restaurant_id>/menu/",
        include("restaurants.menu_urls"),
    ),
]
