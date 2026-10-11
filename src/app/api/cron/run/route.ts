import { type NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { processDueReminders } from "@/lib/services/reminders";
import { runDueRecurringRules } from "@/lib/services/recurring";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}

async function run(request: NextRequest) {
  const secret = env().cronSecret;
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secret || provided !== secret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const reminders = await processDueReminders();
  const recurring = await runDueRecurringRules();
  return NextResponse.json({ ok: true, data: { reminders, recurring } });
}
