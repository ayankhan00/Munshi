import { type NextRequest } from "next/server";
import { unwrapAsync, requireApiUser, ApiError } from "@/lib/api";
import { recurringCreateSchema, recurringUpdateSchema } from "@/lib/validation";
import {
  createRecurring,
  listRecurring,
  updateRecurring,
  deleteRecurring,
} from "@/lib/services/recurring";

export async function GET() {
  return unwrapAsync(async () => {
    const user = await requireApiUser();
    return listRecurring(user.id);
  });
}

export async function POST(request: NextRequest) {
  return unwrapAsync(async () => {
    const user = await requireApiUser();
    const body = await request.json().catch(() => ({}));
    const parsed = recurringCreateSchema.parse(body);
    const rule = await createRecurring(user.id, parsed);
    return { rule };
  });
}

export async function PATCH(request: NextRequest) {
  return unwrapAsync(async () => {
    const user = await requireApiUser();
    const body = await request.json().catch(() => ({}));
    const parsed = recurringUpdateSchema.parse(body);
    const { id, ...patch } = parsed;
    const rule = await updateRecurring(user.id, id, patch);
    return { rule };
  });
}

export async function DELETE(request: NextRequest) {
  return unwrapAsync(async () => {
    const user = await requireApiUser();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) throw new ApiError(422, "id is required");
    return deleteRecurring(user.id, id);
  });
}
