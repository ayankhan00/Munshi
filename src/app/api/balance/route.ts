import { unwrapAsync, requireApiUser } from "@/lib/api";
import { getCurrentBalance } from "@/lib/services/transactions";

export async function GET() {
  return unwrapAsync(async () => {
    const user = await requireApiUser();
    return getCurrentBalance(user.id);
  });
}