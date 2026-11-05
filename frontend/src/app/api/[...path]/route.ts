
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const API_TARGET =
  process.env.API_PROXY_TARGET || "http://localhost:8000";

async function proxyRequest(request: NextRequest) {
  const incomingUrl = new URL(request.url);

  const targetUrl = new URL(
    `${incomingUrl.pathname}${incomingUrl.search}`,
    API_TARGET
  );

  const headers = new Headers(request.headers);

  headers.delete("host");
  headers.delete("connection");
  headers.delete("content-length");
  headers.delete("accept-encoding");

  const method = request.method;

  const body =
    method === "GET" || method === "HEAD"
      ? undefined
      : await request.arrayBuffer();

  try {
    const upstream = await fetch(targetUrl, {
      method,
      headers,
      body,
      cache: "no-store",
      redirect: "manual",
    });

    const responseHeaders = new Headers(upstream.headers);

    // Remove headers that may no longer match the forwarded body.
    responseHeaders.delete("content-length");
    responseHeaders.delete("content-encoding");
    responseHeaders.delete("transfer-encoding");
    responseHeaders.delete("connection");

    const location = responseHeaders.get("location");

    if (location) {
      const redirectUrl = new URL(location, targetUrl);

      if (redirectUrl.origin === new URL(API_TARGET).origin) {
        responseHeaders.set(
          "location",
          `${redirectUrl.pathname}${redirectUrl.search}${redirectUrl.hash}`
        );
      }
    }

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("RestaurantOS API proxy error:", error);

    return NextResponse.json(
      {
        detail: "Unable to connect to the RestaurantOS API.",
      },
      { status: 502 }
    );
  }
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const PATCH = proxyRequest;
export const DELETE = proxyRequest;
export const OPTIONS = proxyRequest;
export const HEAD = proxyRequest;
