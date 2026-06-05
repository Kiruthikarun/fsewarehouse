"use client";

import Box from "@mui/material/Box";
import type { BoxProps } from "@mui/material/Box";
import type { SystemStyleObject, Theme } from "@mui/system";

type Responsive<T> = T | Partial<Record<"xs" | "sm" | "md" | "lg" | "xl", T>>;

/**
 * Thin flex wrapper over Box. MUI v9's Stack overloads resolve poorly under the
 * React 19 type defs (they spuriously demand a `component` prop), so we use Box
 * with display:flex — same layout, clean types.
 */
export function Flex({
  direction = "row",
  align,
  justify,
  gap,
  wrap,
  sx,
  ...rest
}: {
  direction?: Responsive<"row" | "column" | "row-reverse" | "column-reverse">;
  align?: Responsive<string>;
  justify?: Responsive<string>;
  gap?: number;
  wrap?: "nowrap" | "wrap" | "wrap-reverse";
} & BoxProps) {
  return (
    <Box
      sx={
        {
          display: "flex",
          flexDirection: direction,
          alignItems: align,
          justifyContent: justify,
          gap,
          flexWrap: wrap,
          ...sx,
        } as SystemStyleObject<Theme>
      }
      {...rest}
    />
  );
}
