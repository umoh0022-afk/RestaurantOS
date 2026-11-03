
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { refreshSession } from "@/lib/auth";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

type RangeKey = "7" | "30" | "90";

interface Restaurant {
  id: number;
  name: string;
  currency: string;
}

interface ReportEnvelope<T> {
  success: boolean;
  data: T;
}

interface SalesReport {
  summary: {
    total_sales: string | number;
    total_items_sold: number;
    total_orders: number;
  };
  daily_sales: {
    day: string;
    sales: string | number;
    orders: number;
  }[];
  order_types: {
    order_type: string;
    orders: number;
  }[];
}

interface PaymentReport {
  summary: {
    total_received: string | number;
    transaction_count: number;
    outstanding_balance: string | number;
  };
  payment_methods: {
    payment_method: string;
    total: string | number;
    transactions: number;
  }[];
}

interface ProductReport {
  products: {
    menu_item_id: number;
    menu_item__name: string;
    quantity_sold: number;
    revenue: string | number;
  }[];
}

interface InventoryReport {
  usage: {
    quantity: string | number;
    transactions: number;
    items: InventoryItemReport[];
  };
  wastage: {
    quantity: string | number;
    transactions: number;
    items: InventoryItemReport[];
  };
  low_stock: {
    inventory_item_id: number;
    item_name: string;
    branch_name: string;
    quantity: string | number;
    reorder_level: string | number;
    unit: string;
  }[];
}

interface InventoryItemReport {
  inventory_item_id: number;
  inventory_item__name: string;
  inventory_item__unit: string;
  quantity: string | number;
}

interface BranchReport {
  branches: {
    branch_id: number;
    branch_name: string;
    total_orders: number;
    completed_orders: number;
    sales: string | number;
  }[];
}

interface OverviewReport {
  orders: {
    total_orders: number;
    pending_orders: number;
    confirmed_orders: number;
    preparing_orders: number;
    ready_orders: number;
    completed_orders: number;
    cancelled_orders: number;
  };
  sales?: {
    total_sales: string | number;
    payments_received: string | number;
    average_order_value: string | number;
  };
  inventory?: {
    total_items: number;
    low_stock_count: number;
  };
  branches?: number;
}

interface ApiList<T> {
  results?: T[];
}

function getList<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];

  if (
    value &&
    typeof value === "object" &&
    "results" in value
  ) {
    const results = (value as ApiList<T>).results;
    return Array.isArray(results) ? results : [];
  }

  return [];
}

async function apiGet<T>(
  url: string,
  retry = true,
): Promise<T> {
  const response = await fetch(url, {
    credentials: "include",
    cache: "no-store",
  });

  if (
    (response.status === 401 || response.status === 403) &&
    retry
  ) {
    try {
      await refreshSession();
      return apiGet<T>(url, false);
    } catch {
      throw new Error(
        "Your session has expired. Please log in again.",
      );
    }
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      (data as { detail?: string }).detail ||
        `Unable to load report data (${response.status}).`,
    );
  }

  return data as T;
}

function getReportData<T>(
  response: ReportEnvelope<T>,
): T {
  return response.data;
}

function money(value: number | string, currency: string) {
  const amount = Number(value) || 0;

  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: currency || "NGN",
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `₦${amount.toLocaleString("en-NG")}`;
  }
}

function quantity(value: number | string) {
  return Number(value || 0).toLocaleString("en-NG", {
    maximumFractionDigits: 3,
  });
}

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function StatCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
        {value}
      </p>
      <p className="mt-2 text-xs text-slate-500">
        {detail}
      </p>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <p className="mt-8 text-sm text-slate-400">
      {message}
    </p>
  );
}

export default function ReportsPage() {
  const router = useRouter();

  const [restaurant, setRestaurant] =
    useState<Restaurant | null>(null);

  const [range, setRange] = useState<RangeKey>("30");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const [overview, setOverview] =
    useState<OverviewReport | null>(null);

  const [salesReport, setSalesReport] =
    useState<SalesReport | null>(null);

  const [paymentReport, setPaymentReport] =
    useState<PaymentReport | null>(null);

  const [productReport, setProductReport] =
    useState<ProductReport | null>(null);

  const [inventoryReport, setInventoryReport] =
    useState<InventoryReport | null>(null);

  const [branchReport, setBranchReport] =
    useState<BranchReport | null>(null);

  const [accessMessages, setAccessMessages] =
    useState<string[]>([]);

  const dateRange = useMemo(() => {
    const end = new Date();
    const start = new Date();

    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (Number(range) - 1));

    return {
      start_date: localDateKey(start),
      end_date: localDateKey(end),
    };
  }, [range]);

  const loadReports = useCallback(async () => {
    setLoading(true);
    setRefreshing(true);
    setError("");
    setAccessMessages([]);

    try {
      const restaurantsResponse = await apiGet<unknown>(
        `${API_URL}/restaurants/`,
      );

      const firstRestaurant =
        getList<Restaurant>(restaurantsResponse)[0];

      if (!firstRestaurant) {
        setRestaurant(null);
        setOverview(null);
        setSalesReport(null);
        setPaymentReport(null);
        setProductReport(null);
        setInventoryReport(null);
        setBranchReport(null);

        setError(
          "No restaurant is linked to this account yet.",
        );

        return;
      }

      setRestaurant(firstRestaurant);

      const query = new URLSearchParams(dateRange).toString();
      const base = `${API_URL}/reports/${firstRestaurant.id}`;

      const requests = await Promise.allSettled([
        apiGet<ReportEnvelope<OverviewReport>>(
          `${base}/overview/?${query}`,
        ),
        apiGet<ReportEnvelope<SalesReport>>(
          `${base}/sales/?${query}`,
        ),
        apiGet<ReportEnvelope<PaymentReport>>(
          `${base}/payments/?${query}`,
        ),
        apiGet<ReportEnvelope<ProductReport>>(
          `${base}/products/?${query}`,
        ),
        apiGet<ReportEnvelope<InventoryReport>>(
          `${base}/inventory/?${query}`,
        ),
        apiGet<ReportEnvelope<BranchReport>>(
          `${base}/branches/?${query}`,
        ),
      ]);

      const [
        overviewResult,
        salesResult,
        paymentsResult,
        productsResult,
        inventoryResult,
        branchesResult,
      ] = requests;

      const messages: string[] = [];

      if (overviewResult.status === "fulfilled") {
        setOverview(getReportData(overviewResult.value));
      } else {
        setOverview(null);
        messages.push("Overview report is unavailable.");
      }

      if (salesResult.status === "fulfilled") {
        setSalesReport(getReportData(salesResult.value));
      } else {
        setSalesReport(null);
        messages.push("Sales report is not available for your role.");
      }

      if (paymentsResult.status === "fulfilled") {
        setPaymentReport(getReportData(paymentsResult.value));
      } else {
        setPaymentReport(null);
        messages.push("Payment report is not available for your role.");
      }

      if (productsResult.status === "fulfilled") {
        setProductReport(getReportData(productsResult.value));
      } else {
        setProductReport(null);
        messages.push("Product report is not available for your role.");
      }

      if (inventoryResult.status === "fulfilled") {
        setInventoryReport(getReportData(inventoryResult.value));
      } else {
        setInventoryReport(null);
        messages.push("Inventory report is not available for your role.");
      }

      if (branchesResult.status === "fulfilled") {
        setBranchReport(getReportData(branchesResult.value));
      } else {
        setBranchReport(null);
        messages.push("Branch report is not available for your role.");
      }

      setAccessMessages(messages);

      if (
        overviewResult.status === "rejected" &&
        salesResult.status === "rejected" &&
        paymentsResult.status === "rejected"
      ) {
        throw new Error(
          "Unable to load the reports available to this account.",
        );
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Unable to load reports.";

      setError(message);

      if (message.toLowerCase().includes("log in")) {
        router.push("/login");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dateRange, router]);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  const currency = restaurant?.currency || "NGN";

  const sales = Number(
    salesReport?.summary.total_sales ??
      overview?.sales?.total_sales ??
      0,
  );

  const received = Number(
    paymentReport?.summary.total_received ??
      overview?.sales?.payments_received ??
      0,
  );

  const outstanding = Number(
    paymentReport?.summary.outstanding_balance ?? 0,
  );

  const completedOrders =
    salesReport?.summary.total_orders ??
    overview?.orders.completed_orders ??
    0;

  const averageOrder =
    completedOrders > 0
      ? sales / completedOrders
      : 0;

  const dailySales = salesReport?.daily_sales || [];

  const maxDailySales = Math.max(
    1,
    ...dailySales.map((day) => Number(day.sales)),
  );

  const paymentMethods =
    paymentReport?.payment_methods || [];

  const maxPayment = Math.max(
    1,
    ...paymentMethods.map((item) => Number(item.total)),
  );

  const topProducts = productReport?.products || [];

  const maxProductQuantity = Math.max(
    1,
    ...topProducts.map((item) => Number(item.quantity_sold)),
  );

  const orderTypes = salesReport?.order_types || [];

  const inventoryUsage = inventoryReport?.usage;
  const inventoryWastage = inventoryReport?.wastage;

  const lowStock = inventoryReport?.low_stock || [];

  const branchPerformance = branchReport?.branches || [];

  const showInventory =
    inventoryReport !== null;

  const showBranches =
    branchReport !== null;

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">

        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link
              href="/dashboard"
              className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
            >
              ← Back to dashboard
            </Link>

            <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900">
              Reports &amp; Analytics
            </h1>

            <p className="mt-1 text-sm text-slate-500">
              {restaurant
                ? `${restaurant.name} · Business performance overview`
                : "Business performance overview"}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={range}
              onChange={(event) =>
                setRange(event.target.value as RangeKey)
              }
              className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 outline-none focus:border-indigo-500"
              aria-label="Report date range"
            >
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
            </select>

            <button
              onClick={() => void loadReports()}
              disabled={refreshing}
              className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
            Loading your business reports…
          </div>
        ) : (
          <>
            {accessMessages.length > 0 && (
              <div className="mb-5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500">
                Some report sections are hidden because they are not included in your account permissions.
              </div>
            )}

            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Completed sales"
                value={money(sales, currency)}
                detail={`${completedOrders} completed orders in this period`}
              />

              <StatCard
                label="Payments received"
                value={money(received, currency)}
                detail={`${paymentReport?.summary.transaction_count ?? 0} successful payment transactions`}
              />

              <StatCard
                label="Outstanding balance"
                value={money(outstanding, currency)}
                detail="Remaining balance on completed orders"
              />

              <StatCard
                label="Average order value"
                value={money(averageOrder, currency)}
                detail="Sales divided by completed orders"
              />
            </section>

            <section className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-slate-900">
                      Sales trend
                    </h2>
                    <p className="mt-1 text-xs text-slate-500">
                      Completed order value by day
                    </p>
                  </div>

                  <span className="text-sm font-semibold text-slate-700">
                    {money(sales, currency)}
                  </span>
                </div>

                {dailySales.length ? (
                  <div className="mt-6 flex h-56 items-end gap-1.5 overflow-x-auto pb-7">
                    {dailySales.map((day, index) => {
                      const amount = Number(day.sales);
                      const height =
                        amount > 0
                          ? Math.max(
                              4,
                              (amount / maxDailySales) * 100,
                            )
                          : 0;

                      return (
                        <div
                          key={day.day}
                          className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end"
                        >
                          <div className="mb-1 hidden text-[10px] text-slate-500 group-hover:block">
                            {money(amount, currency)}
                          </div>

                          <div
                            title={`${day.day}: ${money(amount, currency)}`}
                            className={`w-full max-w-7 rounded-t-md transition-colors ${
                              amount > 0
                                ? "bg-indigo-500 group-hover:bg-indigo-700"
                                : "bg-slate-100"
                            }`}
                            style={{
                              height: `${height}%`,
                              minHeight: amount > 0 ? "4px" : "2px",
                            }}
                          />

                          {(Number(range) === 7 ||
                            index %
                              (Number(range) === 30 ? 5 : 15) ===
                              0) && (
                            <span className="mt-2 whitespace-nowrap text-[9px] text-slate-400">
                              {new Date(
                                `${day.day}T12:00:00`,
                              ).toLocaleDateString("en-GB", {
                                day: "numeric",
                                month: "short",
                              })}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState message="No completed sales recorded in this period." />
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="font-semibold text-slate-900">
                  Payment methods
                </h2>

                <p className="mt-1 text-xs text-slate-500">
                  Completed payments by method
                </p>

                {paymentMethods.length ? (
                  <div className="mt-5 space-y-4">
                    {paymentMethods.map((item) => {
                      const total = Number(item.total);

                      return (
                        <div key={item.payment_method}>
                          <div className="mb-1.5 flex justify-between gap-3 text-sm">
                            <span className="capitalize text-slate-600">
                              {item.payment_method.replaceAll("_", " ")}
                            </span>

                            <span className="font-semibold text-slate-900">
                              {money(total, currency)}
                            </span>
                          </div>

                          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-indigo-500"
                              style={{
                                width: `${(total / maxPayment) * 100}%`,
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState message="No completed payments in this period." />
                )}
              </div>
            </section>

            <section className="mt-6 grid gap-6 xl:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="font-semibold text-slate-900">
                  Best-selling menu items
                </h2>

                <p className="mt-1 text-xs text-slate-500">
                  Ranked by quantity sold in completed orders
                </p>

                {topProducts.length ? (
                  <div className="mt-5 space-y-4">
                    {topProducts.slice(0, 6).map((item, index) => {
                      const sold = Number(item.quantity_sold);

                      return (
                        <div key={item.menu_item_id}>
                          <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                            <span className="min-w-0 truncate text-slate-700">
                              {index + 1}. {item.menu_item__name}
                            </span>

                            <span className="shrink-0 font-semibold text-slate-900">
                              {quantity(sold)} sold
                            </span>
                          </div>

                          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-emerald-500"
                              style={{
                                width: `${(sold / maxProductQuantity) * 100}%`,
                              }}
                            />
                          </div>

                          <p className="mt-1 text-xs text-slate-400">
                            {money(item.revenue, currency)} sales
                          </p>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState message="No completed order items in this period." />
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="font-semibold text-slate-900">
                  Order trends
                </h2>

                <p className="mt-1 text-xs text-slate-500">
                  Completed orders by order type
                </p>

                {orderTypes.length ? (
                  <div className="mt-5 space-y-4">
                    {orderTypes.map((item) => (
                      <div
                        key={item.order_type}
                        className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3"
                      >
                        <span className="capitalize text-sm text-slate-700">
                          {item.order_type.replaceAll("_", " ")}
                        </span>

                        <span className="text-lg font-bold text-slate-900">
                          {item.orders}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState message="No completed orders in this period." />
                )}
              </div>
            </section>

            {showInventory && (
              <section className="mt-6 grid gap-6 xl:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h2 className="font-semibold text-slate-900">
                    Inventory performance
                  </h2>

                  <p className="mt-1 text-xs text-slate-500">
                    Based on recorded stock movements
                  </p>

                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-slate-50 p-4">
                      <p className="text-xs text-slate-500">
                        Stock used
                      </p>

                      <p className="mt-1 text-2xl font-bold text-slate-900">
                        {quantity(inventoryUsage?.quantity ?? 0)}
                      </p>

                      <p className="mt-1 text-xs text-slate-400">
                        {inventoryUsage?.transactions ?? 0} recorded movements
                      </p>
                    </div>

                    <div className="rounded-xl bg-amber-50 p-4">
                      <p className="text-xs text-amber-700">
                        Stock wastage
                      </p>

                      <p className="mt-1 text-2xl font-bold text-amber-900">
                        {quantity(inventoryWastage?.quantity ?? 0)}
                      </p>

                      <p className="mt-1 text-xs text-amber-700">
                        {inventoryWastage?.transactions ?? 0} recorded movements
                      </p>
                    </div>
                  </div>

                  <p className="mt-4 text-xs text-slate-400">
                    Quantities are shown by movement totals. Individual items below retain their own units of measurement.
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h2 className="font-semibold text-slate-900">
                    Most recorded wastage
                  </h2>

                  <p className="mt-1 text-xs text-slate-500">
                    Inventory items with the highest wastage quantity
                  </p>

                  {inventoryWastage?.items.length ? (
                    <div className="mt-4 divide-y divide-slate-100">
                      {inventoryWastage.items.slice(0, 6).map((item) => (
                        <div
                          key={item.inventory_item_id}
                          className="flex items-center justify-between gap-3 py-3 text-sm"
                        >
                          <span className="text-slate-700">
                            {item.inventory_item__name}
                          </span>

                          <span className="font-semibold text-slate-900">
                            {quantity(item.quantity)}{" "}
                            {item.inventory_item__unit}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState message="No wastage movements recorded in this period." />
                  )}
                </div>
              </section>
            )}

            {showInventory && (
              <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-slate-900">
                      Low stock alerts
                    </h2>
                    <p className="mt-1 text-xs text-slate-500">
                      Items at or below their reorder level
                    </p>
                  </div>

                  <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                    {lowStock.length} alerts
                  </span>
                </div>

                {lowStock.length ? (
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[550px] text-left text-sm">
                      <thead className="border-b border-slate-100 text-xs text-slate-500">
                        <tr>
                          <th className="py-3 pr-4 font-medium">Item</th>
                          <th className="py-3 pr-4 font-medium">Branch</th>
                          <th className="py-3 pr-4 font-medium">Current stock</th>
                          <th className="py-3 font-medium">Reorder level</th>
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-slate-100">
                        {lowStock.map((item, index) => (
                          <tr key={`${item.inventory_item_id}-${item.branch_name}-${index}`}>
                            <td className="py-3 pr-4 font-medium text-slate-800">
                              {item.item_name}
                            </td>

                            <td className="py-3 pr-4 text-slate-600">
                              {item.branch_name}
                            </td>

                            <td className="py-3 pr-4 font-semibold text-amber-700">
                              {quantity(item.quantity)} {item.unit}
                            </td>

                            <td className="py-3 text-slate-600">
                              {quantity(item.reorder_level)} {item.unit}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyState message="No low-stock items found." />
                )}
              </section>
            )}

            {showBranches && (
              <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="font-semibold text-slate-900">
                  Branch performance
                </h2>

                <p className="mt-1 text-xs text-slate-500">
                  Sales and order performance across accessible branches
                </p>

                {branchPerformance.length ? (
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[550px] text-left text-sm">
                      <thead className="border-b border-slate-100 text-xs text-slate-500">
                        <tr>
                          <th className="py-3 pr-4 font-medium">Branch</th>
                          <th className="py-3 pr-4 font-medium">Total orders</th>
                          <th className="py-3 pr-4 font-medium">Completed</th>
                          <th className="py-3 font-medium">Sales</th>
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-slate-100">
                        {branchPerformance.map((branch) => (
                          <tr key={branch.branch_id}>
                            <td className="py-3 pr-4 font-medium text-slate-800">
                              {branch.branch_name}
                            </td>

                            <td className="py-3 pr-4 text-slate-600">
                              {branch.total_orders}
                            </td>

                            <td className="py-3 pr-4 text-slate-600">
                              {branch.completed_orders}
                            </td>

                            <td className="py-3 font-semibold text-slate-900">
                              {money(branch.sales, currency)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyState message="No branch performance data available." />
                )}
              </section>
            )}

            <p className="mt-6 text-xs leading-5 text-slate-400">
              Reports use records currently available in RestaurantOS.
              Sales are calculated from completed orders. Payments received
              are calculated from completed payment transactions.
              Outstanding balances represent unpaid amounts on completed
              orders. Profit is not shown because reliable ingredient cost
              allocation is not yet available.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
