
"use client";

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

interface InventoryItem {
  id: number;
  name: string;
  sku: string;
  description: string;
  category: string;
  unit: string;
  unit_display: string;
  reorder_level: string;
  is_active: boolean;
}

interface Supplier {
  id: number;
  name: string;
  contact_person: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
  is_active: boolean;
}

interface StockLevel {
  id: number;
  inventory_item: number;
  inventory_item_name: string;
  branch: number;
  branch_name: string;
  quantity: string;
  unit: string;
}

interface PurchaseItem {
  id: number;
  inventory_item: number;
  inventory_item_name: string;
  quantity: string;
  unit_cost: string;
  line_total: string;
}

interface Purchase {
  id: number;
  reference: string;
  supplier: number;
  supplier_name: string;
  branch: number;
  branch_name: string;
  status: string;
  status_display: string;
  purchase_date: string;
  notes: string;
  items: PurchaseItem[];
  total_cost: string;
}

interface StockMovement {
  id: number;
  inventory_item: number;
  inventory_item_name: string;
  branch: number;
  branch_name: string;
  movement_type: string;
  movement_type_display: string;
  quantity: string;
  reference: string;
  notes: string;
  created_at: string;
  created_by_email: string;
}

interface RecipeIngredient {
  id: number;
  menu_item: number;
  menu_item_name: string;
  inventory_item: number;
  inventory_item_name: string;
  quantity: string;
  unit: string;
  notes: string;
}

interface MenuItem {
  id: number;
  name: string;
}

type Tab =
  | "items"
  | "suppliers"
  | "stock"
  | "purchases"
  | "movements"
  | "recipes";

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

async function apiRequest(
  url: string,
  method = "GET",
  body?: BodyInit,
  json = true
) {
  const headers = new Headers();

  if (json && body) {
    headers.set("Content-Type", "application/json");
  }

  if (method !== "GET") {
    headers.set("X-CSRFToken", await getCsrfToken());
  }

  const response = await fetch(url, {
    method,
    headers,
    body,
    credentials: "include",
    cache: "no-store",
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Your session has expired. Please log in again.");
    }

    const message =
      data.detail ||
      Object.entries(data)
        .map(([field, value]) => {
          const message = Array.isArray(value)
            ? value.join(", ")
            : String(value);

          return `${field}: ${message}`;
        })
        .join(" | ") ||
      "The request could not be completed.";

    throw new Error(message);
  }

  return data;
}

const emptyItemForm = {
  name: "",
  sku: "",
  description: "",
  category: "",
  unit: "piece",
  reorder_level: "0",
};

export default function InventoryPage() {
  const router = useRouter();

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [stockLevels, setStockLevels] = useState<StockLevel[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [recipes, setRecipes] = useState<RecipeIngredient[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);

  const [activeTab, setActiveTab] = useState<Tab>("items");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [showItemForm, setShowItemForm] = useState(false);
  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [showPurchaseForm, setShowPurchaseForm] = useState(false);
  const [showAdjustmentForm, setShowAdjustmentForm] = useState(false);
  const [showRecipeForm, setShowRecipeForm] = useState(false);

  const [itemForm, setItemForm] = useState(emptyItemForm);

  const [supplierForm, setSupplierForm] = useState({
    name: "",
    contact_person: "",
    email: "",
    phone: "",
    address: "",
    notes: "",
  });

  const [purchaseForm, setPurchaseForm] = useState({
    supplier: "",
    branch: "",
    reference: "",
    purchase_date: new Date().toISOString().slice(0, 10),
    notes: "",
    inventory_item: "",
    quantity: "",
    unit_cost: "",
  });

  const [adjustmentForm, setAdjustmentForm] = useState({
    inventory_item: "",
    branch: "",
    movement_type: "usage",
    direction: "decrease",
    quantity: "",
    reference: "",
    notes: "",
  });

  const [recipeForm, setRecipeForm] = useState({
    menu_item: "",
    inventory_item: "",
    quantity: "",
    notes: "",
  });

  const [search, setSearch] = useState("");
  const [stockBranch, setStockBranch] = useState("all");

  async function loadInventory() {
    setLoading(true);
    setError("");

    try {
      const restaurantData: Restaurant[] = await apiRequest(
        `${API_URL}/restaurants/`
      );

      if (!restaurantData.length) {
        router.replace("/onboarding");
        return;
      }

      const currentRestaurant = restaurantData[0];
      setRestaurant(currentRestaurant);

      const base = `${API_URL}/inventory/${currentRestaurant.id}`;

      const [
        branchData,
        itemData,
        supplierData,
        stockData,
        purchaseData,
        movementData,
        recipeData,
        menuData,
      ] = await Promise.all([
        apiRequest(
          `${API_URL}/restaurants/${currentRestaurant.id}/branches/`
        ),
        apiRequest(`${base}/items/`),
        apiRequest(`${base}/suppliers/`),
        apiRequest(`${base}/stock/`),
        apiRequest(`${base}/purchases/`),
        apiRequest(`${base}/movements/`),
        apiRequest(`${base}/recipes/`),
        apiRequest(
          `${API_URL}/restaurants/${currentRestaurant.id}/menu/items/`
        ),
      ]);

      setBranches(branchData);
      setItems(itemData);
      setSuppliers(supplierData);
      setStockLevels(stockData);
      setPurchases(purchaseData);
      setMovements(movementData);
      setRecipes(recipeData);
      setMenuItems(menuData);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to load inventory.";

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
    loadInventory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function clearMessages() {
    setError("");
    setSuccess("");
  }

  function money(value: string | number) {
    const currency = restaurant?.currency || "NGN";

    try {
      return new Intl.NumberFormat("en", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(Number(value));
    } catch {
      return `${currency} ${value}`;
    }
  }

  function closeForms() {
    setShowItemForm(false);
    setShowSupplierForm(false);
    setShowPurchaseForm(false);
    setShowAdjustmentForm(false);
    setShowRecipeForm(false);
  }

  async function createItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!restaurant) return;

    setSaving(true);
    clearMessages();

    try {
      await apiRequest(
        `${API_URL}/inventory/${restaurant.id}/items/`,
        "POST",
        JSON.stringify(itemForm)
      );

      setItemForm(emptyItemForm);
      setShowItemForm(false);
      setSuccess("Inventory item created successfully.");
      await loadInventory();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to create inventory item."
      );
    } finally {
      setSaving(false);
    }
  }

  async function createSupplier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!restaurant) return;

    setSaving(true);
    clearMessages();

    try {
      await apiRequest(
        `${API_URL}/inventory/${restaurant.id}/suppliers/`,
        "POST",
        JSON.stringify(supplierForm)
      );

      setSupplierForm({
        name: "",
        contact_person: "",
        email: "",
        phone: "",
        address: "",
        notes: "",
      });

      setShowSupplierForm(false);
      setSuccess("Supplier added successfully.");
      await loadInventory();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to add supplier."
      );
    } finally {
      setSaving(false);
    }
  }

  async function createPurchase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!restaurant) return;

    setSaving(true);
    clearMessages();

    try {
      await apiRequest(
        `${API_URL}/inventory/${restaurant.id}/purchases/`,
        "POST",
        JSON.stringify({
          supplier: Number(purchaseForm.supplier),
          branch: Number(purchaseForm.branch),
          reference: purchaseForm.reference,
          purchase_date: purchaseForm.purchase_date,
          notes: purchaseForm.notes,
          items: [
            {
              inventory_item: Number(purchaseForm.inventory_item),
              quantity: purchaseForm.quantity,
              unit_cost: purchaseForm.unit_cost,
            },
          ],
        })
      );

      setShowPurchaseForm(false);
      setPurchaseForm({
        supplier: "",
        branch: "",
        reference: "",
        purchase_date: new Date().toISOString().slice(0, 10),
        notes: "",
        inventory_item: "",
        quantity: "",
        unit_cost: "",
      });

      setSuccess(
        "Purchase recorded as a draft. Receive it to update stock levels."
      );

      await loadInventory();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to record purchase."
      );
    } finally {
      setSaving(false);
    }
  }

  async function receivePurchase(purchase: Purchase) {
    if (!restaurant) return;

    if (
      !window.confirm(
        `Receive purchase ${purchase.reference || `#${purchase.id}`}? This will increase stock at ${purchase.branch_name}.`
      )
    ) {
      return;
    }

    clearMessages();

    try {
      await apiRequest(
        `${API_URL}/inventory/${restaurant.id}/purchases/${purchase.id}/receive/`,
        "POST"
      );

      setSuccess("Purchase received. Stock levels have been updated.");
      await loadInventory();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to receive purchase."
      );
    }
  }

  async function adjustStock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!restaurant) return;

    setSaving(true);
    clearMessages();

    try {
      await apiRequest(
        `${API_URL}/inventory/${restaurant.id}/stock/adjust/`,
        "POST",
        JSON.stringify({
          ...adjustmentForm,
          inventory_item: Number(adjustmentForm.inventory_item),
          branch: Number(adjustmentForm.branch),
        })
      );

      setShowAdjustmentForm(false);
      setAdjustmentForm({
        inventory_item: "",
        branch: "",
        movement_type: "usage",
        direction: "decrease",
        quantity: "",
        reference: "",
        notes: "",
      });

      setSuccess("Stock adjustment recorded successfully.");
      await loadInventory();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to adjust stock."
      );
    } finally {
      setSaving(false);
    }
  }

  async function createRecipe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!restaurant) return;

    setSaving(true);
    clearMessages();

    try {
      await apiRequest(
        `${API_URL}/inventory/${restaurant.id}/recipes/`,
        "POST",
        JSON.stringify({
          menu_item: Number(recipeForm.menu_item),
          inventory_item: Number(recipeForm.inventory_item),
          quantity: recipeForm.quantity,
          notes: recipeForm.notes,
        })
      );

      setShowRecipeForm(false);
      setRecipeForm({
        menu_item: "",
        inventory_item: "",
        quantity: "",
        notes: "",
      });

      setSuccess("Recipe ingredient added successfully.");
      await loadInventory();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to add recipe ingredient."
      );
    } finally {
      setSaving(false);
    }
  }

  const lowStockItems = items.filter((item) => {
    const total = stockLevels
      .filter((stock) => stock.inventory_item === item.id)
      .reduce((sum, stock) => sum + Number(stock.quantity), 0);

    return total > 0 && total <= Number(item.reorder_level);
  });

  const outOfStockItems = items.filter((item) => {
    const total = stockLevels
      .filter((stock) => stock.inventory_item === item.id)
      .reduce((sum, stock) => sum + Number(stock.quantity), 0);

    return total === 0;
  });

  const totalUnits = stockLevels.reduce(
    (sum, stock) => sum + Number(stock.quantity),
    0
  );

  const filteredItems = items.filter((item) => {
    const term = search.toLowerCase();

    return (
      item.name.toLowerCase().includes(term) ||
      item.sku.toLowerCase().includes(term) ||
      item.category.toLowerCase().includes(term)
    );
  });

  const tabs: { id: Tab; label: string }[] = [
    { id: "items", label: "Inventory items" },
    { id: "suppliers", label: "Suppliers" },
    { id: "stock", label: "Stock levels" },
    { id: "purchases", label: "Purchases" },
    { id: "movements", label: "Movements" },
    { id: "recipes", label: "Recipes" },
  ];

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f9fb]">
        <div className="text-center">
          <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-emerald-100 border-t-emerald-600" />
          <p className="mt-4 text-sm text-gray-500">
            Loading inventory management...
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
              INVENTORY MANAGEMENT
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
              Inventory Management
            </h2>

            <p className="mt-2 text-sm text-gray-500">
              Monitor ingredients, suppliers, purchases and stock across your
              branches.
            </p>

            {restaurant && (
              <p className="mt-2 text-sm font-semibold text-slate-700">
                {restaurant.name}
              </p>
            )}
          </div>

          <button
            onClick={() => {
              closeForms();
              setShowItemForm(true);
              setActiveTab("items");
              clearMessages();
            }}
            className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700"
          >
            + Add inventory item
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

        {/* Overview cards */}
        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: "Inventory items",
              value: items.length,
              icon: "▦",
              note: "Registered stock items",
            },
            {
              label: "Low stock",
              value: lowStockItems.length,
              icon: "!",
              note: "Items at or below reorder level",
            },
            {
              label: "Out of stock",
              value: outOfStockItems.length,
              icon: "○",
              note: "Items with no recorded stock",
            },
            {
              label: "Total stock quantity",
              value: totalUnits.toLocaleString(),
              icon: "▤",
              note: "Combined recorded quantities",
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500">{stat.label}</p>
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-lg font-bold text-emerald-700">
                  {stat.icon}
                </span>
              </div>

              <p className="mt-3 text-3xl font-bold">{stat.value}</p>
              <p className="mt-2 text-xs text-gray-400">{stat.note}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="mt-9 overflow-x-auto border-b border-gray-200">
          <div className="flex min-w-max gap-6">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  closeForms();
                  setActiveTab(tab.id);
                  clearMessages();
                }}
                className={`border-b-2 px-1 pb-3 text-sm font-semibold ${
                  activeTab === tab.id
                    ? "border-emerald-600 text-emerald-700"
                    : "border-transparent text-gray-500 hover:text-gray-800"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Inventory item form */}
        {showItemForm && (
          <form
            onSubmit={createItem}
            className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
          >
            <h3 className="text-lg font-bold">Add inventory item</h3>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium">
                  Item name *
                </label>
                <input
                  required
                  maxLength={200}
                  value={itemForm.name}
                  onChange={(e) =>
                    setItemForm({ ...itemForm, name: e.target.value })
                  }
                  placeholder="e.g. Rice"
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  SKU / Item code
                </label>
                <input
                  value={itemForm.sku}
                  onChange={(e) =>
                    setItemForm({ ...itemForm, sku: e.target.value })
                  }
                  placeholder="e.g. ING-001"
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Category
                </label>
                <input
                  value={itemForm.category}
                  onChange={(e) =>
                    setItemForm({ ...itemForm, category: e.target.value })
                  }
                  placeholder="e.g. Grains, Vegetables, Meat"
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Measurement unit *
                </label>
                <select
                  required
                  value={itemForm.unit}
                  onChange={(e) =>
                    setItemForm({ ...itemForm, unit: e.target.value })
                  }
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm"
                >
                  {[
                    ["piece", "Piece"],
                    ["kg", "Kilogram"],
                    ["g", "Gram"],
                    ["litre", "Litre"],
                    ["ml", "Millilitre"],
                    ["pack", "Pack"],
                    ["bottle", "Bottle"],
                    ["carton", "Carton"],
                    ["dozen", "Dozen"],
                    ["bag", "Bag"],
                    ["other", "Other"],
                  ].map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Reorder level *
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  required
                  value={itemForm.reorder_level}
                  onChange={(e) =>
                    setItemForm({
                      ...itemForm,
                      reorder_level: e.target.value,
                    })
                  }
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="mb-2 block text-sm font-medium">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={itemForm.description}
                  onChange={(e) =>
                    setItemForm({
                      ...itemForm,
                      description: e.target.value,
                    })
                  }
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm"
                />
              </div>
            </div>

            <div className="mt-5 flex gap-3">
              <button
                disabled={saving}
                className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save item"}
              </button>

              <button
                type="button"
                onClick={() => setShowItemForm(false)}
                className="rounded-xl border border-gray-200 px-5 py-3 text-sm font-semibold text-gray-600"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Supplier form */}
        {showSupplierForm && (
          <form
            onSubmit={createSupplier}
            className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
          >
            <h3 className="text-lg font-bold">Add supplier</h3>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {(
  [
    ["Supplier name", "name", true],
    ["Contact person", "contact_person", false],
    ["Email address", "email", false],
    ["Phone number", "phone", false],
    ["Address", "address", false],
  ] as [string, keyof typeof supplierForm, boolean][]
).map(([label, field, required]) => (
  <div key={field}>
    <label className="mb-2 block text-sm font-medium">
      {label} {required ? "*" : ""}
    </label>

    <input
      required={required}
      type={field === "email" ? "email" : "text"}
      value={supplierForm[field]}
      onChange={(e) =>
        setSupplierForm({
          ...supplierForm,
          [field]: e.target.value,
        })
      }
      className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm"
    />
  </div>
))}

              <div className="sm:col-span-2">
                <label className="mb-2 block text-sm font-medium">
                  Notes
                </label>
                <textarea
                  rows={2}
                  value={supplierForm.notes}
                  onChange={(e) =>
                    setSupplierForm({
                      ...supplierForm,
                      notes: e.target.value,
                    })
                  }
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm"
                />
              </div>
            </div>

            <div className="mt-5 flex gap-3">
              <button
                disabled={saving}
                className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save supplier"}
              </button>
              <button
                type="button"
                onClick={() => setShowSupplierForm(false)}
                className="rounded-xl border border-gray-200 px-5 py-3 text-sm font-semibold text-gray-600"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Purchase form */}
        {showPurchaseForm && (
          <form
            onSubmit={createPurchase}
            className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
          >
            <h3 className="text-lg font-bold">Record a purchase</h3>
            <p className="mt-1 text-sm text-gray-500">
              This creates a draft purchase. Receive it after the goods arrive
              to update stock.
            </p>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium">
                  Supplier *
                </label>
                <select
                  required
                  value={purchaseForm.supplier}
                  onChange={(e) =>
                    setPurchaseForm({
                      ...purchaseForm,
                      supplier: e.target.value,
                    })
                  }
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm"
                >
                  <option value="">Select supplier</option>
                  {suppliers
                    .filter((supplier) => supplier.is_active)
                    .map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Receiving branch *
                </label>
                <select
                  required
                  value={purchaseForm.branch}
                  onChange={(e) =>
                    setPurchaseForm({
                      ...purchaseForm,
                      branch: e.target.value,
                    })
                  }
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm"
                >
                  <option value="">Select branch</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Reference
                </label>
                <input
                  value={purchaseForm.reference}
                  onChange={(e) =>
                    setPurchaseForm({
                      ...purchaseForm,
                      reference: e.target.value,
                    })
                  }
                  placeholder="e.g. PO-001"
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Purchase date *
                </label>
                <input
                  type="date"
                  required
                  value={purchaseForm.purchase_date}
                  onChange={(e) =>
                    setPurchaseForm({
                      ...purchaseForm,
                      purchase_date: e.target.value,
                    })
                  }
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Inventory item *
                </label>
                <select
                  required
                  value={purchaseForm.inventory_item}
                  onChange={(e) =>
                    setPurchaseForm({
                      ...purchaseForm,
                      inventory_item: e.target.value,
                    })
                  }
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm"
                >
                  <option value="">Select item</option>
                  {items
                    .filter((item) => item.is_active)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} ({item.unit_display})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Quantity *
                </label>
                <input
                  type="number"
                  required
                  min="0.001"
                  step="0.001"
                  value={purchaseForm.quantity}
                  onChange={(e) =>
                    setPurchaseForm({
                      ...purchaseForm,
                      quantity: e.target.value,
                    })
                  }
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Unit cost ({restaurant?.currency || "NGN"}) *
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  value={purchaseForm.unit_cost}
                  onChange={(e) =>
                    setPurchaseForm({
                      ...purchaseForm,
                      unit_cost: e.target.value,
                    })
                  }
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="mb-2 block text-sm font-medium">
                  Notes
                </label>
                <textarea
                  rows={2}
                  value={purchaseForm.notes}
                  onChange={(e) =>
                    setPurchaseForm({
                      ...purchaseForm,
                      notes: e.target.value,
                    })
                  }
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm"
                />
              </div>
            </div>

            <div className="mt-5 flex gap-3">
              <button
                disabled={saving}
                className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                {saving ? "Saving..." : "Record purchase"}
              </button>
              <button
                type="button"
                onClick={() => setShowPurchaseForm(false)}
                className="rounded-xl border border-gray-200 px-5 py-3 text-sm font-semibold text-gray-600"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Stock adjustment form */}
        {showAdjustmentForm && (
          <form
            onSubmit={adjustStock}
            className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
          >
            <h3 className="text-lg font-bold">Record stock movement</h3>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium">
                  Inventory item *
                </label>
                <select
                  required
                  value={adjustmentForm.inventory_item}
                  onChange={(e) =>
                    setAdjustmentForm({
                      ...adjustmentForm,
                      inventory_item: e.target.value,
                    })
                  }
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm"
                >
                  <option value="">Select item</option>
                  {items
                    .filter((item) => item.is_active)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Branch *
                </label>
                <select
                  required
                  value={adjustmentForm.branch}
                  onChange={(e) =>
                    setAdjustmentForm({
                      ...adjustmentForm,
                      branch: e.target.value,
                    })
                  }
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm"
                >
                  <option value="">Select branch</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Movement type *
                </label>
                <select
                  value={adjustmentForm.movement_type}
                  onChange={(e) =>
                    setAdjustmentForm({
                      ...adjustmentForm,
                      movement_type: e.target.value,
                      direction:
                        e.target.value === "adjustment"
                          ? "increase"
                          : "decrease",
                    })
                  }
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm"
                >
                  <option value="usage">Usage</option>
                  <option value="wastage">Wastage</option>
                  <option value="adjustment">Adjustment</option>
                </select>
              </div>

              {adjustmentForm.movement_type === "adjustment" && (
                <div>
                  <label className="mb-2 block text-sm font-medium">
                    Adjustment direction *
                  </label>
                  <select
                    value={adjustmentForm.direction}
                    onChange={(e) =>
                      setAdjustmentForm({
                        ...adjustmentForm,
                        direction: e.target.value,
                      })
                    }
                    className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm"
                  >
                    <option value="increase">Increase stock</option>
                    <option value="decrease">Decrease stock</option>
                  </select>
                </div>
              )}

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Quantity *
                </label>
                <input
                  type="number"
                  required
                  min="0.001"
                  step="0.001"
                  value={adjustmentForm.quantity}
                  onChange={(e) =>
                    setAdjustmentForm({
                      ...adjustmentForm,
                      quantity: e.target.value,
                    })
                  }
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Reference
                </label>
                <input
                  value={adjustmentForm.reference}
                  onChange={(e) =>
                    setAdjustmentForm({
                      ...adjustmentForm,
                      reference: e.target.value,
                    })
                  }
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="mb-2 block text-sm font-medium">
                  Notes
                </label>
                <textarea
                  rows={2}
                  value={adjustmentForm.notes}
                  onChange={(e) =>
                    setAdjustmentForm({
                      ...adjustmentForm,
                      notes: e.target.value,
                    })
                  }
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm"
                />
              </div>
            </div>

            <div className="mt-5 flex gap-3">
              <button
                disabled={saving}
                className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save movement"}
              </button>
              <button
                type="button"
                onClick={() => setShowAdjustmentForm(false)}
                className="rounded-xl border border-gray-200 px-5 py-3 text-sm font-semibold text-gray-600"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Recipe form */}
        {showRecipeForm && (
          <form
            onSubmit={createRecipe}
            className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
          >
            <h3 className="text-lg font-bold">Add recipe ingredient</h3>
            <p className="mt-1 text-sm text-gray-500">
              Connect a menu item to an ingredient and specify the quantity
              required for one preparation.
            </p>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium">
                  Menu item *
                </label>
                <select
                  required
                  value={recipeForm.menu_item}
                  onChange={(e) =>
                    setRecipeForm({
                      ...recipeForm,
                      menu_item: e.target.value,
                    })
                  }
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm"
                >
                  <option value="">Select menu item</option>
                  {menuItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Inventory ingredient *
                </label>
                <select
                  required
                  value={recipeForm.inventory_item}
                  onChange={(e) =>
                    setRecipeForm({
                      ...recipeForm,
                      inventory_item: e.target.value,
                    })
                  }
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm"
                >
                  <option value="">Select ingredient</option>
                  {items
                    .filter((item) => item.is_active)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} ({item.unit_display})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Quantity required *
                </label>
                <input
                  type="number"
                  required
                  min="0.001"
                  step="0.001"
                  value={recipeForm.quantity}
                  onChange={(e) =>
                    setRecipeForm({
                      ...recipeForm,
                      quantity: e.target.value,
                    })
                  }
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Notes
                </label>
                <input
                  value={recipeForm.notes}
                  onChange={(e) =>
                    setRecipeForm({
                      ...recipeForm,
                      notes: e.target.value,
                    })
                  }
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm"
                />
              </div>
            </div>

            <div className="mt-5 flex gap-3">
              <button
                disabled={saving}
                className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save ingredient"}
              </button>
              <button
                type="button"
                onClick={() => setShowRecipeForm(false)}
                className="rounded-xl border border-gray-200 px-5 py-3 text-sm font-semibold text-gray-600"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Inventory items */}
        {activeTab === "items" && (
          <div className="mt-6">
            <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search inventory items..."
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-500 sm:max-w-sm"
              />

              <button
                onClick={() => {
                  closeForms();
                  setShowItemForm(true);
                }}
                className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white"
              >
                + Add item
              </button>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
              <table className="w-full min-w-[700px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-5 py-4">Item</th>
                    <th className="px-5 py-4">SKU</th>
                    <th className="px-5 py-4">Category</th>
                    <th className="px-5 py-4">Unit</th>
                    <th className="px-5 py-4">Reorder level</th>
                    <th className="px-5 py-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredItems.map((item) => (
                    <tr key={item.id}>
                      <td className="px-5 py-4 font-semibold">
                        {item.name}
                      </td>
                      <td className="px-5 py-4 text-gray-500">
                        {item.sku || "—"}
                      </td>
                      <td className="px-5 py-4">{item.category || "—"}</td>
                      <td className="px-5 py-4">
                        {item.unit_display || item.unit}
                      </td>
                      <td className="px-5 py-4">{item.reorder_level}</td>
                      <td className="px-5 py-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            item.is_active
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {item.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                    </tr>
                  ))}

                  {filteredItems.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-5 py-12 text-center text-gray-400"
                      >
                        No inventory items found. Add your first item to get
                        started.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Suppliers */}
        {activeTab === "suppliers" && (
          <div className="mt-6">
            <div className="mb-5 flex justify-end">
              <button
                onClick={() => {
                  closeForms();
                  setShowSupplierForm(true);
                }}
                className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white"
              >
                + Add supplier
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {suppliers.map((supplier) => (
                <div
                  key={supplier.id}
                  className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-bold">{supplier.name}</h3>
                    <span
                      className={`rounded-full px-2 py-1 text-xs ${
                        supplier.is_active
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {supplier.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>

                  <div className="mt-4 space-y-2 text-sm text-gray-500">
                    <p>{supplier.contact_person || "No contact person"}</p>
                    <p>{supplier.email || "No email provided"}</p>
                    <p>{supplier.phone || "No phone provided"}</p>
                    <p>{supplier.address || "No address provided"}</p>
                  </div>
                </div>
              ))}

              {suppliers.length === 0 && (
                <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center sm:col-span-2 lg:col-span-3">
                  <h3 className="font-bold">No suppliers registered</h3>
                  <p className="mt-2 text-sm text-gray-500">
                    Add suppliers to record your inventory purchases.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Stock levels */}
        {activeTab === "stock" && (
          <div className="mt-6">
            <div className="mb-5 flex flex-wrap justify-between gap-3">
              <select
                value={stockBranch}
                onChange={(e) => setStockBranch(e.target.value)}
                className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm"
              >
                <option value="all">All branches</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>

              <button
                onClick={() => {
                  closeForms();
                  setShowAdjustmentForm(true);
                }}
                className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white"
              >
                + Record stock movement
              </button>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
              <table className="w-full min-w-[600px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-5 py-4">Inventory item</th>
                    <th className="px-5 py-4">Branch</th>
                    <th className="px-5 py-4">Quantity</th>
                    <th className="px-5 py-4">Unit</th>
                    <th className="px-5 py-4">Stock status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {stockLevels
                    .filter(
                      (stock) =>
                        stockBranch === "all" ||
                        stock.branch === Number(stockBranch)
                    )
                    .map((stock) => {
                      const item = items.find(
                        (entry) => entry.id === stock.inventory_item
                      );

                      const quantity = Number(stock.quantity);
                      const reorder = Number(item?.reorder_level || 0);

                      const low = quantity > 0 && quantity <= reorder;

                      return (
                        <tr key={stock.id}>
                          <td className="px-5 py-4 font-semibold">
                            {stock.inventory_item_name}
                          </td>
                          <td className="px-5 py-4">{stock.branch_name}</td>
                          <td className="px-5 py-4 font-semibold">
                            {stock.quantity}
                          </td>
                          <td className="px-5 py-4">{stock.unit}</td>
                          <td className="px-5 py-4">
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                quantity === 0
                                  ? "bg-red-50 text-red-700"
                                  : low
                                    ? "bg-amber-50 text-amber-700"
                                    : "bg-emerald-50 text-emerald-700"
                              }`}
                            >
                              {quantity === 0
                                ? "Out of stock"
                                : low
                                  ? "Low stock"
                                  : "In stock"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}

                  {stockLevels.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-5 py-12 text-center text-gray-400"
                      >
                        No stock records yet. Record a purchase and receive it
                        to create stock levels.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Purchases */}
        {activeTab === "purchases" && (
          <div className="mt-6">
            <div className="mb-5 flex justify-end">
              <button
                onClick={() => {
                  closeForms();
                  setShowPurchaseForm(true);
                }}
                disabled={
                  suppliers.length === 0 ||
                  branches.length === 0 ||
                  items.length === 0
                }
                className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                + Record purchase
              </button>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
              <table className="w-full min-w-[750px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-5 py-4">Reference</th>
                    <th className="px-5 py-4">Supplier</th>
                    <th className="px-5 py-4">Branch</th>
                    <th className="px-5 py-4">Date</th>
                    <th className="px-5 py-4">Total</th>
                    <th className="px-5 py-4">Status</th>
                    <th className="px-5 py-4">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {purchases.map((purchase) => (
                    <tr key={purchase.id}>
                      <td className="px-5 py-4 font-semibold">
                        {purchase.reference || `PO-${purchase.id}`}
                      </td>
                      <td className="px-5 py-4">{purchase.supplier_name}</td>
                      <td className="px-5 py-4">{purchase.branch_name}</td>
                      <td className="px-5 py-4">{purchase.purchase_date}</td>
                      <td className="px-5 py-4 font-semibold">
                        {money(purchase.total_cost)}
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            purchase.status === "received"
                              ? "bg-emerald-50 text-emerald-700"
                              : purchase.status === "cancelled"
                                ? "bg-red-50 text-red-700"
                                : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          {purchase.status_display}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        {purchase.status === "draft" && (
                          <button
                            onClick={() => receivePurchase(purchase)}
                            className="text-xs font-semibold text-emerald-700 hover:underline"
                          >
                            Receive stock
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}

                  {purchases.length === 0 && (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-5 py-12 text-center text-gray-400"
                      >
                        No purchases recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Stock movements */}
        {activeTab === "movements" && (
          <div className="mt-6 overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-5 py-4">Date</th>
                  <th className="px-5 py-4">Item</th>
                  <th className="px-5 py-4">Branch</th>
                  <th className="px-5 py-4">Movement</th>
                  <th className="px-5 py-4">Quantity</th>
                  <th className="px-5 py-4">Reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {movements.map((movement) => (
                  <tr key={movement.id}>
                    <td className="px-5 py-4">
                      {new Date(movement.created_at).toLocaleString()}
                    </td>
                    <td className="px-5 py-4 font-semibold">
                      {movement.inventory_item_name}
                    </td>
                    <td className="px-5 py-4">{movement.branch_name}</td>
                    <td className="px-5 py-4">
                      {movement.movement_type_display}
                    </td>
                    <td className="px-5 py-4">{movement.quantity}</td>
                    <td className="px-5 py-4">
                      {movement.reference || "—"}
                    </td>
                  </tr>
                ))}

                {movements.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-5 py-12 text-center text-gray-400"
                    >
                      No stock movements recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Recipe ingredients */}
        {activeTab === "recipes" && (
          <div className="mt-6">
            <div className="mb-5 flex justify-end">
              <button
                onClick={() => {
                  closeForms();
                  setShowRecipeForm(true);
                }}
                disabled={items.length === 0 || menuItems.length === 0}
                className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                + Add recipe ingredient
              </button>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
              <table className="w-full min-w-[650px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-5 py-4">Menu item</th>
                    <th className="px-5 py-4">Ingredient</th>
                    <th className="px-5 py-4">Quantity</th>
                    <th className="px-5 py-4">Unit</th>
                    <th className="px-5 py-4">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {recipes.map((recipe) => (
                    <tr key={recipe.id}>
                      <td className="px-5 py-4 font-semibold">
                        {recipe.menu_item_name}
                      </td>
                      <td className="px-5 py-4">
                        {recipe.inventory_item_name}
                      </td>
                      <td className="px-5 py-4">{recipe.quantity}</td>
                      <td className="px-5 py-4">{recipe.unit}</td>
                      <td className="px-5 py-4">
                        {recipe.notes || "—"}
                      </td>
                    </tr>
                  ))}

                  {recipes.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-5 py-12 text-center text-gray-400"
                      >
                        No recipe ingredients configured yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="mt-8 flex justify-end">
          <button
            onClick={loadInventory}
            className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50"
          >
            Refresh inventory
          </button>
        </div>
      </section>
    </main>
  );
}
