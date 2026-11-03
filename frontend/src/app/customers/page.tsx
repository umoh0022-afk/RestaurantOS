
"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { refreshSession } from "@/lib/auth";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

interface Restaurant {
  id: number;
  name: string;
  currency: string;
}

interface CustomerRecord {
  id: number;
  restaurant: number;
  full_name: string;
  phone: string;
  email: string;
  birthday: string | null;
  address: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

interface Order {
  id: number;
  order_number: string;
  customer_id?: number | null;
  customer_name: string;
  customer_phone: string;
  status: string;
  subtotal: string;
  created_at: string;
  completed_at: string | null;
}

interface Customer {
  key: string;
  id: number;
  name: string;
  phone: string;
  email: string;
  birthday: string | null;
  address: string;
  notes: string;
  totalOrders: number;
  completedOrders: number;
  totalSpent: number;
  lastOrder: string;
  orders: Order[];
}

interface CustomerForm {
  full_name: string;
  phone: string;
  email: string;
  birthday: string;
  address: string;
  notes: string;
}

const EMPTY_FORM: CustomerForm = {
  full_name: "",
  phone: "",
  email: "",
  birthday: "",
  address: "",
  notes: "",
};

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

  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
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
      (data as { detail?: string }).detail ||
      Object.entries(data as Record<string, unknown>)
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

function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: currency || "NGN",
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}

function formatDate(value: string) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function normalizePhone(phone: string) {
  return (phone || "").replace(/\s+/g, "").toLowerCase();
}

function buildCustomers(
  records: CustomerRecord[],
  orders: Order[],
): Customer[] {
  return records
    .map((record) => {
      const customerOrders = orders.filter((order) => {
        if (order.customer_id != null) {
          return order.customer_id === record.id;
        }

        return (
          !!record.phone &&
          normalizePhone(order.customer_phone) ===
            normalizePhone(record.phone)
        );
      });

      const completedOrders = customerOrders.filter(
        (order) => order.status === "completed",
      );

      const totalSpent = completedOrders.reduce(
        (total, order) =>
          total + Number(order.subtotal || 0),
        0,
      );

      const sortedOrders = [...customerOrders].sort(
        (a, b) =>
          new Date(b.created_at).getTime() -
          new Date(a.created_at).getTime(),
      );

      return {
        key: String(record.id),
        id: record.id,
        name: record.full_name,
        phone: record.phone || "",
        email: record.email || "",
        birthday: record.birthday,
        address: record.address || "",
        notes: record.notes || "",
        totalOrders: customerOrders.length,
        completedOrders: completedOrders.length,
        totalSpent,
        lastOrder:
          sortedOrders[0]?.created_at || record.created_at,
        orders: sortedOrders,
      };
    })
    .sort(
      (a, b) =>
        new Date(b.lastOrder).getTime() -
        new Date(a.lastOrder).getTime(),
    );
}

export default function CustomersPage() {
  const router = useRouter();

  const [restaurant, setRestaurant] =
    useState<Restaurant | null>(null);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [search, setSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] =
    useState<Customer | null>(null);

  const [sortBy, setSortBy] = useState<
    "recent" | "orders" | "spent"
  >("recent");

  const [showForm, setShowForm] = useState(false);
  const [editingCustomer, setEditingCustomer] =
    useState<Customer | null>(null);
  const [form, setForm] = useState<CustomerForm>(EMPTY_FORM);

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const restaurantData = await apiRequest<unknown>(
        `${API_URL}/restaurants/`,
      );

      const restaurants = getList<Restaurant>(restaurantData);

      if (!restaurants.length) {
        router.replace("/onboarding");
        return;
      }

      const currentRestaurant = restaurants[0];
      setRestaurant(currentRestaurant);

      const [customerData, orderData] = await Promise.all([
        apiRequest<unknown>(
          `${API_URL}/customers/${currentRestaurant.id}/`,
        ),
        apiRequest<unknown>(
          `${API_URL}/orders/${currentRestaurant.id}/`,
        ),
      ]);

      setCustomers(
        buildCustomers(
          getList<CustomerRecord>(customerData),
          getList<Order>(orderData),
        ),
      );
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Unable to load customers.";

      setError(message);

      if (message.toLowerCase().includes("log in")) {
        router.replace("/login");
      }
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadCustomers();
  }, [loadCustomers]);

  function openCreateForm() {
    setEditingCustomer(null);
    setForm(EMPTY_FORM);
    setError("");
    setSuccess("");
    setShowForm(true);
  }

  function openEditForm(customer: Customer) {
    setEditingCustomer(customer);
    setForm({
      full_name: customer.name,
      phone: customer.phone,
      email: customer.email,
      birthday: customer.birthday || "",
      address: customer.address,
      notes: customer.notes,
    });
    setSelectedCustomer(null);
    setError("");
    setSuccess("");
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingCustomer(null);
    setForm(EMPTY_FORM);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!restaurant) return;

    setSaving(true);
    setError("");
    setSuccess("");

    const payload = {
      full_name: form.full_name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      birthday: form.birthday || null,
      address: form.address.trim(),
      notes: form.notes.trim(),
    };

    try {
      const url = editingCustomer
        ? `${API_URL}/customers/${restaurant.id}/${editingCustomer.id}/`
        : `${API_URL}/customers/${restaurant.id}/`;

      await apiRequest(
        url,
        editingCustomer ? "PATCH" : "POST",
        payload,
      );

      closeForm();
      setSuccess(
        editingCustomer
          ? "Customer details updated successfully."
          : "Customer created successfully.",
      );

      await loadCustomers();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to save customer.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(customer: Customer) {
    if (!restaurant) return;

    const confirmed = window.confirm(
      `Permanently delete ${customer.name} from your customer database? Existing orders will be preserved, but this customer profile cannot be recovered.`,
    );

    if (!confirmed) return;

    setDeleting(true);
    setError("");
    setSuccess("");

    try {
      await apiRequest(
        `${API_URL}/customers/${restaurant.id}/${customer.id}/`,
        "DELETE",
      );

      setSelectedCustomer(null);
      setSuccess(`${customer.name} was deleted successfully.`);

      await loadCustomers();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to delete customer.",
      );
    } finally {
      setDeleting(false);
    }
  }

  const filteredCustomers = useMemo(() => {
    const query = search.trim().toLowerCase();

    let result = customers.filter((customer) => {
      return (
        customer.name.toLowerCase().includes(query) ||
        customer.phone.toLowerCase().includes(query) ||
        customer.email.toLowerCase().includes(query)
      );
    });

    if (sortBy === "orders") {
      result = [...result].sort(
        (a, b) => b.totalOrders - a.totalOrders,
      );
    }

    if (sortBy === "spent") {
      result = [...result].sort(
        (a, b) => b.totalSpent - a.totalSpent,
      );
    }

    return result;
  }, [customers, search, sortBy]);

  const totalCustomers = customers.length;

  const repeatCustomers = customers.filter(
    (customer) => customer.totalOrders > 1,
  ).length;

  const totalCustomerSales = customers.reduce(
    (sum, customer) => sum + customer.totalSpent,
    0,
  );

  const averageCustomerSpend =
    totalCustomers > 0
      ? totalCustomerSales / totalCustomers
      : 0;

  const currency = restaurant?.currency || "NGN";

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-indigo-100 border-t-indigo-600" />
          <p className="mt-4 text-sm text-slate-500">
            Loading customer records...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="flex min-h-[76px] items-center justify-between border-b border-slate-200 bg-white px-5 md:px-8">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-xl font-bold text-white"
          >
            R
          </Link>

          <div>
            <h1 className="font-bold">RestaurantOS</h1>
            <p className="text-[10px] tracking-widest text-slate-400">
              CUSTOMER MANAGEMENT
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => void loadCustomers()}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            Refresh
          </button>

          <Link
            href="/dashboard"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
          >
            Dashboard
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-8 md:px-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-indigo-600">
              CUSTOMER RELATIONSHIPS
            </p>

            <h2 className="mt-2 text-3xl font-bold">
              Customers
            </h2>

            <p className="mt-2 text-sm text-slate-500">
              Manage customer profiles, monitor purchases and
              identify repeat customers.
            </p>

            {restaurant && (
              <p className="mt-2 text-sm font-semibold text-slate-700">
                {restaurant.name}
              </p>
            )}
          </div>

          <button
            onClick={openCreateForm}
            className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
          >
            + Add customer
          </button>
        </div>

        {error && !showForm && (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {success && (
          <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
            {success}
          </div>
        )}

        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Total customers</p>
            <h3 className="mt-2 text-3xl font-bold">
              {totalCustomers.toLocaleString()}
            </h3>
            <p className="mt-2 text-xs text-slate-400">
              Permanent customer records
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Repeat customers</p>
            <h3 className="mt-2 text-3xl font-bold text-emerald-600">
              {repeatCustomers.toLocaleString()}
            </h3>
            <p className="mt-2 text-xs text-slate-400">
              Customers with multiple orders
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">
              Completed customer sales
            </p>
            <h3 className="mt-2 text-2xl font-bold">
              {formatMoney(totalCustomerSales, currency)}
            </h3>
            <p className="mt-2 text-xs text-slate-400">
              From completed orders
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">
              Average spend per customer
            </p>
            <h3 className="mt-2 text-2xl font-bold">
              {formatMoney(averageCustomerSpend, currency)}
            </h3>
            <p className="mt-2 text-xs text-slate-400">
              Completed sales divided by customers
            </p>
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-slate-100 p-5 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-lg font-bold">
                Customer directory
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                Saved customer profiles from your database.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name, phone or email..."
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-indigo-500 sm:w-64"
              />

              <select
                value={sortBy}
                onChange={(event) =>
                  setSortBy(
                    event.target.value as
                      | "recent"
                      | "orders"
                      | "spent",
                  )
                }
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-indigo-500"
              >
                <option value="recent">Most recent</option>
                <option value="orders">Most orders</option>
                <option value="spent">Highest spending</option>
              </select>
            </div>
          </div>

          {filteredCustomers.length === 0 ? (
            <div className="px-5 py-16 text-center">
              <div className="text-4xl">👥</div>
              <h4 className="mt-4 font-semibold">
                No customers found
              </h4>
              <p className="mt-2 text-sm text-slate-500">
                {search
                  ? "Try another name, phone number or email."
                  : "Add a customer or create an order to get started."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] text-left">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-4 font-semibold">Customer</th>
                    <th className="px-5 py-4 font-semibold">Phone</th>
                    <th className="px-5 py-4 font-semibold">Email</th>
                    <th className="px-5 py-4 font-semibold">Orders</th>
                    <th className="px-5 py-4 font-semibold">Total spent</th>
                    <th className="px-5 py-4 font-semibold">Last order</th>
                    <th className="px-5 py-4 font-semibold">Action</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {filteredCustomers.map((customer) => (
                    <tr key={customer.key} className="hover:bg-slate-50">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-100 font-bold text-indigo-700">
                            {customer.name.charAt(0).toUpperCase()}
                          </div>

                          <div>
                            <p className="font-semibold">{customer.name}</p>
                            {customer.totalOrders > 1 && (
                              <span className="mt-1 inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                Repeat customer
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-4 text-sm text-slate-600">
                        {customer.phone || "Not provided"}
                      </td>

                      <td className="px-5 py-4 text-sm text-slate-600">
                        {customer.email || "Not provided"}
                      </td>

                      <td className="px-5 py-4 text-sm font-semibold">
                        {customer.totalOrders}
                      </td>

                      <td className="px-5 py-4 text-sm font-semibold">
                        {formatMoney(customer.totalSpent, currency)}
                      </td>

                      <td className="px-5 py-4 text-sm text-slate-600">
                        {customer.orders.length
                          ? formatDate(customer.lastOrder)
                          : "No orders yet"}
                      </td>

                      <td className="px-5 py-4">
                        <button
                          onClick={() => setSelectedCustomer(customer)}
                          className="rounded-lg border border-indigo-200 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
                        >
                          View details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="border-t border-slate-100 px-5 py-4 text-xs text-slate-500">
            Showing {filteredCustomers.length} of {customers.length} customers
          </div>
        </div>
      </section>

      {/* Add and edit customer form */}
      {showForm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4">
          <div className="my-8 w-full max-w-xl rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 p-6">
              <div>
                <h3 className="text-xl font-bold">
                  {editingCustomer ? "Edit customer" : "Add customer"}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Enter the customer's contact information.
                </p>
              </div>

              <button
                onClick={closeForm}
                disabled={saving}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 p-6">
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-sm font-semibold">
                  Full name *
                </label>
                <input
                  required
                  value={form.full_name}
                  onChange={(event) =>
                    setForm({ ...form, full_name: event.target.value })
                  }
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-500"
                  placeholder="Customer's full name"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-semibold">
                    Phone number
                  </label>
                  <input
                    value={form.phone}
                    onChange={(event) =>
                      setForm({ ...form, phone: event.target.value })
                    }
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-500"
                    placeholder="+234..."
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-semibold">
                    Email address
                  </label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(event) =>
                      setForm({ ...form, email: event.target.value })
                    }
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-500"
                    placeholder="customer@example.com"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold">
                  Birthday
                </label>
                <input
                  type="date"
                  value={form.birthday}
                  onChange={(event) =>
                    setForm({ ...form, birthday: event.target.value })
                  }
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold">
                  Address
                </label>
                <textarea
                  rows={2}
                  value={form.address}
                  onChange={(event) =>
                    setForm({ ...form, address: event.target.value })
                  }
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-500"
                  placeholder="Customer address"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold">
                  Notes
                </label>
                <textarea
                  rows={3}
                  value={form.notes}
                  onChange={(event) =>
                    setForm({ ...form, notes: event.target.value })
                  }
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-500"
                  placeholder="Preferences, special requests or other notes"
                />
              </div>

              <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={closeForm}
                  disabled={saving}
                  className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving
                    ? "Saving..."
                    : editingCustomer
                      ? "Save changes"
                      : "Create customer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Customer details */}
      {selectedCustomer && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          onClick={() => setSelectedCustomer(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-slate-100 p-6">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-indigo-600">
                  CUSTOMER PROFILE
                </p>

                <h3 className="mt-2 text-2xl font-bold">
                  {selectedCustomer.name}
                </h3>

                <p className="mt-1 text-sm text-slate-500">
                  {selectedCustomer.phone || "No phone number provided"}
                </p>

                {selectedCustomer.email && (
                  <p className="mt-1 text-sm text-slate-500">
                    {selectedCustomer.email}
                  </p>
                )}
              </div>

              <button
                onClick={() => setSelectedCustomer(null)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="flex flex-wrap gap-2 px-6 pt-5">
              <button
                onClick={() => openEditForm(selectedCustomer)}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                Edit customer
              </button>

              <button
                onClick={() => void handleDelete(selectedCustomer)}
                disabled={deleting}
                className="rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
              >
                {deleting ? "Deleting..." : "Delete customer"}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 p-6 sm:grid-cols-3">
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs text-slate-500">Total orders</p>
                <p className="mt-2 text-xl font-bold">
                  {selectedCustomer.totalOrders}
                </p>
              </div>

              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs text-slate-500">Completed orders</p>
                <p className="mt-2 text-xl font-bold">
                  {selectedCustomer.completedOrders}
                </p>
              </div>

              <div className="col-span-2 rounded-xl bg-indigo-50 p-4 sm:col-span-1">
                <p className="text-xs text-indigo-600">Total spent</p>
                <p className="mt-2 text-lg font-bold text-indigo-900">
                  {formatMoney(selectedCustomer.totalSpent, currency)}
                </p>
              </div>
            </div>

            <div className="space-y-3 px-6 pb-6">
              <h4 className="font-bold">Customer information</h4>

              <div className="rounded-xl bg-slate-50 p-4 text-sm">
                <p>
                  <span className="font-semibold">Birthday:</span>{" "}
                  {selectedCustomer.birthday
                    ? formatDate(selectedCustomer.birthday)
                    : "Not provided"}
                </p>

                <p className="mt-2">
                  <span className="font-semibold">Address:</span>{" "}
                  {selectedCustomer.address || "Not provided"}
                </p>

                <p className="mt-2">
                  <span className="font-semibold">Notes:</span>{" "}
                  {selectedCustomer.notes || "No notes"}
                </p>
              </div>

              <h4 className="pt-3 font-bold">Order history</h4>

              {selectedCustomer.orders.length === 0 ? (
                <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">
                  No orders have been linked to this customer yet.
                </p>
              ) : (
                <div className="space-y-3">
                  {selectedCustomer.orders.map((order) => (
                    <div
                      key={order.id}
                      className="flex flex-col justify-between gap-3 rounded-xl border border-slate-100 p-4 sm:flex-row sm:items-center"
                    >
                      <div>
                        <p className="font-semibold">
                          {order.order_number}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {formatDate(order.created_at)}
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            order.status === "completed"
                              ? "bg-emerald-50 text-emerald-700"
                              : order.status === "cancelled"
                                ? "bg-red-50 text-red-700"
                                : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          {order.status}
                        </span>

                        <span className="font-bold">
                          {formatMoney(
                            Number(order.subtotal || 0),
                            currency,
                          )}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
