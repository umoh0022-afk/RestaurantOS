from pathlib import Path
import os

from dotenv import load_dotenv


# ==========================================================
# BASE CONFIGURATION
# ==========================================================

BASE_DIR = Path(__file__).resolve().parent.parent

load_dotenv(BASE_DIR / ".env")

SECRET_KEY = os.getenv(
    "DJANGO_SECRET_KEY",
    "django-insecure-development-key-change-this"
)

DEBUG = os.getenv("DEBUG", "True").lower() == "true"

ALLOWED_HOSTS = [
    host.strip()
    for host in os.getenv(
        "ALLOWED_HOSTS",
        "127.0.0.1,localhost"
    ).split(",")
    if host.strip()
]


# ==========================================================
# INSTALLED APPLICATIONS
# ==========================================================

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",

    "rest_framework",
    "rest_framework_simplejwt",

    "accounts",
    "restaurants",
    "core",
    "inventory",
    "orders",
    "payments",
    "customers",
    "staff",
    "reports",
]


# ==========================================================
# MIDDLEWARE
# ==========================================================

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]


# ==========================================================
# URL AND SERVER CONFIGURATION
# ==========================================================

ROOT_URLCONF = "config.urls"

WSGI_APPLICATION = "config.wsgi.application"


# ==========================================================
# TEMPLATES
# ==========================================================

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]


# ==========================================================
# POSTGRESQL DATABASE CONFIGURATION
# ==========================================================

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.getenv("DB_NAME", "restaurantos"),
        "USER": os.getenv("DB_USER", "postgres"),
        "PASSWORD": os.getenv("DB_PASSWORD", ""),
        "HOST": os.getenv("DB_HOST", "localhost"),
        "PORT": os.getenv("DB_PORT", "5432"),
        "CONN_MAX_AGE": 60,
    }
}


# ==========================================================
# CUSTOM USER MODEL
# ==========================================================

AUTH_USER_MODEL = "accounts.User"


# ==========================================================
# PASSWORD VALIDATION
# ==========================================================

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]


# ==========================================================
# INTERNATIONALISATION
# ==========================================================

LANGUAGE_CODE = "en-us"

TIME_ZONE = "Africa/Lagos"

USE_I18N = True

USE_TZ = True


# ==========================================================
# STATIC AND MEDIA FILES
# ==========================================================

STATIC_URL = "static/"

STATIC_ROOT = BASE_DIR / "staticfiles"

MEDIA_URL = "media/"

MEDIA_ROOT = BASE_DIR / "media"


# ==========================================================
# DEFAULT PRIMARY KEY
# ==========================================================

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"


# ==========================================================
# CORS CONFIGURATION
# ==========================================================

FRONTEND_URL = os.getenv(
    "FRONTEND_URL",
    "http://localhost:3000"
)

CORS_ALLOWED_ORIGINS = [
    FRONTEND_URL
]

CORS_ALLOW_CREDENTIALS = True


# ==========================================================
# CSRF CONFIGURATION
# ==========================================================

CSRF_TRUSTED_ORIGINS = [
    FRONTEND_URL
]

CSRF_COOKIE_HTTPONLY = False

CSRF_COOKIE_SECURE = not DEBUG

CSRF_COOKIE_SAMESITE = "Lax"


# ==========================================================
# COOKIE SECURITY
# ==========================================================

SESSION_COOKIE_HTTPONLY = True

SESSION_COOKIE_SECURE = not DEBUG

SESSION_COOKIE_SAMESITE = "Lax"


# ==========================================================
# DJANGO REST FRAMEWORK
# ==========================================================

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "accounts.authentication.CookieJWTAuthentication",
    ],

    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
}