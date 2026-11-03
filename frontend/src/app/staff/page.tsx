
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

interface Branch {
  id: number;
  name: string;
  code: string;
  is_active: boolean;
}

interface StaffMember {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  role: string;
  role_display: string;
  branch_ids: number[];
  branch_names: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface StaffForm {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  phone: string;
  role: string;
  branch_ids: number[];
  is_active: boolean;
}

const EMPTY_FORM: StaffForm = {
  email: "",
  password: "",
  first_name: "",
  last_name: "",
  phone: "",
  role: "waiter",
  branch_ids: [],
  is_active: true,
};

const ROLES = [
  { value: "manager", label: "Manager" },
  { value: "cashier", label: "Cashier" },
  { value: "waiter", label: "Waiter" },
  { value: "kitchen_staff", label: "Kitchen Staff" },
];

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
            : typeof value === "object"
              ? JSON.stringify(value)
              : String(value);

          return `${field}: ${fieldMessage}`;
        })
        .join(" | ") ||
      "The request could not be completed.";

    throw new Error(message);
  }

  return data as T;
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

function getFullName(staff: StaffMember) {
  const name = `${staff.first_name || ""} ${staff.last_name || ""}`.trim();
  return name || staff.email;
}

export default function StaffPage() {
  const router = useRouter();

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState<number | null>(null);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [showForm, setShowForm] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [form, setForm] = useState<StaffForm>(EMPTY_FORM);

  const loadStaff = useCallback(async () => {
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

      const [staffData, branchData] = await Promise.all([
        apiRequest<unknown>(
          `${API_URL}/staff/${currentRestaurant.id}/`,
        ),
        apiRequest<unknown>(
          `${API_URL}/restaurants/${currentRestaurant.id}/branches/`,
        ),
      ]);

      setStaffMembers(getList<StaffMember>(staffData));
      setBranches(getList<Branch>(branchData));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to load staff records.";

      setError(message);

      if (message.toLowerCase().includes("log in")) {
        router.replace("/login");
      }
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadStaff();
  }, [loadStaff]);

  function openCreateForm() {
    setEditingStaff(null);
    setForm(EMPTY_FORM);
    setError("");
    setSuccess("");
    setShowForm(true);
  }

  function openEditForm(staff: StaffMember) {
    setEditingStaff(staff);

    setForm({
      email: staff.email,
      password: "",
      first_name: staff.first_name || "",
      last_name: staff.last_name || "",
      phone: staff.phone || "",
      role: staff.role,
      branch_ids: staff.branch_ids || [],
      is_active: staff.is_active,
    });

    setError("");
    setSuccess("");
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingStaff(null);
    setForm(EMPTY_FORM);
    setError("");
  }

  function toggleBranch(branchId: number) {
    setForm((previous) => ({
      ...previous,
      branch_ids: previous.branch_ids.includes(branchId)
        ? previous.branch_ids.filter((id) => id !== branchId)
        : [...previous.branch_ids, branchId],
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!restaurant) return;

    setSaving(true);
    setError("");
    setSuccess("");

    const payload: Record<string, unknown> = {
      email: form.email.trim(),
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      phone: form.phone.trim(),
      role: form.role,
      branch_ids: form.branch_ids,
      is_active: form.is_active,
    };

    if (!editingStaff || form.password.trim()) {
      payload.password = form.password;
    }

    try {
      const url = editingStaff
        ? `${API_URL}/staff/${restaurant.id}/${editingStaff.id}/`
        : `${API_URL}/staff/${restaurant.id}/`;

      await apiRequest(
        url,
        editingStaff ? "PATCH" : "POST",
        payload,
      );

      setShowForm(false);
      setEditingStaff(null);
      setForm(EMPTY_FORM);

      setSuccess(
        editingStaff
          ? "Staff details updated successfully."
          : "Staff account created successfully.",
      );

      await loadStaff();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to save staff member.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggleStaffStatus(staff: StaffMember) {
    if (!restaurant) return;

    const action = staff.is_active ? "deactivate" : "activate";

    const confirmed = window.confirm(
      `Are you sure you want to ${action} ${getFullName(staff)}'s account?`,
    );

    if (!confirmed) return;

    setUpdatingStatus(staff.id);
    setError("");
    setSuccess("");

    try {
      await apiRequest(
        `${API_URL}/staff/${restaurant.id}/${staff.id}/`,
        "PATCH",
        { is_active: !staff.is_active },
      );

      setSuccess(
        `${getFullName(staff)}'s account has been ${action}d successfully.`,
      );

      await loadStaff();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to update staff status.",
      );
    } finally {
      setUpdatingStatus(null);
    }
  }

  const filteredStaff = useMemo(() => {
    const query = search.trim().toLowerCase();

    return staffMembers.filter((staff) => {
      const matchesSearch =
        getFullName(staff).toLowerCase().includes(query) ||
        staff.email.toLowerCase().includes(query) ||
        (staff.phone || "").toLowerCase().includes(query);

      const matchesRole =
        roleFilter === "all" || staff.role === roleFilter;

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && staff.is_active) ||
        (statusFilter === "inactive" && !staff.is_active);

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [staffMembers, search, roleFilter, statusFilter]);

  const totalStaff = staffMembers.length;

  const activeStaff = staffMembers.filter(
    (staff) => staff.is_active,
  ).length;

  const inactiveStaff = totalStaff - activeStaff;

  const managerCount = staffMembers.filter(
    (staff) => staff.role === "manager",
  ).length;

  const currency = restaurant?.currency || "NGN";

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-indigo-100 border-t-indigo-600" />
          <p className="mt-4 text-sm text-slate-500">
            Loading staff records...
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
              STAFF MANAGEMENT
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => void loadStaff()}
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
              TEAM MANAGEMENT
            </p>

            <h2 className="mt-2 text-3xl font-bold">Staff</h2>

            <p className="mt-2 text-sm text-slate-500">
              Manage your restaurant team, assign roles and control account
              access.
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
            + Add staff member
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
            <p className="text-sm text-slate-500">Total staff</p>
            <h3 className="mt-2 text-3xl font-bold">
              {totalStaff.toLocaleString()}
            </h3>
            <p className="mt-2 text-xs text-slate-400">
              Registered staff accounts
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Active staff</p>
            <h3 className="mt-2 text-3xl font-bold text-emerald-600">
              {activeStaff.toLocaleString()}
            </h3>
            <p className="mt-2 text-xs text-slate-400">
              Accounts currently enabled
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Inactive staff</p>
            <h3 className="mt-2 text-3xl font-bold text-red-600">
              {inactiveStaff.toLocaleString()}
            </h3>
            <p className="mt-2 text-xs text-slate-400">
              Disabled accounts
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Managers</p>
            <h3 className="mt-2 text-3xl font-bold">
              {managerCount.toLocaleString()}
            </h3>
            <p className="mt-2 text-xs text-slate-400">
              Staff assigned the manager role
            </p>
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-slate-100 p-5 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-lg font-bold">Staff directory</h3>
              <p className="mt-1 text-xs text-slate-500">
                All staff accounts registered under your restaurant.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name, email or phone..."
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-indigo-500 sm:w-64"
              />

              <select
                value={roleFilter}
                onChange={(event) => setRoleFilter(event.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-indigo-500"
              >
                <option value="all">All roles</option>
                {ROLES.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </select>

              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-indigo-500"
              >
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          {filteredStaff.length === 0 ? (
            <div className="px-5 py-16 text-center">
              <div className="text-4xl">👥</div>
              <h4 className="mt-4 font-semibold">No staff found</h4>
              <p className="mt-2 text-sm text-slate-500">
                {search || roleFilter !== "all" || statusFilter !== "all"
                  ? "Try changing your search or filters."
                  : "Add your first staff member to get started."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-4 font-semibold">Staff member</th>
                    <th className="px-5 py-4 font-semibold">Phone</th>
                    <th className="px-5 py-4 font-semibold">Role</th>
                    <th className="px-5 py-4 font-semibold">Branches</th>
                    <th className="px-5 py-4 font-semibold">Joined</th>
                    <th className="px-5 py-4 font-semibold">Status</th>
                    <th className="px-5 py-4 font-semibold">Actions</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {filteredStaff.map((staff) => (
                    <tr key={staff.id} className="hover:bg-slate-50">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-100 font-bold text-indigo-700">
                            {getFullName(staff).charAt(0).toUpperCase()}
                          </div>

                          <div>
                            <p className="font-semibold">
                              {getFullName(staff)}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {staff.email}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-4 text-sm text-slate-600">
                        {staff.phone || "Not provided"}
                      </td>

                      <td className="px-5 py-4">
                        <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
                          {staff.role_display || staff.role}
                        </span>
                      </td>

                      <td className="px-5 py-4 text-sm text-slate-600">
                        {staff.branch_names?.length
                          ? staff.branch_names.join(", ")
                          : "No branch assigned"}
                      </td>

                      <td className="px-5 py-4 text-sm text-slate-600">
                        {formatDate(staff.created_at)}
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            staff.is_active
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-red-50 text-red-700"
                          }`}
                        >
                          {staff.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => openEditForm(staff)}
                            className="rounded-lg border border-indigo-200 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
                          >
                            Edit
                          </button>

                          <button
                            onClick={() => void toggleStaffStatus(staff)}
                            disabled={updatingStatus === staff.id}
                            className={`rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50 ${
                              staff.is_active
                                ? "border-red-200 text-red-600 hover:bg-red-50"
                                : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                            }`}
                          >
                            {updatingStatus === staff.id
                              ? "Updating..."
                              : staff.is_active
                                ? "Deactivate"
                                : "Activate"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="border-t border-slate-100 px-5 py-4 text-xs text-slate-500">
            Showing {filteredStaff.length} of {staffMembers.length} staff
            members
          </div>
        </div>
      </section>

      {showForm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4">
          <div className="my-8 w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 p-6">
              <div>
                <h3 className="text-xl font-bold">
                  {editingStaff ? "Edit staff member" : "Add staff member"}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Enter staff details and assign their restaurant role.
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

            <form onSubmit={handleSubmit} className="space-y-5 p-6">
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-semibold">
                    First name *
                  </label>
                  <input
                    required
                    value={form.first_name}
                    onChange={(event) =>
                      setForm({ ...form, first_name: event.target.value })
                    }
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-500"
                    placeholder="First name"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-semibold">
                    Last name *
                  </label>
                  <input
                    required
                    value={form.last_name}
                    onChange={(event) =>
                      setForm({ ...form, last_name: event.target.value })
                    }
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-500"
                    placeholder="Last name"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold">
                  Email address *
                </label>
                <input
                  type="email"
                  required
                  disabled={!!editingStaff}
                  value={form.email}
                  onChange={(event) =>
                    setForm({ ...form, email: event.target.value })
                  }
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-500 disabled:bg-slate-100"
                  placeholder="staff@example.com"
                />
                {editingStaff && (
                  <p className="mt-1 text-xs text-slate-400">
                    Email address cannot be changed here.
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold">
                  {editingStaff
                    ? "New password (optional)"
                    : "Temporary password *"}
                </label>
                <input
                  type="password"
                  required={!editingStaff}
                  minLength={8}
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(event) =>
                    setForm({ ...form, password: event.target.value })
                  }
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-500"
                  placeholder={
                    editingStaff
                      ? "Leave blank to keep current password"
                      : "Minimum 8 characters"
                  }
                />
              </div>

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
                  placeholder="08012345678"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold">
                  Staff role *
                </label>
                <select
                  required
                  value={form.role}
                  onChange={(event) =>
                    setForm({ ...form, role: event.target.value })
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-500"
                >
                  {ROLES.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold">
                  Assign branches
                </label>

                {branches.filter((branch) => branch.is_active).length === 0 ? (
                  <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
                    No active branches are available.
                  </p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {branches
                      .filter((branch) => branch.is_active)
                      .map((branch) => (
                        <label
                          key={branch.id}
                          className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 p-3 hover:bg-slate-50"
                        >
                          <input
                            type="checkbox"
                            checked={form.branch_ids.includes(branch.id)}
                            onChange={() => toggleBranch(branch.id)}
                            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="text-sm font-medium">
                            {branch.name}
                          </span>
                          <span className="ml-auto text-xs text-slate-400">
                            {branch.code}
                          </span>
                        </label>
                      ))}
                  </div>
                )}

                <p className="mt-2 text-xs text-slate-400">
                  You can assign more than one branch to a staff member.
                </p>
              </div>

              {editingStaff && (
                <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-4">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        is_active: event.target.checked,
                      })
                    }
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>
                    <span className="block text-sm font-semibold">
                      Account active
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">
                      Allow this staff account to remain enabled.
                    </span>
                  </span>
                </label>
              )}

              <div className="flex justify-end gap-3 border-t border-slate-100 pt-5">
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
                    : editingStaff
                      ? "Save changes"
                      : "Create staff account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
