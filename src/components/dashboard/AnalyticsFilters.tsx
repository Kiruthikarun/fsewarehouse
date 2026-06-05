"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Box from "@mui/material/Box";
import MenuItem from "@mui/material/MenuItem";
import Select, { type SelectChangeEvent } from "@mui/material/Select";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import WarehouseRoundedIcon from "@mui/icons-material/WarehouseRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import { alpha } from "@mui/material/styles";
import { SIGNAL, monoFont } from "@/theme/theme";
import { DEFAULT_RANGE, RANGES } from "@/lib/analytics-ranges";
import { refreshAnalytics } from "@/app/(app)/dashboard/actions";
import type { WarehouseOption } from "@/lib/bigquery";

/**
 * URL-driven analytics filters. Changing the range or warehouse rewrites the
 * `?range=&wh=` search params; the server component re-runs its (cached)
 * BigQuery queries for the new scope. `useTransition` keeps the current view
 * interactive and dims it while the new data streams in.
 */
export function AnalyticsFilters({
  warehouses,
  rangeKey,
  warehouseId,
}: {
  warehouses: WarehouseOption[];
  rangeKey: string;
  warehouseId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = React.useTransition();

  const apply = (patch: Record<string, string>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      // Keep the URL clean: omit defaults ("all" warehouse, 30d range).
      if (!v || v === "all" || v === DEFAULT_RANGE) next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  const onRange = (_e: React.MouseEvent, value: string | null) => {
    if (value) apply({ range: value });
  };
  const onWarehouse = (e: SelectChangeEvent) => apply({ wh: e.target.value });

  // Busts the cached analytics for this org, then re-renders — so a fresh
  // BigQuery sync shows up without waiting for the 5-min cache window.
  const onRefresh = () =>
    startTransition(async () => {
      await refreshAnalytics();
      router.refresh();
    });

  return (
    <Box
      sx={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 1.5,
        opacity: pending ? 0.55 : 1,
        transition: "opacity .15s",
      }}
    >
      <ToggleButtonGroup
        exclusive
        size="small"
        value={rangeKey}
        onChange={onRange}
        aria-label="Time range"
        sx={{
          "& .MuiToggleButton-root": {
            px: 1.75,
            py: 0.5,
            fontFamily: monoFont,
            fontWeight: 600,
            fontSize: "0.76rem",
            letterSpacing: "0.04em",
            color: "rgba(232,237,246,0.6)",
            border: "1px solid rgba(255,255,255,0.12)",
            "&:hover": { bgcolor: "rgba(255,255,255,0.06)" },
          },
          "& .Mui-selected": {
            color: `${SIGNAL} !important`,
            bgcolor: `${alpha(SIGNAL, 0.16)} !important`,
            borderColor: `${alpha(SIGNAL, 0.45)} !important`,
          },
        }}
      >
        {RANGES.map((r) => (
          <ToggleButton key={r.key} value={r.key} aria-label={r.label}>
            {r.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      <Select
        size="small"
        value={warehouseId}
        onChange={onWarehouse}
        startAdornment={
          <WarehouseRoundedIcon
            sx={{ fontSize: 18, mr: 1, color: "rgba(232,237,246,0.6)" }}
          />
        }
        MenuProps={{ slotProps: { paper: { sx: { mt: 0.5 } } } }}
        sx={{
          minWidth: 210,
          height: 34,
          color: "#e8edf6",
          fontSize: "0.85rem",
          fontWeight: 500,
          bgcolor: "rgba(255,255,255,0.05)",
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: "rgba(255,255,255,0.12)",
          },
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: "rgba(255,255,255,0.25)",
          },
          "& .MuiSvgIcon-root": { color: "rgba(232,237,246,0.6)" },
        }}
      >
        <MenuItem value="all">All warehouses</MenuItem>
        {warehouses.map((w) => (
          <MenuItem key={w.warehouse_id} value={w.warehouse_id}>
            {w.warehouse_name}
          </MenuItem>
        ))}
      </Select>

      <Tooltip title="Refresh data — clears the cache to pull the latest sync">
        <IconButton
          onClick={onRefresh}
          aria-label="Refresh data"
          sx={{
            height: 34,
            width: 34,
            borderRadius: 1,
            color: "rgba(232,237,246,0.7)",
            border: "1px solid rgba(255,255,255,0.12)",
            "&:hover": { bgcolor: "rgba(255,255,255,0.06)", color: "#fff" },
          }}
        >
          <RefreshRoundedIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Tooltip>

      {pending && (
        <CircularProgress size={16} thickness={5} sx={{ color: SIGNAL, ml: 0.5 }} />
      )}
    </Box>
  );
}
