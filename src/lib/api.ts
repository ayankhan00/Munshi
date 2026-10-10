import { NextResponse } from "next/server";
import { jsonError } from "@/lib/http";
import { getCurrentUser, type SessionUser } from "@/lib/auth/current-user";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export class NotFoundError extends ApiError {
  constructor(message = "Not found") {
    super(404, message);
  }
}

export async function unwrapAsync<T>(fn: () => Promise<NextResponse | T>): Promise<NextResponse> {
  try {
    const result = await fn();
    if (result instanceof NextResponse) return result;
    return NextResponse.json({ ok: true, data: result });
  } catch (err) {
    if (err instanceof ApiError) return jsonError(err.message, err.status);
    if (err && typeof err === "object" && "issues" in err) {
      const issues = (err as { issues: { path: (string | number)[]; message: string }[] }).issues;
      const first = issues[0];
      return jsonError(first ? `${first.path.join(".")}: ${first.message}` : "Invalid input", 422);
    }
    console.error("[api] unhandled error", err instanceof Error ? err.message : err);
    return jsonError("Something went wrong.", 500);
  }
}

export async function requireApiUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new ApiError(401, "You must be signed in.");
  return user;
}