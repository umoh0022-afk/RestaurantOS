from datetime import date, datetime, time, timedelta
from decimal import Decimal

from django.db.models import (
    Count,
    Sum,
    F,
    Q,
    Value,
    DecimalField,
    ExpressionWrapper,
)
from django.db.models.functions import TruncDate
from django.utils import timezone

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from staff.permissions import (
    RestaurantAccessMixin,
    RestaurantRolePermission,
)

from orders.models import Order, OrderItem
from payments.models import Payment
from inventory.models import (
    InventoryItem,
    StockLevel,
    StockMovement,
)
from restaurants.models import Branch


MONEY_FIELD = DecimalField(max_digits=14, decimal_places=2)


class ReportBaseView(
    RestaurantAccessMixin,
    APIView,
):
    permission_classes = [
        IsAuthenticated,
        RestaurantRolePermission,
    ]

    role_permissions = {
        "GET": ["manager", "cashier"],
    }

    def get_date_range(self):
        today = timezone.localdate()

        end_date = today
        start_date = today - timedelta(days=29)

        start_value = self.request.query_params.get("start_date")
        end_value = self.request.query_params.get("end_date")

        try:
            if start_value:
                start_date = date.fromisoformat(start_value)

            if end_value:
                end_date = date.fromisoformat(end_value)
        except ValueError:
            return None, None, Response(
                {
                    "success": False,
                    "message": (
                        "Dates must use YYYY-MM-DD format."
                    ),
                },
                status=400,
            )

        if start_date > end_date:
            return None, None, Response(
                {
                    "success": False,
                    "message": (
                        "start_date cannot be after end_date."
                    ),
                },
                status=400,
            )

        return start_date, end_date, None

    def apply_branch_access(
        self,
        queryset,
        branch_lookup="branch_id",
    ):
        return self.filter_by_branch_access(
            queryset,
            branch_lookup=branch_lookup,
        )

    def get_orders(self, start_date, end_date):
        queryset = Order.objects.filter(
            restaurant=self.get_restaurant(),
            created_at__date__range=(
                start_date,
                end_date,
            ),
        )

        return self.apply_branch_access(queryset)

    def get_completed_orders(self, start_date, end_date):
        queryset = Order.objects.filter(
            restaurant=self.get_restaurant(),
            status="completed",
            completed_at__date__range=(
                start_date,
                end_date,
            ),
        )

        return self.apply_branch_access(queryset)

    def get_payments(self, start_date, end_date):
        queryset = Payment.objects.filter(
            order__restaurant=self.get_restaurant(),
            status="completed",
            paid_at__date__range=(
                start_date,
                end_date,
            ),
        )

        return self.apply_branch_access(
            queryset,
            "order__branch_id",
        )

    def date_response(self, start_date, end_date):
        return {
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
        }


class OverviewReportView(ReportBaseView):
    role_permissions = {
        "GET": [
            "manager",
            "cashier",
            "waiter",
            "kitchen_staff",
        ],
    }

    def get(self, request, restaurant_id):
        start_date, end_date, error = self.get_date_range()

        if error:
            return error

        role = self.get_restaurant_access()["role"]

        orders = self.get_orders(start_date, end_date)

        order_summary = orders.aggregate(
            total_orders=Count("id"),
            pending_orders=Count(
                "id",
                filter=Q(status="pending"),
            ),
            confirmed_orders=Count(
                "id",
                filter=Q(status="confirmed"),
            ),
            preparing_orders=Count(
                "id",
                filter=Q(status="preparing"),
            ),
            ready_orders=Count(
                "id",
                filter=Q(status="ready"),
            ),
            completed_orders=Count(
                "id",
                filter=Q(status="completed"),
            ),
            cancelled_orders=Count(
                "id",
                filter=Q(status="cancelled"),
            ),
        )

        result = {
            **self.date_response(start_date, end_date),
            "orders": order_summary,
        }

        if role in ["manager", "cashier", "owner"]:
            completed_orders = self.get_completed_orders(
                start_date,
                end_date,
            )

            sales = OrderItem.objects.filter(
                order__in=completed_orders,
            ).aggregate(
                total_sales=Sum("line_total"),
            )["total_sales"] or Decimal("0.00")

            payments = self.get_payments(
                start_date,
                end_date,
            )

            received = payments.aggregate(
                total_received=Sum("amount"),
            )["total_received"] or Decimal("0.00")

            average_order_value = (
                sales / order_summary["completed_orders"]
                if order_summary["completed_orders"]
                else Decimal("0.00")
            )

            result["sales"] = {
                "total_sales": sales,
                "payments_received": received,
                "average_order_value": round(
                    average_order_value,
                    2,
                ),
            }

        if role in ["manager", "owner"]:
            stock_levels = StockLevel.objects.filter(
                inventory_item__restaurant=self.get_restaurant(),
                inventory_item__is_active=True,
                branch__is_active=True,
                quantity__lte=F(
                    "inventory_item__reorder_level"
                ),
            )

            stock_levels = self.apply_branch_access(
                stock_levels,
            )

            result["inventory"] = {
                "total_items": InventoryItem.objects.filter(
                    restaurant=self.get_restaurant(),
                    is_active=True,
                ).count(),
                "low_stock_count": stock_levels.count(),
            }

        if role in ["manager", "owner"]:
            result["branches"] = Branch.objects.filter(
                restaurant=self.get_restaurant(),
                is_active=True,
            ).count()

        return Response({
            "success": True,
            "data": result,
        })


class SalesReportView(ReportBaseView):
    role_permissions = {
        "GET": ["manager", "cashier"],
    }

    def get(self, request, restaurant_id):
        start_date, end_date, error = self.get_date_range()

        if error:
            return error

        completed_orders = self.get_completed_orders(
            start_date,
            end_date,
        )

        items = OrderItem.objects.filter(
            order__in=completed_orders,
        )

        summary = items.aggregate(
            total_sales=Sum("line_total"),
            total_items_sold=Sum("quantity"),
            total_orders=Count("order_id", distinct=True),
        )

        daily_sales = (
            items
            .annotate(day=TruncDate("order__completed_at"))
            .values("day")
            .annotate(
                sales=Sum("line_total"),
                orders=Count("order_id", distinct=True),
            )
            .order_by("day")
        )

        order_types = (
            completed_orders
            .values("order_type")
            .annotate(
                orders=Count("id"),
            )
            .order_by("-orders")
        )

        return Response({
            "success": True,
            "data": {
                **self.date_response(start_date, end_date),
                "summary": {
                    "total_sales": (
                        summary["total_sales"]
                        or Decimal("0.00")
                    ),
                    "total_items_sold": (
                        summary["total_items_sold"] or 0
                    ),
                    "total_orders": summary["total_orders"] or 0,
                },
                "daily_sales": list(daily_sales),
                "order_types": list(order_types),
            },
        })

class PaymentsReportView(ReportBaseView):
    role_permissions = {
        "GET": ["manager", "cashier"],
    }

    def get(self, request, restaurant_id):
        start_date, end_date, error = self.get_date_range()

        if error:
            return error

        payments = self.get_payments(
            start_date,
            end_date,
        )

        summary = payments.aggregate(
            total_received=Sum("amount"),
            transaction_count=Count("id"),
        )

        methods = (
            payments
            .values("payment_method")
            .annotate(
                total=Sum("amount"),
                transactions=Count("id"),
            )
            .order_by("-total")
        )

        completed_orders = self.get_completed_orders(
            start_date,
            end_date,
        )

        order_totals = (
            OrderItem.objects
            .filter(order__in=completed_orders)
            .values("order_id")
            .annotate(
                order_total=Sum("line_total"),
            )
        )

        order_ids = completed_orders.values_list(
            "id",
            flat=True,
        )

        received_per_order = (
            Payment.objects
            .filter(
                order_id__in=order_ids,
                status="completed",
            )
            .values("order_id")
            .annotate(
                received=Sum("amount"),
            )
        )

        totals_by_order = {
            item["order_id"]: item["order_total"]
            for item in order_totals
        }

        received_by_order = {
            item["order_id"]: item["received"]
            for item in received_per_order
        }

        outstanding = sum(
            (
                max(
                    Decimal("0.00"),
                    total - received_by_order.get(
                        order_id,
                        Decimal("0.00"),
                    ),
                )
                for order_id, total in totals_by_order.items()
            ),
            Decimal("0.00"),
        )

        return Response({
            "success": True,
            "data": {
                **self.date_response(start_date, end_date),
                "summary": {
                    "total_received": (
                        summary["total_received"]
                        or Decimal("0.00")
                    ),
                    "transaction_count": (
                        summary["transaction_count"]
                        or 0
                    ),
                    "outstanding_balance": outstanding,
                },
                "payment_methods": list(methods),
            },
        })


class ProductsReportView(ReportBaseView):
    role_permissions = {
        "GET": ["manager", "cashier"],
    }

    def get(self, request, restaurant_id):
        start_date, end_date, error = self.get_date_range()

        if error:
            return error

        completed_orders = self.get_completed_orders(
            start_date,
            end_date,
        )

        products = (
            OrderItem.objects
            .filter(order__in=completed_orders)
            .values(
                "menu_item_id",
                "menu_item__name",
            )
            .annotate(
                quantity_sold=Sum("quantity"),
                revenue=Sum("line_total"),
            )
            .order_by("-quantity_sold")
        )

        return Response({
            "success": True,
            "data": {
                **self.date_response(start_date, end_date),
                "products": list(products),
            },
        })


class InventoryReportView(ReportBaseView):
    role_permissions = {
        "GET": ["manager"],
    }

    def get(self, request, restaurant_id):
        start_date, end_date, error = self.get_date_range()

        if error:
            return error

        movements = StockMovement.objects.filter(
            restaurant=self.get_restaurant(),
            created_at__date__range=(
                start_date,
                end_date,
            ),
        )

        movements = self.apply_branch_access(movements)

        usage = movements.filter(
            movement_type="usage",
        ).aggregate(
            total=Sum("quantity"),
            transactions=Count("id"),
        )

        wastage = movements.filter(
            movement_type="wastage",
        ).aggregate(
            total=Sum("quantity"),
            transactions=Count("id"),
        )

        usage_by_item = (
            movements
            .filter(movement_type="usage")
            .values(
                "inventory_item_id",
                "inventory_item__name",
                "inventory_item__unit",
            )
            .annotate(quantity=Sum("quantity"))
            .order_by("-quantity")
        )

        wastage_by_item = (
            movements
            .filter(movement_type="wastage")
            .values(
                "inventory_item_id",
                "inventory_item__name",
                "inventory_item__unit",
            )
            .annotate(quantity=Sum("quantity"))
            .order_by("-quantity")
        )

        low_stock = StockLevel.objects.filter(
            inventory_item__restaurant=self.get_restaurant(),
            inventory_item__is_active=True,
            branch__is_active=True,
            quantity__lte=F(
                "inventory_item__reorder_level"
            ),
        ).select_related(
            "inventory_item",
            "branch",
        )

        low_stock = self.apply_branch_access(low_stock)

        low_stock_data = [
            {
                "inventory_item_id": stock.inventory_item_id,
                "item_name": stock.inventory_item.name,
                "branch_id": stock.branch_id,
                "branch_name": stock.branch.name,
                "quantity": stock.quantity,
                "reorder_level": stock.inventory_item.reorder_level,
                "unit": stock.inventory_item.unit,
            }
            for stock in low_stock
        ]

        return Response({
            "success": True,
            "data": {
                **self.date_response(start_date, end_date),
                "usage": {
                    "quantity": usage["total"] or 0,
                    "transactions": usage["transactions"],
                    "items": list(usage_by_item),
                },
                "wastage": {
                    "quantity": wastage["total"] or 0,
                    "transactions": wastage["transactions"],
                    "items": list(wastage_by_item),
                },
                "low_stock": low_stock_data,
            },
        })
class BranchesReportView(ReportBaseView):
    role_permissions = {
        "GET": ["manager"],
    }

    def get(self, request, restaurant_id):
        start_date, end_date, error = self.get_date_range()

        if error:
            return error

        branches = Branch.objects.filter(
            restaurant=self.get_restaurant(),
            is_active=True,
        )

        access = self.get_restaurant_access()

        if not access["is_owner"]:
            branches = branches.filter(
                id__in=access["staff_member"].branches.values_list(
                    "id",
                    flat=True,
                )
            )

        results = []

        for branch in branches:
            orders = Order.objects.filter(
                restaurant=self.get_restaurant(),
                branch=branch,
                created_at__date__range=(
                    start_date,
                    end_date,
                ),
            )

            completed_orders = orders.filter(
                status="completed",
                completed_at__date__range=(
                    start_date,
                    end_date,
                ),
            )

            sales = OrderItem.objects.filter(
                order__in=completed_orders,
            ).aggregate(
                total=Sum("line_total"),
            )["total"] or Decimal("0.00")

            results.append({
                "branch_id": branch.id,
                "branch_name": branch.name,
                "total_orders": orders.count(),
                "completed_orders": completed_orders.count(),
                "sales": sales,
            })

        return Response({
            "success": True,
            "data": {
                **self.date_response(start_date, end_date),
                "branches": results,
            },
        })