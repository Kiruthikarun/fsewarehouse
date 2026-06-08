/**
 * Shared client-side validation for the numeric fields on the operations forms
 * (inventory quantity, movement quantity, warehouse capacity).
 *
 * The API routes already reject bad numbers with Zod (`z.coerce.number().int()…`),
 * but a raw ZodError surfaces to the user as the unhelpful "Invalid request body".
 * Validating here lets each form catch the mistake before the request and show a
 * clear, human message in its toast — the backend rules stay as the safety net.
 *
 * Mirror of the server constraints:
 *   - inventory quantity   → integer ≥ 0  (min: 0)
 *   - movement quantity    → integer ≥ 1  (min: 1)
 *   - warehouse capacity   → integer ≥ 1  (min: 1)
 */
export function validateInteger(
  raw: string,
  { min, label }: { min: number; label: string },
): string | null {
  const trimmed = raw.trim();
  if (trimmed === "") return `${label} is required.`;

  const value = Number(trimmed);
  if (!Number.isFinite(value)) return `${label} must be a number.`;
  if (!Number.isInteger(value)) return `${label} must be a whole number — no decimals.`;
  if (value < min) {
    return min > 0
      ? `${label} must be at least ${min}.`
      : `${label} can't be negative.`;
  }
  return null;
}

/** Constraint hint shown under a field until the user enters something invalid. */
export function integerHint(min: number): string {
  return min > 0 ? `Whole units — ${min} or more.` : "Whole units — 0 or more.";
}
