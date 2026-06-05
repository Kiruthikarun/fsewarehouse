import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ForbiddenError } from "@/lib/rbac";
import { UnauthorizedError } from "@/lib/auth";
import { NotFoundError, ValidationError } from "@/lib/repositories";

/**
 * Wraps a route handler so domain/auth errors map to the right HTTP status.
 * Keeps every route handler down to "check permission → call repository →
 * return data", with one consistent error contract.
 */
export function route<T>(
  handler: () => Promise<T>,
): Promise<NextResponse> {
  return handler()
    .then((data) => NextResponse.json(data ?? { ok: true }))
    .catch(toErrorResponse);
}

function toErrorResponse(err: unknown): NextResponse {
  if (err instanceof UnauthorizedError) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (err instanceof ForbiddenError) {
    return NextResponse.json(
      { error: "Forbidden", permission: err.permission },
      { status: 403 },
    );
  }
  if (err instanceof NotFoundError) {
    return NextResponse.json({ error: err.message }, { status: 404 });
  }
  if (err instanceof ValidationError) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: "Invalid request body", issues: err.flatten() },
      { status: 400 },
    );
  }
  console.error("Unhandled API error:", err);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
