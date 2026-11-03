
"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { registerUser } from "@/lib/auth";

export default function RegisterPage() {
  const router = useRouter();

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    password: "",
    password_confirm: "",
  });

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function updateField(field: keyof typeof form, value: string) {
    setForm((previous) => ({ ...previous, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (form.password.length < 8) {
      setError("Your password must contain at least 8 characters.");
      return;
    }

    if (form.password !== form.password_confirm) {
      setError("Your passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      await registerUser(form);
      router.push("/login?registered=true");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to create your account.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen bg-white">
      <section className="hidden w-1/2 flex-col justify-between bg-[#17231e] p-12 text-white lg:flex">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#20a66a] text-xl font-bold">R</span>
          <span className="text-xl font-bold">RestaurantOS</span>
        </Link>

        <div className="max-w-lg">
          <p className="mb-5 text-xs font-bold tracking-[3px] text-emerald-400">
            ONE PLATFORM. BETTER OPERATIONS.
          </p>
          <h1 className="text-5xl font-bold leading-tight">
            Everything your restaurant needs to operate better.
          </h1>
          <p className="mt-6 leading-8 text-gray-300">
            Bring your restaurant operations together. Start with your
            workspace and grow as your business grows.
          </p>
          <div className="mt-12 space-y-4 text-sm text-gray-300">
            {[
              "Organise orders and kitchen workflows.",
              "Keep track of menus and inventory.",
              "Manage your team and restaurant branches.",
              "Understand your business performance.",
            ].map((item) => (
              <p key={item}><span className="mr-3 text-emerald-400">✓</span>{item}</p>
            ))}
          </div>
        </div>

        <p className="text-xs text-gray-500">© 2026 RestaurantOS. All rights reserved.</p>
      </section>

      <section className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <Link href="/" className="mb-10 flex items-center gap-3 lg:hidden">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#168451] font-bold text-white">R</span>
            <span className="text-xl font-bold">RestaurantOS</span>
          </Link>

          <p className="text-sm font-semibold text-[#168451]">GET STARTED</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight">Create your account</h2>
          <p className="mt-3 text-sm text-gray-500">
            Set up your RestaurantOS account to get started.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-semibold" htmlFor="first_name">First name</label>
                <input
                  id="first_name"
                  required
                  value={form.first_name}
                  onChange={(e) => updateField("first_name", e.target.value)}
                  placeholder="First name"
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-[#168451] focus:ring-4 focus:ring-emerald-50"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold" htmlFor="last_name">Last name</label>
                <input
                  id="last_name"
                  required
                  value={form.last_name}
                  onChange={(e) => updateField("last_name", e.target.value)}
                  placeholder="Last name"
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-[#168451] focus:ring-4 focus:ring-emerald-50"
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold" htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={form.email}
                onChange={(e) => updateField("email", e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-[#168451] focus:ring-4 focus:ring-emerald-50"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold" htmlFor="password">Password</label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={form.password}
                  onChange={(e) => updateField("password", e.target.value)}
                  placeholder="At least 8 characters"
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 pr-20 text-sm outline-none focus:border-[#168451] focus:ring-4 focus:ring-emerald-50"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-500"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold" htmlFor="password_confirm">Confirm password</label>
              <input
                id="password_confirm"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                required
                value={form.password_confirm}
                onChange={(e) => updateField("password_confirm", e.target.value)}
                placeholder="Re-enter your password"
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-[#168451] focus:ring-4 focus:ring-emerald-50"
              />
            </div>

            {error && (
              <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-[#168451] py-4 text-sm font-bold text-white transition hover:bg-[#116b41] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Creating account..." : "Create account"}
            </button>
          </form>

          <p className="mt-7 text-center text-sm text-gray-500">
            Already have an account?{" "}
            <Link href="/login" className="font-bold text-[#168451] hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
