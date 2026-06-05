import { NextRequest } from "next/server";
import { route } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { movements } from "@/lib/repositories";

type Params = { params: Promise<{ id: string }> };

// Deleting a movement reverses its stock effect (see movements.remove). Gated by
// movement:delete, which Manager and Admin hold but Operator does not — the floor
// records movements, but only managers/admins can unwind them.
export function DELETE(_req: NextRequest, { params }: Params) {
  return route(async () => {
    const user = await requirePermission("movement:delete");
    const { id } = await params;
    await movements.remove(user, id);
    return { ok: true };
  });
}
