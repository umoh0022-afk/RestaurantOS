
"use client";

import {
  ChangeEvent,
  FormEvent,
  useEffect,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

const BACKEND_URL = API_URL.replace(/\/api\/?$/, "");

// Share a single refresh request when several API requests fail together.
let refreshPromise: Promise<boolean> | null = null;

interface Restaurant {
  id: number;
  name: string;
  currency: string;
}

interface Category {
  id: number;
  name: string;
  description: string;
  display_order: number;
  is_active: boolean;
  item_count: number;
}

interface MenuItem {
  id: number;
  name: string;
  description: string;
  image: string | null;
  price: string;
  category: number;
  category_name: string;
  branches: number[];
  branch_names: string[];
  is_available: boolean;
  preparation_time: number;
  display_order: number;
}

interface Branch {
  id: number;
  name: string;
  code: string;
}

async function getCsrfToken(): Promise<string> {
  const response = await fetch(`${API_URL}/auth/csrf/`, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      "Unable to initialise security verification."
    );
  }

  const cookie = document.cookie
    .split("; ")
    .find((item) => item.startsWith("csrftoken="));

  if (!cookie) {
    throw new Error(
      "Security cookie not found. Please refresh and retry."
    );
  }

  return decodeURIComponent(cookie.split("=")[1]);
}

async function refreshAccessToken(): Promise<boolean> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const csrfToken = await getCsrfToken();

      const response = await fetch(`${API_URL}/auth/refresh/`, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": csrfToken,
        },
      });

      return response.ok;
    } catch (error) {
      console.error("Access token refresh failed:", error);
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

function getErrorMessage(data: Record<string, unknown>): string {
  if (typeof data.detail === "string") {
    return data.detail;
  }

  return (
    Object.entries(data)
      .map(([field, value]) => {
        const message = Array.isArray(value)
          ? value.join(", ")
          : String(value);

        return `${field}: ${message}`;
      })
      .join(" | ") ||
    "The request could not be completed."
  );
}

async function apiRequest(
  url: string,
  method = "GET",
  body?: BodyInit,
  json = true,
  retry = true
) {
  const sendRequest = async (): Promise<Response> => {
    const headers = new Headers();

    if (json && body) {
      headers.set("Content-Type", "application/json");
    }

    if (method !== "GET" && method !== "HEAD") {
      headers.set("X-CSRFToken", await getCsrfToken());
    }

    return fetch(url, {
      method,
      headers,
      body,
      credentials: "include",
      cache: "no-store",
    });
  };

  let response = await sendRequest();

  if (
    retry &&
    (response.status === 401 || response.status === 403)
  ) {
    const errorData = await response
      .clone()
      .json()
      .catch(() => ({}));

    const authenticationFailure =
      response.status === 401 ||
      errorData.detail ===
        "Authentication credentials were not provided." ||
      errorData.detail ===
        "Invalid or expired authentication token.";

    if (authenticationFailure) {
      const refreshed = await refreshAccessToken();

      if (!refreshed) {
        throw new Error(
          "Your session has expired. Please log in again."
        );
      }

      response = await sendRequest();
    }
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      getErrorMessage(data as Record<string, unknown>)
    );
  }

  return data;
}

function getImageUrl(image: string | null): string | null {
  if (!image) return null;

  if (image.startsWith("http://") || image.startsWith("https://")) {
    return image;
  }

  return `${BACKEND_URL}${image.startsWith("/") ? "" : "/"}${image}`;
}

export default function MenuPage() {
  const router = useRouter();

  const [restaurant, setRestaurant] =
    useState<Restaurant | null>(null);

  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);

  const [selectedCategory, setSelectedCategory] = useState("all");

  const [activeTab, setActiveTab] =
    useState<"items" | "categories">("items");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [showItemForm, setShowItemForm] = useState(false);

  const [editingItem, setEditingItem] =
    useState<MenuItem | null>(null);

  const [categoryForm, setCategoryForm] = useState({
    name: "",
    description: "",
    display_order: 0,
  });

  const initialItemForm = {
    name: "",
    description: "",
    price: "",
    category: "",
    preparation_time: "15",
    display_order: "0",
    branches: [] as number[],
    is_available: true,
  };

  const [itemForm, setItemForm] = useState(initialItemForm);
  const [imageFile, setImageFile] = useState<File | null>(null);

  async function loadMenu() {
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

      const base = `${API_URL}/restaurants/${currentRestaurant.id}`;

      const [categoryData, itemData, branchData] =
        await Promise.all([
          apiRequest(`${base}/menu/categories/`),
          apiRequest(`${base}/menu/items/`),
          apiRequest(`${base}/branches/`),
        ]);

      setCategories(categoryData);
      setItems(itemData);
      setBranches(branchData);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Unable to load your menu.";

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
    loadMenu();
    // Initial data load only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetItemForm() {
    setItemForm(initialItemForm);
    setImageFile(null);
    setEditingItem(null);
    setShowItemForm(false);
  }

  function openCreateItemForm() {
    resetItemForm();
    setShowItemForm(true);
    setShowCategoryForm(false);
    setActiveTab("items");
    setError("");
    setSuccess("");
  }

  function openEditItemForm(item: MenuItem) {
    setEditingItem(item);

    setItemForm({
      name: item.name,
      description: item.description || "",
      price: String(item.price),
      category: String(item.category),
      preparation_time: String(item.preparation_time),
      display_order: String(item.display_order),
      branches: item.branches || [],
      is_available: item.is_available,
    });

    setImageFile(null);
    setShowItemForm(true);
    setShowCategoryForm(false);
    setActiveTab("items");
    setError("");
    setSuccess("");

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function createCategory(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!restaurant) return;

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      await apiRequest(
        `${API_URL}/restaurants/${restaurant.id}/menu/categories/`,
        "POST",
        JSON.stringify(categoryForm)
      );

      setCategoryForm({
        name: "",
        description: "",
        display_order: 0,
      });

      setShowCategoryForm(false);
      setSuccess("Menu category created successfully.");

      await loadMenu();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to create category."
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveMenuItem(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!restaurant) return;

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const formData = new FormData();

      formData.append("name", itemForm.name);
      formData.append("description", itemForm.description);
      formData.append("price", itemForm.price);
      formData.append("category", itemForm.category);

      formData.append(
        "preparation_time",
        itemForm.preparation_time
      );

      formData.append("display_order", itemForm.display_order);

      formData.append(
        "is_available",
        String(itemForm.is_available)
      );

      itemForm.branches.forEach((branchId) => {
        formData.append("branches", String(branchId));
      });

      if (imageFile) {
        formData.append("image", imageFile);
      }

      const isEditing = Boolean(editingItem);

      const endpoint = isEditing
        ? `${API_URL}/restaurants/${restaurant.id}/menu/items/${editingItem!.id}/`
        : `${API_URL}/restaurants/${restaurant.id}/menu/items/`;

      await apiRequest(
        endpoint,
        isEditing ? "PATCH" : "POST",
        formData,
        false
      );

      resetItemForm();

      setSuccess(
        isEditing
          ? "Menu item updated successfully."
          : "Menu item added successfully."
      );

      await loadMenu();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to save menu item."
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggleAvailability(item: MenuItem) {
    if (!restaurant) return;

    setError("");
    setSuccess("");

    try {
      await apiRequest(
        `${API_URL}/restaurants/${restaurant.id}/menu/items/${item.id}/`,
        "PATCH",
        JSON.stringify({
          is_available: !item.is_available,
        })
      );

      setSuccess(`${item.name} availability updated.`);
      await loadMenu();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to update item."
      );
    }
  }

  async function deleteItem(item: MenuItem) {
    if (!restaurant) return;

    if (
      !window.confirm(`Delete "${item.name}" from your menu?`)
    ) {
      return;
    }

    setError("");
    setSuccess("");

    try {
      await apiRequest(
        `${API_URL}/restaurants/${restaurant.id}/menu/items/${item.id}/`,
        "DELETE"
      );

      setSuccess("Menu item deleted.");
      await loadMenu();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to delete item."
      );
    }
  }

  async function deleteCategory(category: Category) {
    if (!restaurant) return;

    if (category.item_count > 0) {
      setError(
        "This category contains menu items. Move or delete those items first."
      );
      return;
    }

    if (!window.confirm(`Delete "${category.name}"?`)) return;

    setError("");
    setSuccess("");

    try {
      await apiRequest(
        `${API_URL}/restaurants/${restaurant.id}/menu/categories/${category.id}/`,
        "DELETE"
      );

      setSuccess("Category deleted.");
      await loadMenu();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to delete category."
      );
    }
  }

  function handleBranchChange(
    event: ChangeEvent<HTMLSelectElement>
  ) {
    const selected = Array.from(
      event.target.selectedOptions,
      (option) => Number(option.value)
    );

    setItemForm((previous) => ({
      ...previous,
      branches: selected,
    }));
  }

  function handleImageChange(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0] || null;

    if (file && !file.type.startsWith("image/")) {
      setError("Please select a valid image file.");
      event.target.value = "";
      return;
    }

    if (file && file.size > 5 * 1024 * 1024) {
      setError("Image size must not exceed 5MB.");
      event.target.value = "";
      return;
    }

    setError("");
    setImageFile(file);
  }

  const filteredItems =
    selectedCategory === "all"
      ? items
      : items.filter(
          (item) => item.category === Number(selectedCategory)
        );

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

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-emerald-100 border-t-emerald-600" />
          <p className="mt-4 text-sm text-gray-500">
            Loading menu management...
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
              MENU MANAGEMENT
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
              Menu Management
            </h2>

            <p className="mt-2 text-sm text-gray-500">
              Manage your food, drinks, categories and menu availability.
            </p>

            {restaurant && (
              <p className="mt-2 text-sm font-semibold text-slate-700">
                {restaurant.name}
              </p>
            )}
          </div>

          <button
            onClick={openCreateItemForm}
            disabled={categories.length === 0}
            className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            + Add menu item
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

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {[
            {
              label: "Total menu items",
              value: items.length,
            },
            {
              label: "Categories",
              value: categories.length,
            },
            {
              label: "Available items",
              value: items.filter((item) => item.is_available).length,
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
            >
              <p className="text-sm text-gray-500">{stat.label}</p>
              <p className="mt-3 text-3xl font-bold">{stat.value}</p>
            </div>
          ))}
        </div>

        <div className="mt-9 flex flex-wrap items-center justify-between gap-4 border-b border-gray-200">
          <div className="flex gap-6">
            <button
              onClick={() => setActiveTab("items")}
              className={`border-b-2 px-1 pb-3 text-sm font-semibold ${
                activeTab === "items"
                  ? "border-emerald-600 text-emerald-700"
                  : "border-transparent text-gray-500"
              }`}
            >
              Menu items
            </button>

            <button
              onClick={() => setActiveTab("categories")}
              className={`border-b-2 px-1 pb-3 text-sm font-semibold ${
                activeTab === "categories"
                  ? "border-emerald-600 text-emerald-700"
                  : "border-transparent text-gray-500"
              }`}
            >
              Categories
            </button>
          </div>

          <button
            onClick={() => {
              setShowCategoryForm(true);
              setShowItemForm(false);
              setEditingItem(null);
              setError("");
            }}
            className="mb-2 text-sm font-semibold text-emerald-700 hover:text-emerald-800"
          >
            + New category
          </button>
        </div>

        {showCategoryForm && (
          <form
            onSubmit={createCategory}
            className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
          >
            <h3 className="text-lg font-bold">
              Create menu category
            </h3>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium">
                  Category name *
                </label>

                <input
                  required
                  maxLength={100}
                  value={categoryForm.name}
                  onChange={(e) =>
                    setCategoryForm({
                      ...categoryForm,
                      name: e.target.value,
                    })
                  }
                  placeholder="e.g. Breakfast"
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Display order
                </label>

                <input
                  type="number"
                  min="0"
                  value={categoryForm.display_order}
                  onChange={(e) =>
                    setCategoryForm({
                      ...categoryForm,
                      display_order: Number(e.target.value),
                    })
                  }
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="mb-2 block text-sm font-medium">
                  Description
                </label>

                <textarea
                  rows={2}
                  value={categoryForm.description}
                  onChange={(e) =>
                    setCategoryForm({
                      ...categoryForm,
                      description: e.target.value,
                    })
                  }
                  placeholder="Describe this category (optional)"
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="mt-5 flex gap-3">
              <button
                disabled={saving}
                className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                {saving ? "Saving..." : "Create category"}
              </button>

              <button
                type="button"
                onClick={() => setShowCategoryForm(false)}
                className="rounded-xl border border-gray-200 px-5 py-3 text-sm font-semibold text-gray-600"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {showItemForm && (
          <form
            onSubmit={saveMenuItem}
            className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
          >
            <h3 className="text-lg font-bold">
              {editingItem ? "Edit menu item" : "Add a menu item"}
            </h3>

            <p className="mt-1 text-sm text-gray-500">
              {editingItem
                ? `Update the details for ${editingItem.name}.`
                : "Enter the details of the food or drink you want to add."}
            </p>

            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-2 block text-sm font-medium">
                  Item name *
                </label>

                <input
                  required
                  maxLength={200}
                  value={itemForm.name}
                  onChange={(e) =>
                    setItemForm({
                      ...itemForm,
                      name: e.target.value,
                    })
                  }
                  placeholder="e.g. Grilled Chicken"
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Category *
                </label>

                <select
                  required
                  value={itemForm.category}
                  onChange={(e) =>
                    setItemForm({
                      ...itemForm,
                      category: e.target.value,
                    })
                  }
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-500"
                >
                  <option value="">Select a category</option>

                  {categories
                    .filter((category) => category.is_active)
                    .map((category) => (
                      <option
                        key={category.id}
                        value={category.id}
                      >
                        {category.name}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Price ({restaurant?.currency || "NGN"}) *
                </label>

                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={itemForm.price}
                  onChange={(e) =>
                    setItemForm({
                      ...itemForm,
                      price: e.target.value,
                    })
                  }
                  placeholder="2500.00"
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="mb-2 block text-sm font-medium">
                  Description
                </label>

                <textarea
                  rows={3}
                  value={itemForm.description}
                  onChange={(e) =>
                    setItemForm({
                      ...itemForm,
                      description: e.target.value,
                    })
                  }
                  placeholder="Describe the food or drink..."
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Preparation time (minutes)
                </label>

                <input
                  type="number"
                  min="0"
                  value={itemForm.preparation_time}
                  onChange={(e) =>
                    setItemForm({
                      ...itemForm,
                      preparation_time: e.target.value,
                    })
                  }
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Display order
                </label>

                <input
                  type="number"
                  min="0"
                  value={itemForm.display_order}
                  onChange={(e) =>
                    setItemForm({
                      ...itemForm,
                      display_order: e.target.value,
                    })
                  }
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="mb-2 block text-sm font-medium">
                  Food image
                </label>

                {editingItem?.image && (
                  <div className="mb-4">
                    <p className="mb-2 text-xs text-gray-500">
                      Current image
                    </p>

                    <img
                      src={getImageUrl(editingItem.image) || ""}
                      alt={editingItem.name}
                      className="h-40 w-48 rounded-xl border border-gray-200 object-cover"
                    />
                  </div>
                )}

                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-emerald-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-emerald-700"
                />

                <p className="mt-2 text-xs text-gray-400">
                  {editingItem
                    ? "Choose a new image to replace the current image. Leave empty to keep the existing image."
                    : "Choose an image from your computer. Optional."}
                  {" Maximum size: 5MB."}
                </p>

                {imageFile && (
                  <div className="mt-3">
                    <p className="mb-2 text-xs font-semibold text-emerald-700">
                      New image selected: {imageFile.name}
                    </p>

                    <img
                      src={URL.createObjectURL(imageFile)}
                      alt="New menu item preview"
                      className="h-40 w-48 rounded-xl border border-gray-200 object-cover"
                    />
                  </div>
                )}
              </div>

              <div className="sm:col-span-2">
                <label className="mb-2 block text-sm font-medium">
                  Branch availability
                </label>

                <select
                  multiple
                  value={itemForm.branches.map(String)}
                  onChange={handleBranchChange}
                  className="min-h-28 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-500"
                >
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name} ({branch.code})
                    </option>
                  ))}
                </select>

                <p className="mt-2 text-xs text-gray-400">
                  Select the branches where this item is available.
                </p>
              </div>

              <div className="sm:col-span-2">
                <label className="flex items-center gap-3 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={itemForm.is_available}
                    onChange={(e) =>
                      setItemForm({
                        ...itemForm,
                        is_available: e.target.checked,
                      })
                    }
                    className="h-4 w-4 accent-emerald-600"
                  />
                  Available for ordering
                </label>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                disabled={saving || categories.length === 0}
                className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                {saving
                  ? "Saving..."
                  : editingItem
                    ? "Update menu item"
                    : "Save menu item"}
              </button>

              <button
                type="button"
                onClick={resetItemForm}
                className="rounded-xl border border-gray-200 px-5 py-3 text-sm font-semibold text-gray-600"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {activeTab === "categories" ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((category) => (
              <div
                key={category.id}
                className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold">{category.name}</h3>

                    <p className="mt-2 text-sm text-gray-500">
                      {category.description || "No description"}
                    </p>
                  </div>

                  <span className="rounded-lg bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                    {category.item_count} items
                  </span>
                </div>

                <div className="mt-5 flex items-center justify-between border-t border-gray-100 pt-4">
                  <span className="text-xs text-gray-400">
                    Order: {category.display_order}
                  </span>

                  <button
                    onClick={() => deleteCategory(category)}
                    className="text-xs font-semibold text-red-600 hover:text-red-700"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}

            {categories.length === 0 && (
              <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center sm:col-span-2 lg:col-span-3">
                <h3 className="font-bold">No categories yet</h3>

                <p className="mt-2 text-sm text-gray-500">
                  Create your first category to organise your menu.
                </p>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="mt-6 flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedCategory("all")}
                className={`rounded-full px-4 py-2 text-xs font-semibold ${
                  selectedCategory === "all"
                    ? "bg-emerald-600 text-white"
                    : "border border-gray-200 bg-white text-gray-600"
                }`}
              >
                All items ({items.length})
              </button>

              {categories.map((category) => (
                <button
                  key={category.id}
                  onClick={() =>
                    setSelectedCategory(String(category.id))
                  }
                  className={`rounded-full px-4 py-2 text-xs font-semibold ${
                    selectedCategory === String(category.id)
                      ? "bg-emerald-600 text-white"
                      : "border border-gray-200 bg-white text-gray-600"
                  }`}
                >
                  {category.name}
                </button>
              ))}
            </div>

            <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {filteredItems.map((item) => (
                <article
                  key={item.id}
                  className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"
                >
                  <div className="relative flex h-48 items-center justify-center bg-slate-100">
                    {item.image ? (
                      <img
                        src={getImageUrl(item.image) || ""}
                        alt={item.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="text-5xl text-slate-300">
                        ♨
                      </span>
                    )}

                    <span
                      className={`absolute right-3 top-3 rounded-full px-3 py-1 text-xs font-semibold ${
                        item.is_available
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-gray-200 text-gray-600"
                      }`}
                    >
                      {item.is_available
                        ? "Available"
                        : "Unavailable"}
                    </span>
                  </div>

                  <div className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold text-emerald-700">
                          {item.category_name}
                        </p>

                        <h3 className="mt-1 text-lg font-bold">
                          {item.name}
                        </h3>
                      </div>

                      <p className="whitespace-nowrap text-sm font-bold">
                        {money(item.price)}
                      </p>
                    </div>

                    <p className="mt-3 min-h-10 text-sm leading-5 text-gray-500">
                      {item.description || "No description provided."}
                    </p>

                    <div className="mt-4 flex flex-wrap gap-3 text-xs text-gray-400">
                      <span>
                        {item.preparation_time} min preparation
                      </span>

                      <span>
                        {item.branch_names.join(", ") || "All branches"}
                      </span>
                    </div>

                    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4">
                      <button
                        onClick={() => openEditItemForm(item)}
                        className="text-xs font-semibold text-blue-600 hover:text-blue-800"
                      >
                        Edit item
                      </button>

                      <button
                        onClick={() => toggleAvailability(item)}
                        className="text-xs font-semibold text-emerald-700 hover:text-emerald-800"
                      >
                        {item.is_available
                          ? "Mark unavailable"
                          : "Mark available"}
                      </button>

                      <button
                        onClick={() => deleteItem(item)}
                        className="text-xs font-semibold text-red-600 hover:text-red-700"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </article>
              ))}

              {filteredItems.length === 0 && (
                <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center sm:col-span-2 xl:col-span-3">
                  <h3 className="font-bold">No menu items found</h3>

                  <p className="mt-2 text-sm text-gray-500">
                    Create a category and add your first food or drink.
                  </p>

                  <button
                    onClick={() => {
                      if (categories.length === 0) {
                        setShowCategoryForm(true);
                        setShowItemForm(false);
                      } else {
                        openCreateItemForm();
                      }
                    }}
                    className="mt-5 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white"
                  >
                    {categories.length === 0
                      ? "Create category"
                      : "Add menu item"}
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
