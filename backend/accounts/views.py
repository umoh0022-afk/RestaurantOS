
from django.conf import settings
from django.contrib.auth import authenticate, get_user_model
from django.http import JsonResponse
from django.middleware.csrf import get_token, CsrfViewMiddleware
from django.views.decorators.csrf import ensure_csrf_cookie

from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.settings import api_settings
from rest_framework_simplejwt.exceptions import TokenError

from .serializers import RegisterSerializer, UserSerializer

User = get_user_model()

COOKIE_SECURE = not settings.DEBUG
COOKIE_SAMESITE = "None" if COOKIE_SECURE else "Lax"


class CSRFCheck(CsrfViewMiddleware):
    def _reject(self, request, reason):
        return reason


def check_csrf(request):
    checker = CSRFCheck(lambda req: None)
    checker.process_request(request)

    reason = checker.process_view(
        request,
        lambda req: None,
        (),
        {},
    )

    if reason:
        return Response(
            {"detail": f"CSRF verification failed: {reason}"},
            status=status.HTTP_403_FORBIDDEN,
        )

    return None


def set_auth_cookies(response, user):
    refresh = RefreshToken.for_user(user)
    access = refresh.access_token

    response.set_cookie(
        "access_token",
        str(access),
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        path="/",
        max_age=int(
            api_settings.ACCESS_TOKEN_LIFETIME.total_seconds()
        ),
    )

    response.set_cookie(
        "refresh_token",
        str(refresh),
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        path="/api/auth/",
        max_age=int(
            api_settings.REFRESH_TOKEN_LIFETIME.total_seconds()
        ),
    )


def clear_auth_cookies(response):
    response.delete_cookie(
        "access_token",
        path="/",
        samesite=COOKIE_SAMESITE,
    )

    response.delete_cookie(
        "refresh_token",
        path="/api/auth/",
        samesite=COOKIE_SAMESITE,
    )


class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]


class LoginView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def post(self, request):
        csrf_error = check_csrf(request._request)

        if csrf_error:
            return csrf_error

        email = request.data.get("email", "")
        password = request.data.get("password", "")

        if not isinstance(email, str) or not isinstance(password, str):
            return Response(
                {"detail": "Invalid login credentials."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        email = email.strip().lower()

        if not email or not password:
            return Response(
                {"detail": "Email and password are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = authenticate(
            request=request._request,
            email=email,
            password=password,
        )

        if user is None:
            return Response(
                {"detail": "Invalid email or password."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        if not user.is_active:
            return Response(
                {"detail": "This account is inactive."},
                status=status.HTTP_403_FORBIDDEN,
            )

        response = Response(
            {
                "success": True,
                "message": "Login successful.",
                "user": UserSerializer(user).data,
            },
            status=status.HTTP_200_OK,
        )

        set_auth_cookies(response, user)
        get_token(request._request)

        return response


class CurrentUserView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        serializer = UserSerializer(request.user)

        return Response({
            "success": True,
            "user": serializer.data,
        })


class RefreshCookieView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def post(self, request):
        csrf_error = check_csrf(request._request)

        if csrf_error:
            return csrf_error

        raw_refresh = request.COOKIES.get("refresh_token")

        if not raw_refresh:
            return Response(
                {"detail": "Refresh token is missing."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        try:
            refresh = RefreshToken(raw_refresh)
            user_id = refresh[api_settings.USER_ID_CLAIM]

            user = User.objects.get(
                **{api_settings.USER_ID_FIELD: user_id}
            )

            if not user.is_active:
                raise ValueError("Inactive user.")

            response = Response({
                "success": True,
                "message": "Session refreshed.",
            })

            response.set_cookie(
                "access_token",
                str(refresh.access_token),
                httponly=True,
                secure=COOKIE_SECURE,
                samesite=COOKIE_SAMESITE,
                path="/",
                max_age=int(
                    api_settings.ACCESS_TOKEN_LIFETIME.total_seconds()
                ),
            )

            return response

        except (
            TokenError,
            ValueError,
            User.DoesNotExist,
            KeyError,
        ):
            response = Response(
                {
                    "detail": (
                        "Your session has expired. Please log in again."
                    )
                },
                status=status.HTTP_401_UNAUTHORIZED,
            )

            clear_auth_cookies(response)
            return response


class LogoutView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def post(self, request):
        csrf_error = check_csrf(request._request)

        if csrf_error:
            return csrf_error

        response = Response({
            "success": True,
            "message": "You have been logged out.",
        })

        clear_auth_cookies(response)
        return response


@ensure_csrf_cookie
def csrf_cookie_view(request):
    return JsonResponse({
        "success": True,
        "csrfToken": get_token(request),
    })
