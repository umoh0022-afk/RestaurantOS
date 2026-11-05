
const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

export interface User {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
}

async function getCsrfToken(): Promise<string> {
  const response = await fetch(`${API_URL}/auth/csrf/`, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Unable to initialise security verification.");
  }

  const data = await response.json();

  if (!data.csrfToken) {
    throw new Error("Security verification token was not returned.");
  }

  return data.csrfToken;
}

async function refreshAccessToken(): Promise<boolean> {
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
  } catch {
    return false;
  }
}

function getErrorMessage(data: Record<string, any>): string {
  return (
    data.detail ||
    data.email?.[0] ||
    data.password?.[0] ||
    data.password_confirm?.[0] ||
    "Something went wrong. Please try again."
  );
}

async function executeRequest(
  endpoint: string,
  options: RequestInit,
  csrf: boolean
): Promise<Response> {
  const headers = new Headers(options.headers);

  headers.set("Content-Type", "application/json");

  if (csrf) {
    headers.set("X-CSRFToken", await getCsrfToken());
  }

  return fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
    credentials: "include",
    cache: "no-store",
  });
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  csrf = false,
  retry = true
): Promise<T> {
  let response = await executeRequest(endpoint, options, csrf);

  if (
    retry &&
    !endpoint.startsWith("/auth/login/") &&
    !endpoint.startsWith("/auth/register/") &&
    !endpoint.startsWith("/auth/refresh/") &&
    !endpoint.startsWith("/auth/logout/") &&
    (response.status === 401 || response.status === 403)
  ) {
    const errorData = await response.clone()
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

      if (refreshed) {
        response = await executeRequest(endpoint, options, csrf);
      }
    }
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(getErrorMessage(data));
  }

  return data as T;
}

export async function registerUser(payload: {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  password_confirm: string;
}) {
  return request<{ id: number; email: string }>(
    "/auth/register/",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    false,
    false
  );
}

export async function loginUser(email: string, password: string) {
  return request<{
    success: boolean;
    message: string;
    user: User;
  }>(
    "/auth/login/",
    {
      method: "POST",
      body: JSON.stringify({ email, password }),
    },
    true,
    false
  );
}

export async function getCurrentUser(): Promise<User> {
  const result = await request<{ success: boolean; user: User }>(
    "/auth/me/"
  );

  return result.user;
}

export async function refreshSession() {
  const refreshed = await refreshAccessToken();

  if (!refreshed) {
    throw new Error(
      "Your session has expired. Please log in again."
    );
  }

  return { success: true };
}

export async function logoutUser() {
  return request<{ success: boolean }>(
    "/auth/logout/",
    {
      method: "POST",
    },
    true,
    false
  );
}
