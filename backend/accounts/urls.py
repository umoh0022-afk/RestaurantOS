
from django.urls import path

from .views import (
    RegisterView,
    LoginView,
    CurrentUserView,
    RefreshCookieView,
    LogoutView,
    csrf_cookie_view,
)


urlpatterns = [
    path("csrf/", csrf_cookie_view, name="csrf"),
    path("register/", RegisterView.as_view(), name="register"),
    path("login/", LoginView.as_view(), name="login"),
    path("me/", CurrentUserView.as_view(), name="current_user"),
    path("refresh/", RefreshCookieView.as_view(), name="refresh"),
    path("logout/", LogoutView.as_view(), name="logout"),
]
