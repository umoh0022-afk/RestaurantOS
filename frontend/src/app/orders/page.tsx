"use client";

import { refreshSession } from "@/lib/auth";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

interface Restaurant {
  id: number;
  name: string;
  currency: string;
}

interface Branch {
  id: number;
  name: string;
  code: string;
}

interface MenuItem {
  id: number;
  name: string;
  price: string;
  category_name: string;
  is_available: boolean;
}

interface OrderItem {
  id: number;
  menu_item: number;
  menu_item_name: string;
  quantity: number;
  unit_price: string;
  line_total: string;
}

interface Order {
  id: number;
  order_number: string;
  restaurant: number;
  branch: number;
  branch_name: string;
  order_type: "dine_in" | "takeaway" | "delivery";
  customer_name: string;
  customer_phone: string;
  table_number: string;
  status: string;
  notes: string;
  items: OrderItem[];
  subtotal: string;
  completed_at: string | null;
  stock_deducted_at: string | null;
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

  // Django REST Framework can return either 401 or 403 when the
  // cookie-based access token is missing or expired.
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
      data.order?.[0] ||
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

const statusStyles: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700",
  confirmed: "bg-blue-50 text-blue-700",
  preparing: "bg-purple-50 text-purple-700",
  ready: "bg-emerald-50 text-emerald-700",
  completed: "bg-green-100 text-green-800",
  cancelled: "bg-red-50 text-red-700",
};

export default function OrdersPage() {
  const router = useRouter();

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [completingId, setCompletingId] = useState<number | null>(null);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState("all");

  const [form, setForm] = useState({
    branch: "",
    order_type: "dine_in",
    customer_name: "",
    customer_phone: "",
    table_number: "",
    notes: "",
  });

  const [selectedItems, setSelectedItems] = useState<
    { menu_item: number; quantity: number }[]
  >([]);

  async function loadOrders() {
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

      const base = `${API_URL}/orders/${currentRestaurant.id}`;

      const [orderData, branchData, menuData] = await Promise.all([
        apiRequest<unknown>(`${base}/`),
        apiRequest<unknown>(
          `${API_URL}/restaurants/${currentRestaurant.id}/branches/`,
        ),
        apiRequest<unknown>(
          `${API_URL}/restaurants/${currentRestaurant.id}/menu/items/`,
        ),
      ]);

      setOrders(getList<Order>(orderData));
      setBranches(getList<Branch>(branchData));
      setMenuItems(
        getList<MenuItem>(menuData).filter((item) => item.is_available),
      );

      setForm((previous) => ({
        ...previous,
        branch:
          previous.branch ||
          String(getList<Branch>(branchData)[0]?.id || ""),
      }));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to load orders.";

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
    loadOrders();
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

  function addItem(menuItemId: string) {
    const id = Number(menuItemId);
    if (!id) return;

    setSelectedItems((previous) => {
      const existing = previous.find((item) => item.menu_item === id);

      if (existing) {
        return previous.map((item) =>
          item.menu_item === id
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        );
      }

      return [...previous, { menu_item: id, quantity: 1 }];
    });
  }

  function changeQuantity(menuItemId: number, quantity: number) {
    if (quantity < 1) {
      setSelectedItems((previous) =>
        previous.filter((item) => item.menu_item !== menuItemId),
      );
      return;
    }

    setSelectedItems((previous) =>
      previous.map((item) =>
        item.menu_item === menuItemId ? { ...item, quantity } : item,
      ),
    );
  }

  const orderTotal = selectedItems.reduce((total, selected) => {
    const menuItem = menuItems.find(
      (item) => item.id === selected.menu_item,
    );

    return total + Number(menuItem?.price || 0) * selected.quantity;
  }, 0);

  async function createOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!restaurant) return;

    if (!form.branch) {
      setError("Please select a branch.");
      return;
    }

    if (selectedItems.length === 0) {
      setError("Please add at least one menu item.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      await apiRequest(
        `${API_URL}/orders/${restaurant.id}/`,
        "POST",
        {
          branch: Number(form.branch),
          order_type: form.order_type,
          customer_name: form.customer_name,
          customer_phone: form.customer_phone,
          table_number: form.table_number,
          notes: form.notes,
          items: selectedItems,
        },
      );

      setShowForm(false);
      setSelectedItems([]);

      setForm({
        branch: String(branches[0]?.id || ""),
        order_type: "dine_in",
        customer_name: "",
        customer_phone: "",
        table_number: "",
        notes: "",
      });

      setSuccess("Order created successfully.");
      await loadOrders();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to create order.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function completeOrder(order: Order) {
    if (!restaurant) return;

    if (
      !window.confirm(
        `Complete ${order.order_number}? This will deduct recipe ingredients from branch stock.`,
      )
    ) {
      return;
    }

    setCompletingId(order.id);
    setError("");
    setSuccess("");

    try {
      await apiRequest(
        `${API_URL}/orders/${restaurant.id}/${order.id}/complete/`,
        "POST",
        {},
      );

      setSuccess(
        `${order.order_number} completed successfully. Stock has been updated.`,
      );

      await loadOrders();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to complete order.",
      );
    } finally {
      setCompletingId(null);
    }
  }

  const filteredOrders =
    selectedStatus === "all"
      ? orders
      : orders.filter((order) => order.status === selectedStatus);

  const totalRevenue = orders
    .filter((order) => order.status === "completed")
    .reduce((total, order) => total + Number(order.subtotal || 0), 0);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-emerald-100 border-t-emerald-600" />
          <p className="mt-4 text-sm text-gray-500">
            Loading order management...
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
              ORDER MANAGEMENT
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

            <h2 className="mt-2 text-3xl font-bold">Orders</h2>

            <p className="mt-2 text-sm text-gray-500">
              Create orders, monitor their progress and manage completed sales.
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
              setShowForm(!showForm);
            }}
            className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            {showForm ? "Close form" : "+ Create order"}
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
            { label: "Total orders", value: orders.length },
            {
              label: "Pending orders",
              value: orders.filter((o) => o.status === "pending").length,
            },
            {
              label: "Preparing",
              value: orders.filter((o) => o.status === "preparing").length,
            },
            { label: "Completed sales", value: money(totalRevenue) },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
            >
              <p className="text-sm text-gray-500">{stat.label}</p>
              <p className="mt-3 text-2xl font-bold">{stat.value}</p>
            </div>
          ))}
        </div>

        {showForm && (
          <form
            onSubmit={createOrder}
            className="mt-8 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
          >
            <h3 className="text-lg font-bold">Create a new order</h3>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium">
                  Branch *
                </label>
                <select
                  required
                  value={form.branch}
                  onChange={(e) =>
                    setForm({ ...form, branch: e.target.value })
                  }
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm"
                >
                  <option value="">Select branch</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name} ({branch.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Order type *
                </label>
                <select
                  value={form.order_type}
                  onChange={(e) =>
                    setForm({ ...form, order_type: e.target.value })
                  }
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm"
                >
                  <option value="dine_in">Dine in</option>
                  <option value="takeaway">Takeaway</option>
                  <option value="delivery">Delivery</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Customer name
                </label>
                <input
                  value={form.customer_name}
                  onChange={(e) =>
                    setForm({ ...form, customer_name: e.target.value })
                  }
                  placeholder="Customer name"
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Customer phone
                </label>
                <input
                  value={form.customer_phone}
                  onChange={(e) =>
                    setForm({ ...form, customer_phone: e.target.value })
                  }
                  placeholder="080..."
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm"
                />
              </div>

              {form.order_type === "dine_in" && (
                <div>
                  <label className="mb-2 block text-sm font-medium">
                    Table number
                  </label>
                  <input
                    value={form.table_number}
                    onChange={(e) =>
                      setForm({ ...form, table_number: e.target.value })
                    }
                    placeholder="e.g. T01"
                    className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm"
                  />
                </div>
              )}

              <div className="sm:col-span-2">
                <label className="mb-2 block text-sm font-medium">
                  Order notes
                </label>
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) =>
                    setForm({ ...form, notes: e.target.value })
                  }
                  placeholder="Additional instructions..."
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm"
                />
              </div>
            </div>

            <div className="mt-7 border-t border-gray-100 pt-6">
              <h4 className="font-bold">Order items</h4>

              <select
                value=""
                onChange={(e) => addItem(e.target.value)}
                className="mt-4 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm"
              >
                <option value="">Choose a menu item to add</option>
                {menuItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} — {money(item.price)}
                  </option>
                ))}
              </select>

              <div className="mt-4 space-y-3">
                {selectedItems.map((selected) => {
                  const item = menuItems.find(
                    (menuItem) => menuItem.id === selected.menu_item,
                  );

                  if (!item) return null;

                  return (
                    <div
                      key={selected.menu_item}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 p-4"
                    >
                      <div>
                        <p className="font-semibold">{item.name}</p>
                        <p className="text-xs text-gray-500">
                          {money(item.price)} each
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        <input
                          type="number"
                          min="1"
                          value={selected.quantity}
                          onChange={(e) =>
                            changeQuantity(
                              selected.menu_item,
                              Number(e.target.value),
                            )
                          }
                          className="w-20 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        />
                        <p className="min-w-24 text-right text-sm font-bold">
                          {money(Number(item.price) * selected.quantity)}
                        </p>
                        <button
                          type="button"
                          onClick={() =>
                            changeQuantity(selected.menu_item, 0)
                          }
                          className="text-sm font-semibold text-red-600"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-5 flex justify-between border-t border-gray-100 pt-5">
                <span className="font-semibold">Estimated total</span>
                <span className="text-xl font-bold">
                  {money(orderTotal)}
                </span>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                disabled={saving || selectedItems.length === 0}
                className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                {saving ? "Creating order..." : "Create order"}
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
          <h3 className="text-xl font-bold">Order history</h3>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm"
          >
            <option value="all">All orders</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="preparing">Preparing</option>
            <option value="ready">Ready</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        <div className="mt-5 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          {filteredOrders.length === 0 ? (
            <div className="p-12 text-center">
              <h3 className="font-bold">No orders found</h3>
              <p className="mt-2 text-sm text-gray-500">
                Create your first order to get started.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-5 py-4">Order</th>
                    <th className="px-5 py-4">Customer</th>
                    <th className="px-5 py-4">Branch</th>
                    <th className="px-5 py-4">Type</th>
                    <th className="px-5 py-4">Total</th>
                    <th className="px-5 py-4">Status</th>
                    <th className="px-5 py-4">Action</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100">
                  {filteredOrders.map((order) => (
                    <tr key={order.id} className="hover:bg-slate-50">
                      <td className="px-5 py-4">
                        <p className="font-bold">{order.order_number}</p>
                        <p className="mt-1 text-xs text-gray-400">
                          {new Date(order.created_at).toLocaleString()}
                        </p>
                      </td>

                      <td className="px-5 py-4">
                        <p className="font-medium">
                          {order.customer_name || "Walk-in customer"}
                        </p>
                        <p className="mt-1 text-xs text-gray-400">
                          {order.customer_phone || "No phone"}
                        </p>
                      </td>

                      <td className="px-5 py-4">
                        {order.branch_name}
                      </td>

                      <td className="px-5 py-4 capitalize">
                        {order.order_type.replace("_", " ")}
                      </td>

                      <td className="px-5 py-4 font-semibold">
                        {money(order.subtotal)}
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            statusStyles[order.status] ||
                            "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {order.status}
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        {order.status !== "completed" &&
                        order.status !== "cancelled" ? (
                          <button
                            onClick={() => completeOrder(order)}
                            disabled={completingId === order.id}
                            className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                          >
                            {completingId === order.id
                              ? "Completing..."
                              : "Complete order"}
                          </button>
                        ) : order.status === "completed" ? (
                          <span className="text-xs font-medium text-emerald-700">
                            Stock updated
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">
                            No action
                          </span>
                        )}
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
