
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  getCurrentUser,
  logoutUser,
  refreshSession,
  User,
} from "@/lib/auth";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

interface Restaurant {
  id: number;
  name: string;
  legal_name: string;
  restaurant_type: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  country: string;
  currency: string;
  is_active: boolean;
  created_at: string;
}

interface DashboardOrder {
  id: number;
  status: string;
  subtotal: string;
}

interface DashboardPayment {
  id: number;
  amount: string;
  status: string;
}

interface DashboardInventoryItem {
  id: number;
  name: string;
  reorder_level: string;
  is_active: boolean;
}

interface DashboardStockLevel {
  inventory_item: number;
  quantity: string;
}

type DashboardMetrics = {
  totalOrders: number;
  completedOrders: number;
  totalSales: number;
  paymentsReceived: number;
  outstanding: number;
  menuItems: number;
  inventoryItems: number;
  lowStockItems: number;
  branches: number;
};

const emptyMetrics: DashboardMetrics = {
  totalOrders: 0,
  completedOrders: 0,
  totalSales: 0,
  paymentsReceived: 0,
  outstanding: 0,
  menuItems: 0,
  inventoryItems: 0,
  lowStockItems: 0,
  branches: 0,
};

function asList<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (
    value &&
    typeof value === "object" &&
    "results" in value &&
    Array.isArray((value as { results: unknown }).results)
  ) {
    return (value as { results: T[] }).results;
  }
  return [];
}

async function dashboardApiRequest<T>(url: string, retry = true): Promise<T> {
  const response = await fetch(url, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });

  if ((response.status === 401 || response.status === 403) && retry) {
    await refreshSession();
    return dashboardApiRequest<T>(url, false);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      data.detail || `Dashboard request failed (${response.status}).`,
    );
  }
  return data as T;
}

type NavigationItem = {
  label: string;
  icon: string;
  href: string;
  active?: boolean;
};

const navigation: NavigationItem[] = [
  { label: "Overview", icon: "◫", href: "/dashboard", active: true },
  { label: "Orders", icon: "▤", href: "/orders", active: true },
  { label: "Sales & Payments", icon: "₦", href: "/payments", active: true },
  { label: "Menu", icon: "☷", href: "/menu", active: true },
 { label: "Inventory", icon: "▦", href: "/inventory", active: true },
  { label: "Customers", icon: "♙", href: "/customers", active: true },
  { label: "Staff", icon: "♧", href: "/staff" },
  { label: "Reports", icon: "▥", href: "/reports", active: true },
];

export default function DashboardPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [selectedRestaurant, setSelectedRestaurant] =
    useState<Restaurant | null>(null);

  const [loading, setLoading] = useState(true);
  const [restaurantLoading, setRestaurantLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [metrics, setMetrics] = useState<DashboardMetrics>(emptyMetrics);
  const [metricsLoading, setMetricsLoading] = useState(false);

  async function loadDashboardMetrics(restaurant: Restaurant) {
    setMetricsLoading(true);
    try {
      const id = restaurant.id;
      const [ordersRaw, paymentsRaw, itemsRaw, stockRaw, branchesRaw, menuRaw] =
        await Promise.all([
          dashboardApiRequest<unknown>(`${API_URL}/orders/${id}/`),
          dashboardApiRequest<unknown>(`${API_URL}/payments/${id}/`),
          dashboardApiRequest<unknown>(`${API_URL}/inventory/${id}/items/?active=true`),
          dashboardApiRequest<unknown>(`${API_URL}/inventory/${id}/stock/`),
          dashboardApiRequest<unknown>(`${API_URL}/restaurants/${id}/branches/`),
          dashboardApiRequest<unknown>(`${API_URL}/restaurants/${id}/menu/items/`),
        ]);

      const orders = asList<DashboardOrder>(ordersRaw);
      const payments = asList<DashboardPayment>(paymentsRaw);
      const inventoryItems = asList<DashboardInventoryItem>(itemsRaw);
      const stockLevels = asList<DashboardStockLevel>(stockRaw);
      const branches = asList<unknown>(branchesRaw);
      const menuItems = asList<unknown>(menuRaw);

      const completedOrders = orders.filter((order) => order.status === "completed");
      const sales = completedOrders.reduce(
        (sum, order) => sum + Number(order.subtotal || 0),
        0,
      );
      const received = payments
        .filter((payment) => payment.status === "completed")
        .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

      const paidByOrder = payments
        .filter((payment) => payment.status === "completed")
        .reduce((map, payment) => {
          // Payment API includes the order ID.
          const orderId = (payment as DashboardPayment & { order?: number }).order;
          if (orderId !== undefined) {
            map.set(orderId, (map.get(orderId) || 0) + Number(payment.amount || 0));
          }
          return map;
        }, new Map<number, number>());

      const outstanding = completedOrders.reduce((sum, order) => {
        const balance = Number(order.subtotal || 0) - (paidByOrder.get(order.id) || 0);
        return sum + Math.max(0, balance);
      }, 0);

      const reorderLevels = new Map(
        inventoryItems.map((item) => [item.id, Number(item.reorder_level || 0)]),
      );
      const lowStockIds = new Set<number>();
      stockLevels.forEach((level) => {
        const reorderLevel = reorderLevels.get(level.inventory_item);
        if (reorderLevel !== undefined && Number(level.quantity || 0) <= reorderLevel) {
          lowStockIds.add(level.inventory_item);
        }
      });

      setMetrics({
        totalOrders: orders.length,
        completedOrders: completedOrders.length,
        totalSales: sales,
        paymentsReceived: received,
        outstanding,
        menuItems: menuItems.length,
        inventoryItems: inventoryItems.length,
        lowStockItems: lowStockIds.size,
        branches: branches.length,
      });
    } catch (err) {
      console.error("Unable to load dashboard metrics:", err);
      setMetrics(emptyMetrics);
    } finally {
      setMetricsLoading(false);
    }
  }

  const loadRestaurants = useCallback(async () => {
    setRestaurantLoading(true);
    setError("");

    try {
      const data = await dashboardApiRequest<Restaurant[]>(
        `${API_URL}/restaurants/`,
      );

      setRestaurants(data);

      const currentRestaurant = data[0] || null;
      setSelectedRestaurant((previous) => {
        if (previous) {
          const updated = data.find(
            (restaurant) => restaurant.id === previous.id
          );
          if (updated) return updated;
        }
        return currentRestaurant;
      });

      if (currentRestaurant) {
        await loadDashboardMetrics(currentRestaurant);
      } else {
        setMetrics(emptyMetrics);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong while loading your workspace."
      );
    } finally {
      setRestaurantLoading(false);
    }
  }, [router]);

  useEffect(() => {
    let active = true;

    async function initializeDashboard() {
      try {
        const currentUser = await getCurrentUser();

        if (!active) return;

        setUser(currentUser);
        await loadRestaurants();
      } catch {
        if (active) {
          router.replace("/login");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    initializeDashboard();

    return () => {
      active = false;
    };
  }, [router, loadRestaurants]);

  async function handleLogout() {
    setLoggingOut(true);

    try {
      await logoutUser();
    } catch (err) {
      console.error("Logout request failed:", err);
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  function handleNavigation(item: NavigationItem) {
    if (!item.active) return;

    setMobileMenuOpen(false);
    router.push(item.href);
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f9fb]">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-emerald-100 border-t-emerald-600" />
          <p className="mt-4 text-sm text-gray-500">
            Loading your RestaurantOS workspace...
          </p>
        </div>
      </main>
    );
  }

  if (!user) return null;

  const firstName = user.first_name || "there";

  return (
    <main className="min-h-screen bg-[#f7f9fb] text-slate-900">
      {/* Top navigation */}
      <header className="sticky top-0 z-30 flex h-[76px] items-center justify-between border-b border-gray-200 bg-white px-5 md:px-8">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="mr-1 rounded-lg p-2 text-xl text-gray-600 hover:bg-gray-100 lg:hidden"
            aria-label="Toggle navigation"
          >
            ☰
          </button>

          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#168451] text-xl font-bold text-white">
            R
          </div>

          <div>
            <h1 className="font-bold tracking-tight">RestaurantOS</h1>
            <p className="text-[10px] tracking-widest text-gray-400">
              BUSINESS MANAGEMENT
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <p className="text-sm font-semibold">
              {user.first_name} {user.last_name}
            </p>
            <p className="text-xs text-gray-400">{user.email}</p>
          </div>

          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
          >
            {loggingOut ? "Signing out..." : "Sign out"}
          </button>
        </div>
      </header>

      <div className="flex min-h-[calc(100vh-76px)]">
        {/* Sidebar */}
        <aside
          className={`fixed inset-y-0 left-0 top-[76px] z-20 w-64 border-r border-gray-200 bg-white p-5 transition-transform lg:sticky lg:top-[76px] lg:block lg:h-[calc(100vh-76px)] lg:translate-x-0 ${
            mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="mb-7">
            <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-widest text-gray-400">
              Workspace
            </p>

            <div className="rounded-xl border border-gray-200 p-3">
              <p className="mb-2 text-xs text-gray-400">
                Active restaurant
              </p>

              <select
                value={selectedRestaurant?.id || ""}
                onChange={(event) => {
                  const restaurant = restaurants.find(
                    (item) => item.id === Number(event.target.value)
                  );

                  setSelectedRestaurant(restaurant || null);
                }}
                disabled={restaurants.length === 0}
                className="w-full bg-white text-sm font-semibold outline-none"
              >
                {restaurants.length === 0 ? (
                  <option value="">No restaurant yet</option>
                ) : (
                  restaurants.map((restaurant) => (
                    <option key={restaurant.id} value={restaurant.id}>
                      {restaurant.name}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          {/* Sidebar navigation */}
          <nav className="space-y-1">
            {navigation.map((item) => (
              <button
                key={item.label}
                type="button"
                disabled={!item.active}
                onClick={() => handleNavigation(item)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium transition ${
                  item.active
                    ? "bg-emerald-50 text-[#168451] cursor-pointer hover:bg-emerald-100"
                    : "cursor-not-allowed text-gray-400"
                }`}
              >
                <span className="w-5 text-lg">{item.icon}</span>

                {item.label}

                {!item.active && (
                  <span className="ml-auto text-[9px] uppercase">
                    Soon
                  </span>
                )}
              </button>
            ))}
          </nav>

          <div className="mt-8 border-t border-gray-100 pt-5">
            <button
              disabled
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-gray-400"
            >
              <span className="w-5 text-lg">⚙</span>
              Settings
              <span className="ml-auto text-[9px] uppercase">Soon</span>
            </button>
          </div>

          <div className="absolute bottom-5 left-5 right-5 rounded-xl bg-slate-50 p-4">
            <p className="text-xs font-semibold">RestaurantOS</p>
            <p className="mt-1 text-[10px] text-gray-400">
              Your restaurant management workspace
            </p>
          </div>
        </aside>

        {/* Mobile sidebar overlay */}
        {mobileMenuOpen && (
          <button
            className="fixed inset-0 top-[76px] z-10 bg-black/30 lg:hidden"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close navigation"
          />
        )}

        {/* Main dashboard */}
        <section className="min-w-0 flex-1 px-5 py-8 md:px-8 lg:px-10">
          <div className="mx-auto max-w-7xl">
            <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-[#168451]">
                  YOUR WORKSPACE
                </p>

                <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
                  Welcome, {firstName}!
                </h2>

                <p className="mt-2 text-sm text-gray-500">
                  Here's an overview of your restaurant business.
                </p>
              </div>

              {selectedRestaurant && (
                <div className="flex items-center gap-2 self-start rounded-full bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-700">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  Restaurant active
                </div>
              )}
            </div>

            {error && (
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                <span>{error}</span>
                <button
                  onClick={loadRestaurants}
                  className="font-semibold underline"
                >
                  Try again
                </button>
              </div>
            )}

            {restaurantLoading ? (
              <div className="mt-10 rounded-2xl border border-gray-200 bg-white p-10 text-center">
                <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-emerald-100 border-t-emerald-600" />
                <p className="mt-4 text-sm text-gray-500">
                  Loading restaurant information...
                </p>
              </div>
            ) : restaurants.length === 0 ? (
              <div className="mt-10 rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm sm:p-12">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-3xl text-emerald-700">
                  +
                </div>

                <h3 className="mt-5 text-xl font-bold">
                  Set up your restaurant
                </h3>

                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-gray-500">
                  Your account is ready. Register your restaurant to
                  create your business workspace and main branch.
                </p>

                <Link
                  href="/onboarding"
                  className="mt-7 inline-flex rounded-xl bg-[#168451] px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700"
                >
                  Create restaurant
                </Link>
              </div>
            ) : selectedRestaurant ? (
              <>
                {/* Restaurant information */}
                <div className="mt-9 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
                  <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                        CURRENT RESTAURANT
                      </p>

                      <h3 className="mt-2 text-2xl font-bold">
                        {selectedRestaurant.name}
                      </h3>

                      <p className="mt-2 text-sm text-gray-500">
                        {selectedRestaurant.restaurant_type
                          .replaceAll("_", " ")
                          .replace(/\b\w/g, (letter) =>
                            letter.toUpperCase()
                          )}
                        {" · "}
                        {selectedRestaurant.city},{" "}
                        {selectedRestaurant.country}
                      </p>
                    </div>

                    <span className="self-start rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                      {selectedRestaurant.is_active
                        ? "Active"
                        : "Inactive"}
                    </span>
                  </div>

                  <div className="mt-7 grid gap-5 border-t border-gray-100 pt-6 sm:grid-cols-2 lg:grid-cols-3">
                    <div>
                      <p className="text-xs text-gray-400">
                        Business email
                      </p>
                      <p className="mt-1 break-all text-sm font-medium">
                        {selectedRestaurant.email || "Not provided"}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-gray-400">
                        Phone number
                      </p>
                      <p className="mt-1 text-sm font-medium">
                        {selectedRestaurant.phone}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-gray-400">
                        Currency
                      </p>
                      <p className="mt-1 text-sm font-medium">
                        {selectedRestaurant.currency}
                      </p>
                    </div>

                    <div className="sm:col-span-2 lg:col-span-3">
                      <p className="text-xs text-gray-400">
                        Business address
                      </p>
                      <p className="mt-1 text-sm font-medium">
                        {selectedRestaurant.address},{" "}
                        {selectedRestaurant.city}
                        {selectedRestaurant.state
                          ? `, ${selectedRestaurant.state}`
                          : ""}
                        , {selectedRestaurant.country}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Operational summary */}
                <div className="mt-9">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-bold">
                        Business overview
                      </h3>
                      <p className="mt-1 text-sm text-gray-500">
                        Your operational workspace at a glance.
                      </p>
                    </div>

                    <span className="text-xs text-gray-400">
                      {metricsLoading ? "Updating live figures..." : "Live operational figures"}
                    </span>
                  </div>

                  <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {
                    [
                      { label: "Total orders", value: String(metrics.totalOrders), icon: "▤", note: `${metrics.completedOrders} completed orders` },
                      { label: "Payments received", value: new Intl.NumberFormat("en", { style: "currency", currency: selectedRestaurant.currency || "NGN", maximumFractionDigits: 0 }).format(metrics.paymentsReceived), icon: "₦", note: `Sales: ${new Intl.NumberFormat("en", { style: "currency", currency: selectedRestaurant.currency || "NGN", maximumFractionDigits: 0 }).format(metrics.totalSales)}` },
                      { label: "Inventory items", value: String(metrics.inventoryItems), icon: "▦", note: `${metrics.lowStockItems} items at or below reorder level` },
                      { label: "Branches", value: String(metrics.branches), icon: "⌂", note: `${metrics.menuItems} menu items available` },
                    ].map((card) => (
                      <div
                        key={card.label}
                        className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-gray-500">
                            {card.label}
                          </p>

                          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-lg text-emerald-700">
                            {card.icon}
                          </span>
                        </div>

                        <p className="mt-5 text-3xl font-bold">
                          {card.value}
                        </p>

                        <p className="mt-2 text-xs leading-5 text-gray-400">
                          {card.note}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                    <p className="text-sm text-gray-500">Outstanding balance on completed orders</p>
                    <p className="mt-2 text-2xl font-bold">
                      {new Intl.NumberFormat("en", { style: "currency", currency: selectedRestaurant.currency || "NGN", maximumFractionDigits: 2 }).format(metrics.outstanding)}
                    </p>
                  </div>
                </div>

                {/* Getting started */}
                <div className="mt-9 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
                  <h3 className="text-lg font-bold">
                    Your next steps
                  </h3>

                  <p className="mt-1 text-sm text-gray-500">
                    Build your restaurant workspace as we activate
                    more RestaurantOS modules.
                  </p>

                  <div className="mt-6 grid gap-4 sm:grid-cols-2">
                    {[
                      {
                        number: "01",
                        title: "Set up your restaurant",
                        description:
                          "Your restaurant profile has been registered.",
                        completed: true,
                      },
                      {
                        number: "02",
                        title: "Create your menu",
                        description:
                          "Add food items, categories and prices.",
                        completed: false,
                      },
                      {
                        number: "03",
                        title: "Configure your team",
                        description:
                          "Prepare access for managers and staff.",
                        completed: false,
                      },
                      {
                        number: "04",
                        title: "Start managing orders",
                        description:
                          "Manage restaurant orders from one place.",
                        completed: false,
                      },
                    ].map((step) => (
                      <div
                        key={step.number}
                        className="flex gap-4 rounded-xl border border-gray-100 p-4"
                      >
                        <div
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${
                            step.completed
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-gray-100 text-gray-400"
                          }`}
                        >
                          {step.completed ? "✓" : step.number}
                        </div>

                        <div>
                          <p className="text-sm font-semibold">
                            {step.title}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-gray-500">
                            {step.description}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-8 text-center text-xs text-gray-400">
                  RestaurantOS · Manage Smarter. Serve Better.
                </div>
              </>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
