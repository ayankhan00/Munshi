import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { deleteSession } from "@/lib/auth/sessions";
import { env } from "@/lib/env";
import { jsonOk } from "@/lib/http";

export async function POST(_request: NextRequest) {
  const store = await cookies();
  const token = store.get(env().sessionCookieName)?.value;
  await deleteSession(token ?? "");
  const res = jsonOk({ success: true });
  res.cookies.set(env().sessionCookieName, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}