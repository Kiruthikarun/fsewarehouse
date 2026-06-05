import { NextRequest } from "next/server";
import { z } from "zod";
import { route } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { rolePermissions } from "@/lib/repositories";

// Reading and editing the org's RBAC policy is itself an administrative
// capability — gated by org:manage, exactly like member administration. The
// repository adds tenant-scope, the read-implies-access rule and the
// self-lockout guard.

export function GET() {
  return route(async () => {
    const user = await requirePermission("org:manage");
    return { matrix: await rolePermissions.matrix(user) };
  });
}

const SaveSchema = z.object({
  // role -> list of permission strings; the repository validates the contents.
  matrix: z.record(z.string(), z.array(z.string())),
});

export function PUT(req: NextRequest) {
  return route(async () => {
    const user = await requirePermission("org:manage");
    const { matrix } = SaveSchema.parse(await req.json());
    return { matrix: await rolePermissions.save(user, matrix) };
  });
}
