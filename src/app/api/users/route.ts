import { route } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { users } from "@/lib/repositories";

// Listing org members is an administrative capability — gated by org:manage,
// which only ADMIN holds. A Warehouse Manager hitting this gets a 403.
export function GET() {
  return route(async () => {
    const user = await requirePermission("org:manage");
    return users.list(user);
  });
}
