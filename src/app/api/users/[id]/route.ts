import { NextRequest } from "next/server";
import { z } from "zod";
import { Role } from "@prisma/client";
import { route } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { users } from "@/lib/repositories";

const UpdateSchema = z.object({
  role: z.nativeEnum(Role),
});

type Params = { params: Promise<{ id: string }> };

// Changing a member's role is the Admin-only write that defines the role.
// requirePermission("org:manage") is the gate; the repository adds the
// tenant-scope + "can't change your own role" + "keep one Admin" guards.
export function PATCH(req: NextRequest, { params }: Params) {
  return route(async () => {
    const user = await requirePermission("org:manage");
    const { id } = await params;
    const { role } = UpdateSchema.parse(await req.json());
    return users.updateRole(user, id, role);
  });
}
