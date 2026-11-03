
from django.shortcuts import get_object_or_404

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from staff.permissions import (
    RestaurantAccessMixin,
    RestaurantRolePermission,
)

from .models import Payment
from .serializers import PaymentSerializer
from .services import record_payment


class PaymentRestaurantMixin(RestaurantAccessMixin):
    permission_classes = [
        IsAuthenticated,
        RestaurantRolePermission,
    ]

    role_permissions = {
        "GET": ["manager", "cashier"],
        "POST": ["manager", "cashier"],
    }

    def get_queryset(self):
        queryset = (
            Payment.objects
            .filter(order__restaurant=self.get_restaurant())
            .select_related(
                "order",
                "received_by",
                "order__branch",
            )
            .order_by("-created_at")
        )

        return self.filter_by_branch_access(
            queryset,
            branch_lookup="order__branch_id",
        )

    def get_serializer_context(self):
        return {
            "request": self.request,
            "restaurant": self.get_restaurant(),
            "access": self.get_restaurant_access(),
        }


class PaymentListCreateView(
    PaymentRestaurantMixin,
    APIView,
):
    def get(self, request, restaurant_id):
        payments = self.get_queryset()

        serializer = PaymentSerializer(
            payments,
            many=True,
            context=self.get_serializer_context(),
        )

        return Response(serializer.data)

    def post(self, request, restaurant_id):
        serializer = PaymentSerializer(
            data=request.data,
            context=self.get_serializer_context(),
        )

        serializer.is_valid(raise_exception=True)

        payment = record_payment(
            order_id=serializer.validated_data["order"].id,
            restaurant=self.get_restaurant(),
            amount=serializer.validated_data["amount"],
            payment_method=serializer.validated_data["payment_method"],
            received_by=request.user,
            reference=serializer.validated_data.get(
                "reference",
                "",
            ),
            notes=serializer.validated_data.get(
                "notes",
                "",
            ),
        )

        response_serializer = PaymentSerializer(
            payment,
            context=self.get_serializer_context(),
        )

        return Response(
            response_serializer.data,
            status=status.HTTP_201_CREATED,
        )


class PaymentDetailView(
    PaymentRestaurantMixin,
    APIView,
):
    def get(self, request, restaurant_id, pk):
        payment = get_object_or_404(
            self.get_queryset(),
            pk=pk,
        )

        serializer = PaymentSerializer(
            payment,
            context=self.get_serializer_context(),
        )

        return Response(serializer.data)
