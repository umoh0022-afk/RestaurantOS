
from django.contrib.auth import get_user_model
from django.middleware.csrf import CsrfViewMiddleware

from rest_framework.authentication import BaseAuthentication, get_authorization_header
from rest_framework.exceptions import AuthenticationFailed, PermissionDenied

from rest_framework_simplejwt.settings import api_settings
from rest_framework_simplejwt.tokens import AccessToken
from rest_framework_simplejwt.exceptions import TokenError


class CSRFCheck(CsrfViewMiddleware):
    def _reject(self, request, reason):
        return reason


class CookieJWTAuthentication(BaseAuthentication):

    def authenticate(self, request):
        authorization = get_authorization_header(request).split()

        if authorization:
            if len(authorization) != 2 or authorization[0].lower() != b"bearer":
                raise AuthenticationFailed("Invalid authorization header.")

            raw_token = authorization[1]
        else:
            raw_token = request.COOKIES.get("access_token")

        if not raw_token:
            return None

        try:
            token = AccessToken(raw_token)
            user_id = token[api_settings.USER_ID_CLAIM]

            User = get_user_model()

            user = User.objects.get(
                **{api_settings.USER_ID_FIELD: user_id}
            )

        except (TokenError, KeyError, TypeError, ValueError, User.DoesNotExist):
            raise AuthenticationFailed("Invalid or expired authentication token.")

        if not user.is_active:
            raise AuthenticationFailed("This account is inactive.")

        # Bearer-token API clients use their own transport security.
        # Cookie-authenticated browser requests require CSRF validation.
        if not authorization and request.method not in (
            "GET", "HEAD", "OPTIONS", "TRACE"
        ):
            check = CSRFCheck(lambda req: None)
            check.process_request(request._request)

            reason = check.process_view(
                request._request,
                lambda req: None,
                (),
                {},
            )

            if reason:
                raise PermissionDenied(f"CSRF verification failed: {reason}")

        return user, token
