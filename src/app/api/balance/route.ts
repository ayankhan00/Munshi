import { type NextRequest } from "next/server";
import { unwrapAsync, requireApiUser } from "@/lib/api";
import { getCurrentBalance } from "@/lib/services/transactions";

export async function GET(_request: NextRequest) {
  return unwrapAsync(async () => {
    const user = await requireApiUser();
    return getCurrentBalance(user.id);
  });
}