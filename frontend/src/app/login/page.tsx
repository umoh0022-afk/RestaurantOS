
"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { loginUser } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      await loginUser(email, password);
      router.replace("/dashboard");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to log in.",
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
            RESTAURANT MANAGEMENT, SIMPLIFIED
          </p>
          <h1 className="text-5xl font-bold leading-tight">
            Run your restaurant. Not just your orders.
          </h1>
          <p className="mt-6 text-base leading-8 text-gray-300">
            Manage your orders, kitchen, inventory, team and business
            performance from one connected platform.
          </p>

          <div className="mt-12 grid grid-cols-2 gap-4">
            {["Order management", "Kitchen operations", "Inventory control", "Business insights"].map((item) => (
              <div key={item} className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-gray-200">
                <span className="mr-2 text-emerald-400">✓</span>
                {item}
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-gray-500">
          © 2026 RestaurantOS. All rights reserved.
        </p>
      </section>

      <section className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <Link href="/" className="mb-12 flex items-center gap-3 lg:hidden">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#168451] font-bold text-white">R</span>
            <span className="text-xl font-bold">RestaurantOS</span>
          </Link>

          <p className="text-sm font-semibold text-[#168451]">WELCOME BACK</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight">Sign in to your account</h2>
          <p className="mt-3 text-sm text-gray-500">
            Enter your details to access your restaurant workspace.
          </p>

          <form onSubmit={handleSubmit} className="mt-9 space-y-5">
            <div>
              <label htmlFor="email" className="mb-2 block text-sm font-semibold">Email address</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-xl border border-gray-200 px-4 py-3.5 text-sm outline-none transition focus:border-[#168451] focus:ring-4 focus:ring-emerald-50"
              />
            </div>

            <div>
              <div className="mb-2 flex justify-between">
                <label htmlFor="password" className="text-sm font-semibold">Password</label>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full rounded-xl border border-gray-200 px-4 py-3.5 pr-20 text-sm outline-none transition focus:border-[#168451] focus:ring-4 focus:ring-emerald-50"
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

            {error && (
              <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              disabled={loading}
              className="w-full rounded-xl bg-[#168451] py-4 text-sm font-bold text-white transition hover:bg-[#116b41] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-gray-500">
            Don&apos;t have an account?{" "}
            <Link href="/register" className="font-bold text-[#168451] hover:underline">
              Create an account
            </Link>
          </p>

          <p className="mt-12 text-center text-xs text-gray-400">
            Secure access to your restaurant workspace.
          </p>
        </div>
      </section>
    </main>
  );
}
