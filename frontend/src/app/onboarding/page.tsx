
"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

interface RestaurantForm {
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
}

const initialForm: RestaurantForm = {
  name: "",
  legal_name: "",
  restaurant_type: "casual_dining",
  email: "",
  phone: "",
  address: "",
  city: "",
  state: "",
  country: "Nigeria",
  currency: "NGN",
};

async function getCsrfToken(): Promise<string> {
  const response = await fetch(`${API_URL}/auth/csrf/`, {
    method: "GET",
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
    throw new Error(
      "Security cookie not found. Please refresh the page and try again."
    );
  }

  return decodeURIComponent(cookie.split("=")[1]);
}

export default function RestaurantOnboardingPage() {
  const router = useRouter();

  const [form, setForm] = useState<RestaurantForm>(initialForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  function updateField(
    field: keyof RestaurantForm,
    value: string
  ) {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const csrfToken = await getCsrfToken();

      const response = await fetch(`${API_URL}/restaurants/`, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": csrfToken,
        },
        body: JSON.stringify(form),
      });

      const data = await response.json().catch(() => ({}));

      if (response.status === 401 || response.status === 403) {
        throw new Error(
          data.detail || "Your session may have expired. Please log in again."
        );
      }

      if (!response.ok) {
        const message =
          data.detail ||
          Object.entries(data)
            .map(([field, messages]) => {
              const value = Array.isArray(messages)
                ? messages.join(", ")
                : String(messages);

              return `${field}: ${value}`;
            })
            .join(" | ") ||
          "Unable to register your restaurant.";

        throw new Error(message);
      }

      setSuccess(
        `${data.name} has been successfully registered. Your main branch has also been created.`
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-10">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 text-xl font-bold text-white">
              R
            </div>

            <div>
              <h1 className="text-xl font-bold tracking-tight">
                RestaurantOS
              </h1>
              <p className="text-xs text-slate-500">
                Restaurant Management Platform
              </p>
            </div>
          </div>

          <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-emerald-600">
            Business setup
          </p>

          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Set up your restaurant
          </h2>

          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500 sm:text-base">
            Tell us about your business. We&apos;ll create your restaurant
            workspace and main branch so you can start managing your
            operations.
          </p>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
          {success ? (
            <div className="py-10 text-center">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-3xl text-emerald-700">
                ✓
              </div>

              <h3 className="text-2xl font-bold">
                Restaurant registered!
              </h3>

              <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-500">
                {success}
              </p>

              <button
                onClick={() => router.push("/dashboard")}
                className="mt-8 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700"
              >
                Continue to dashboard
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-8">
              <div>
                <h3 className="text-lg font-semibold">
                  Restaurant information
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Enter your restaurant&apos;s basic business details.
                </p>

                <div className="mt-6 grid gap-5 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="mb-2 block text-sm font-medium">
                      Restaurant name *
                    </label>
                    <input
                      required
                      maxLength={255}
                      value={form.name}
                      onChange={(e) =>
                        updateField("name", e.target.value)
                      }
                      placeholder="e.g. The Green Plate"
                      className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="mb-2 block text-sm font-medium">
                      Legal business name
                    </label>
                    <input
                      value={form.legal_name}
                      onChange={(e) =>
                        updateField("legal_name", e.target.value)
                      }
                      placeholder="Registered business name (optional)"
                      className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium">
                      Restaurant type *
                    </label>
                    <select
                      required
                      value={form.restaurant_type}
                      onChange={(e) =>
                        updateField("restaurant_type", e.target.value)
                      }
                      className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                    >
                      <option value="fine_dining">Fine Dining</option>
                      <option value="casual_dining">Casual Dining</option>
                      <option value="fast_food">Fast Food</option>
                      <option value="cafe">Cafe</option>
                      <option value="bar">Bar</option>
                      <option value="bakery">Bakery</option>
                      <option value="food_truck">Food Truck</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium">
                      Business email
                    </label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) =>
                        updateField("email", e.target.value)
                      }
                      placeholder="business@example.com"
                      className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium">
                      Phone number *
                    </label>
                    <input
                      required
                      type="tel"
                      value={form.phone}
                      onChange={(e) =>
                        updateField("phone", e.target.value)
                      }
                      placeholder="+234 800 000 0000"
                      className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium">
                      Currency *
                    </label>
                    <select
                      required
                      value={form.currency}
                      onChange={(e) =>
                        updateField("currency", e.target.value)
                      }
                      className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                    >
                      <option value="NGN">NGN - Nigerian Naira</option>
                      <option value="USD">USD - US Dollar</option>
                      <option value="GBP">GBP - British Pound</option>
                      <option value="EUR">EUR - Euro</option>
                      <option value="GHS">GHS - Ghanaian Cedi</option>
                      <option value="KES">KES - Kenyan Shilling</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-7">
                <h3 className="text-lg font-semibold">
                  Restaurant location
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Where is your restaurant located?
                </p>

                <div className="mt-6 grid gap-5 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="mb-2 block text-sm font-medium">
                      Street address *
                    </label>
                    <textarea
                      required
                      rows={3}
                      value={form.address}
                      onChange={(e) =>
                        updateField("address", e.target.value)
                      }
                      placeholder="Enter your restaurant's full address"
                      className="w-full resize-y rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium">
                      City *
                    </label>
                    <input
                      required
                      value={form.city}
                      onChange={(e) =>
                        updateField("city", e.target.value)
                      }
                      placeholder="e.g. Abuja"
                      className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium">
                      State / Region
                    </label>
                    <input
                      value={form.state}
                      onChange={(e) =>
                        updateField("state", e.target.value)
                      }
                      placeholder="e.g. FCT"
                      className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium">
                      Country *
                    </label>
                    <input
                      required
                      value={form.country}
                      onChange={(e) =>
                        updateField("country", e.target.value)
                      }
                      placeholder="Nigeria"
                      className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                    />
                  </div>
                </div>
              </div>

              {error && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                >
                  {error}
                </div>
              )}

              <div className="border-t border-slate-100 pt-6">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-xl bg-emerald-600 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                >
                  {loading
                    ? "Creating your restaurant..."
                    : "Create restaurant workspace"}
                </button>

                <p className="mt-3 text-xs leading-5 text-slate-400">
                  Your account will automatically become the owner of
                  this restaurant. A main branch will be created for you.
                </p>
              </div>
            </form>
          )}
        </section>

        <p className="mt-6 text-center text-xs text-slate-400">
          RestaurantOS · Smarter restaurant management
        </p>
      </div>
    </main>
  );
}
