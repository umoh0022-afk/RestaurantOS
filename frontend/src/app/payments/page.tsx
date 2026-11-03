
"use client";

import { refreshSession } from "@/lib/auth";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

interface Restaurant {
  id: number;
  name: string;
  currency: string;
}

interface Order {
  id: number;
  order_number: string;
  customer_name: string;
  status: string;
  subtotal: string;
  created_at: string;
}

interface Payment {
  id: number;
  payment_number: string;
  order: number;
  order_number: string;
  order_total: string;
  payment_method: string;
  amount: string;
  status: string;
  reference: string;
  notes: string;
  received_by: number | null;
  paid_at: string | null;
  created_at: string;
}

async function getCsrfToken(): Promise<string> {
  const response = await fetch(`${API_URL}/auth/csrf/`, {
    credentials: "include",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Unable to initialise security verification.");
  }

  const cookie = document.cookie
    .split("; ")
    .find((item) => item.startsWith("csrftoken="));

  if (!cookie) {
    throw new Error("Security cookie not found. Please refresh and retry.");
  }

  return decodeURIComponent(cookie.split("=")[1]);
}

async function apiRequest<T>(
  url: string,
  method = "GET",
  body?: unknown,
  allowRefresh = true,
): Promise<T> {
  const headers = new Headers();

  if (body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
    headers.set("X-CSRFToken", await getCsrfToken());
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "include",
    cache: "no-store",
  });

  if (
    allowRefresh &&
    (response.status === 401 || response.status === 403)
  ) {
    try {
      await refreshSession();
      return apiRequest<T>(url, method, body, false);
    } catch {
      throw new Error("Your session has expired. Please log in again.");
    }
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      data.detail ||
      Object.entries(data)
        .map(([field, value]) => {
          const fieldMessage = Array.isArray(value)
            ? value.join(", ")
            : String(value);

          return `${field}: ${fieldMessage}`;
        })
        .join(" | ") ||
      "The request could not be completed.";

    throw new Error(message);
  }

  return data as T;
}

function getList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];

  if (
    data &&
    typeof data === "object" &&
    "results" in data &&
    Array.isArray((data as { results: unknown }).results)
  ) {
    return (data as { results: T[] }).results;
  }

  return [];
}

const paymentMethods = [
  { value: "cash", label: "Cash" },
  { value: "pos", label: "POS" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "card", label: "Card" },
  { value: "mobile_money", label: "Mobile Money" },
  { value: "other", label: "Other" },
];

export default function PaymentsPage() {
  const router = useRouter();

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState("all");

  const [form, setForm] = useState({
    order: "",
    payment_method: "cash",
    amount: "",
    reference: "",
    notes: "",
  });

  async function loadPayments() {
    setLoading(true);
    setError("");

    try {
      const restaurantData = await apiRequest<Restaurant[]>(
        `${API_URL}/restaurants/`,
      );

      if (!restaurantData.length) {
        router.replace("/onboarding");
        return;
      }

      const currentRestaurant = restaurantData[0];
      setRestaurant(currentRestaurant);

      const [orderData, paymentData] = await Promise.all([
        apiRequest<unknown>(
          `${API_URL}/orders/${currentRestaurant.id}/`,
        ),
        apiRequest<unknown>(
          `${API_URL}/payments/${currentRestaurant.id}/`,
        ),
      ]);

      const loadedOrders = getList<Order>(orderData);
      const loadedPayments = getList<Payment>(paymentData);

      setOrders(loadedOrders);
      setPayments(loadedPayments);

      const completedOrders = loadedOrders.filter(
        (order) => order.status === "completed",
      );

      setForm((previous) => ({
        ...previous,
        order:
          previous.order ||
          String(completedOrders[0]?.id || ""),
      }));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to load payments.";

      if (message.toLowerCase().includes("session has expired")) {
        router.replace("/login");
        return;
      }

      setError(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPayments();
    // Initial data load only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const money = (amount: string | number) => {
    const currency = restaurant?.currency || "NGN";

    try {
      return new Intl.NumberFormat("en", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(Number(amount));
    } catch {
      return `${currency} ${amount}`;
    }
  };

  const paidByOrder = useMemo(() => {
    const totals: Record<number, number> = {};

    payments
      .filter((payment) => payment.status === "completed")
      .forEach((payment) => {
        totals[payment.order] =
          (totals[payment.order] || 0) + Number(payment.amount);
      });

    return totals;
  }, [payments]);

  const completedOrders = orders.filter(
    (order) => order.status === "completed",
  );

  const totalSales = completedOrders.reduce(
    (total, order) => total + Number(order.subtotal || 0),
    0,
  );

  const totalReceived = payments
    .filter((payment) => payment.status === "completed")
    .reduce((total, payment) => total + Number(payment.amount), 0);

  const outstandingBalance = completedOrders.reduce((total, order) => {
    const balance =
      Number(order.subtotal) - (paidByOrder[order.id] || 0);

    return total + Math.max(0, balance);
  }, 0);

  const unpaidOrders = completedOrders.filter((order) => {
    const balance =
      Number(order.subtotal) - (paidByOrder[order.id] || 0);

    return balance > 0;
  });

  const selectedOrder = orders.find(
    (order) => order.id === Number(form.order),
  );

  const selectedOrderBalance = selectedOrder
    ? Math.max(
        0,
        Number(selectedOrder.subtotal) -
          (paidByOrder[selectedOrder.id] || 0),
      )
    : 0;

  const filteredPayments =
    selectedMethod === "all"
      ? payments
      : payments.filter(
          (payment) => payment.payment_method === selectedMethod,
        );

  function selectOrder(orderId: string) {
    const order = orders.find((item) => item.id === Number(orderId));

    const balance = order
      ? Math.max(
          0,
          Number(order.subtotal) - (paidByOrder[order.id] || 0),
        )
      : 0;

    setForm((previous) => ({
      ...previous,
      order: orderId,
      amount: balance > 0 ? balance.toFixed(2) : "",
    }));
  }

  async function recordPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!restaurant) return;

    const amount = Number(form.amount);

    if (!form.order) {
      setError("Please select an order.");
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a valid payment amount.");
      return;
    }

    if (amount > selectedOrderBalance) {
      setError(
        `Payment cannot exceed the outstanding balance of ${money(
          selectedOrderBalance,
        )}.`,
      );
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const payment = await apiRequest<Payment>(
        `${API_URL}/payments/${restaurant.id}/`,
        "POST",
        {
          order: Number(form.order),
          payment_method: form.payment_method,
          amount: amount.toFixed(2),
          reference: form.reference,
          notes: form.notes,
        },
      );

      setSuccess(
        `Payment ${payment.payment_number} recorded successfully.`,
      );

      setForm({
        order: "",
        payment_method: "cash",
        amount: "",
        reference: "",
        notes: "",
      });

      setShowForm(false);
      await loadPayments();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to record payment.",
      );
    } finally {
      setSaving(false);
    }
  }

  function paymentMethodLabel(method: string) {
    return (
      paymentMethods.find((item) => item.value === method)?.label ||
      method
    );
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-emerald-100 border-t-emerald-600" />
          <p className="mt-4 text-sm text-gray-500">
            Loading sales and payments...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f9fb] text-slate-900">
      <header className="flex h-[76px] items-center justify-between border-b border-gray-200 bg-white px-5 md:px-8">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-xl font-bold text-white"
          >
            R
          </Link>

          <div>
            <h1 className="font-bold">RestaurantOS</h1>
            <p className="text-[10px] tracking-widest text-gray-400">
              SALES & PAYMENTS
            </p>
          </div>
        </div>

        <Link
          href="/dashboard"
          className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50"
        >
          Back to dashboard
        </Link>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-8 md:px-8">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-600">
              RESTAURANT OPERATIONS
            </p>

            <h2 className="mt-2 text-3xl font-bold">
              Sales & Payments
            </h2>

            <p className="mt-2 text-sm text-gray-500">
              Monitor revenue, collect payments and track outstanding balances.
            </p>

            {restaurant && (
              <p className="mt-2 text-sm font-semibold text-slate-700">
                {restaurant.name}
              </p>
            )}
          </div>

          <button
            onClick={() => {
              setError("");
              setSuccess("");
              setForm({
                order: "",
                payment_method: "cash",
                amount: "",
                reference: "",
                notes: "",
              });
              setShowForm(!showForm);
            }}
            className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            {showForm ? "Close form" : "+ Record payment"}
          </button>
        </div>

        {error && (
          <div
            role="alert"
            className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          >
            {error}
          </div>
        )}

        {success && (
          <div
            role="status"
            className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700"
          >
            {success}
          </div>
        )}

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              label: "Completed sales",
              value: money(totalSales),
              description: `${completedOrders.length} completed orders`,
            },
            {
              label: "Payments received",
              value: money(totalReceived),
              description: `${payments.filter((p) => p.status === "completed").length} successful payments`,
            },
            {
              label: "Outstanding balance",
              value: money(outstandingBalance),
              description: `${unpaidOrders.length} orders awaiting payment`,
            },
            {
              label: "Total transactions",
              value: payments.length,
              description: "Recorded payment entries",
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
            >
              <p className="text-sm text-gray-500">{stat.label}</p>
              <p className="mt-3 break-words text-2xl font-bold">
                {stat.value}
              </p>
              <p className="mt-2 text-xs text-gray-400">
                {stat.description}
              </p>
            </div>
          ))}
        </div>

        {showForm && (
          <form
            onSubmit={recordPayment}
            className="mt-8 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
          >
            <h3 className="text-lg font-bold">Record a payment</h3>

            <p className="mt-1 text-sm text-gray-500">
              Payments can only be recorded against completed orders.
            </p>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-2 block text-sm font-medium">
                  Select order *
                </label>

                <select
                  required
                  value={form.order}
                  onChange={(e) => selectOrder(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm"
                >
                  <option value="">Choose a completed order</option>

                  {unpaidOrders.map((order) => {
                    const balance =
                      Number(order.subtotal) -
                      (paidByOrder[order.id] || 0);

                    return (
                      <option key={order.id} value={order.id}>
                        {order.order_number} —{" "}
                        {order.customer_name || "Walk-in customer"} —{" "}
                        Balance: {money(balance)}
                      </option>
                    );
                  })}
                </select>

                {unpaidOrders.length === 0 && (
                  <p className="mt-2 text-xs text-amber-600">
                    There are currently no completed orders with outstanding balances.
                  </p>
                )}
              </div>

              {selectedOrder && (
                <div className="sm:col-span-2 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-3">
                  <div>
                    <p className="text-xs text-gray-500">Order total</p>
                    <p className="mt-1 font-bold">
                      {money(selectedOrder.subtotal)}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-gray-500">Already received</p>
                    <p className="mt-1 font-bold">
                      {money(paidByOrder[selectedOrder.id] || 0)}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-gray-500">Outstanding</p>
                    <p className="mt-1 font-bold text-amber-700">
                      {money(selectedOrderBalance)}
                    </p>
                  </div>
                </div>
              )}

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Payment method *
                </label>

                <select
                  required
                  value={form.payment_method}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      payment_method: e.target.value,
                    })
                  }
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm"
                >
                  {paymentMethods.map((method) => (
                    <option key={method.value} value={method.value}>
                      {method.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Amount received *
                </label>

                <input
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  max={selectedOrderBalance || undefined}
                  value={form.amount}
                  onChange={(e) =>
                    setForm({ ...form, amount: e.target.value })
                  }
                  placeholder="Enter amount"
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Transaction reference
                </label>

                <input
                  value={form.reference}
                  onChange={(e) =>
                    setForm({ ...form, reference: e.target.value })
                  }
                  placeholder="Bank or POS reference"
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Notes
                </label>

                <input
                  value={form.notes}
                  onChange={(e) =>
                    setForm({ ...form, notes: e.target.value })
                  }
                  placeholder="Optional notes"
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm"
                />
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={saving || !form.order || selectedOrderBalance <= 0}
                className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {saving ? "Recording payment..." : "Save payment"}
              </button>

              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-xl border border-gray-200 px-5 py-3 text-sm font-semibold text-gray-600"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        <div className="mt-9 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-bold">Payment history</h3>
            <p className="mt-1 text-sm text-gray-500">
              All recorded transactions for this restaurant.
            </p>
          </div>

          <select
            value={selectedMethod}
            onChange={(e) => setSelectedMethod(e.target.value)}
            className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm"
          >
            <option value="all">All payment methods</option>
            {paymentMethods.map((method) => (
              <option key={method.value} value={method.value}>
                {method.label}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-5 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          {filteredPayments.length === 0 ? (
            <div className="p-12 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-2xl">
                ₦
              </div>

              <h3 className="mt-4 font-bold">No payments found</h3>

              <p className="mt-2 text-sm text-gray-500">
                Record your first payment to see transactions here.
              </p>

              {!showForm && unpaidOrders.length > 0 && (
                <button
                  onClick={() => setShowForm(true)}
                  className="mt-5 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white"
                >
                  Record first payment
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-5 py-4">Payment</th>
                    <th className="px-5 py-4">Order</th>
                    <th className="px-5 py-4">Method</th>
                    <th className="px-5 py-4">Amount</th>
                    <th className="px-5 py-4">Reference</th>
                    <th className="px-5 py-4">Status</th>
                    <th className="px-5 py-4">Date</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100">
                  {filteredPayments.map((payment) => (
                    <tr key={payment.id} className="hover:bg-slate-50">
                      <td className="px-5 py-4">
                        <p className="font-bold">
                          {payment.payment_number}
                        </p>
                        <p className="mt-1 text-xs text-gray-400">
                          Transaction #{payment.id}
                        </p>
                      </td>

                      <td className="px-5 py-4">
                        <p className="font-semibold">
                          {payment.order_number}
                        </p>
                        <p className="mt-1 text-xs text-gray-400">
                          Order #{payment.order}
                        </p>
                      </td>

                      <td className="px-5 py-4">
                        {paymentMethodLabel(payment.payment_method)}
                      </td>

                      <td className="px-5 py-4 font-bold">
                        {money(payment.amount)}
                      </td>

                      <td className="px-5 py-4 text-gray-500">
                        {payment.reference || "—"}
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            payment.status === "completed"
                              ? "bg-green-100 text-green-800"
                              : payment.status === "pending"
                                ? "bg-amber-50 text-amber-700"
                                : payment.status === "refunded"
                                  ? "bg-purple-50 text-purple-700"
                                  : "bg-red-50 text-red-700"
                          }`}
                        >
                          {payment.status}
                        </span>
                      </td>

                      <td className="px-5 py-4 text-gray-500">
                        {payment.paid_at
                          ? new Date(payment.paid_at).toLocaleString()
                          : new Date(payment.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
