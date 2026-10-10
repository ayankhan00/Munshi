import { describe, it, expect, afterEach } from "vitest";
import { assertOrigin, isAllowedOrigin } from "@/lib/http";

function makeRequest(url: string, origin?: string): Request {
  const headers = new Headers();
  if (origin) headers.set("origin", origin);
  return new Request(url, { method: "POST", headers });
}

describe("isAllowedOrigin", () => {
  it("allows the host header even when request.url is normalized", () => {
    // Next dev reports request.url as localhost while the client used 127.0.0.1.
    expect(
      isAllowedOrigin("http://127.0.0.1:3000", {
        url: "http://localhost:3000/api/auth/register",
        host: "127.0.0.1:3000",
        proto: "http",
        appUrl: "http://localhost:3000",
      }),
    ).toBe(true);
  });

  it("allows a configured public origin", () => {
    expect(
      isAllowedOrigin("https://app.example.com", {
        url: "http://internal:3000/api/auth/login",
        host: "internal:3000",
        appUrl: "https://app.example.com",
      }),
    ).toBe(true);
  });

  it("allows multiple configured origins", () => {
    expect(
      isAllowedOrigin("https://b.example.com", {
        url: "http://internal:3000/api/auth/login",
        host: "internal:3000",
        appUrl: "https://a.example.com, https://b.example.com",
      }),
    ).toBe(true);
  });

  it("rejects a foreign origin", () => {
    expect(
      isAllowedOrigin("http://evil.example", {
        url: "http://localhost:3000/api/auth/register",
        host: "localhost:3000",
        appUrl: "http://localhost:3000",
      }),
    ).toBe(false);
  });

  it("respects x-forwarded-proto for the host origin", () => {
    expect(
      isAllowedOrigin("https://app.example.com", {
        url: "http://localhost:3000/api/auth/register",
        host: "app.example.com",
        proto: "https",
        appUrl: null,
      }),
    ).toBe(true);
  });
});

describe("assertOrigin", () => {
  const original = process.env.NEXT_PUBLIC_APP_URL;
  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = original;
  });

  it("allows the request's own origin even when APP_URL differs", () => {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    expect(
      assertOrigin(makeRequest("http://127.0.0.1:3000/api/auth/register", "http://127.0.0.1:3000")),
    ).toBe(true);
  });

  it("rejects a foreign origin", () => {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    expect(
      assertOrigin(makeRequest("http://localhost:3000/api/auth/register", "http://evil.example")),
    ).toBe(false);
  });

  it("allows requests without an origin header", () => {
    expect(assertOrigin(makeRequest("http://localhost:3000/api/auth/register"))).toBe(true);
  });
});
