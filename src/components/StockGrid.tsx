"use client";

import { useMemo } from "react";
import { AgGridReact } from "ag-grid-react";
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
  type ColDef,
  type ICellRendererParams,
} from "ag-grid-community";
import type { StockRow } from "@/lib/bigquery";

// AG Grid v33 requires explicit module registration. We use the Theming API
// (themeQuartz) instead of importing the legacy CSS files — mixing the two
// triggers AG Grid error #239.
ModuleRegistry.registerModules([AllCommunityModule]);

// Dark "instrument panel" grid — same #11182b surface, mono headers and
// signal-orange accent as the dashboard chart panels and data tables, so the
// ledger reads as part of the same control-room.
const gridTheme = themeQuartz.withParams({
  backgroundColor: "#11182b",
  foregroundColor: "#e8edf6",
  headerBackgroundColor: "#0b0f1a",
  headerTextColor: "rgba(232,237,246,0.62)",
  borderColor: "rgba(232,237,246,0.10)",
  oddRowBackgroundColor: "rgba(255,255,255,0.018)",
  rowHoverColor: "rgba(255,255,255,0.05)",
  chromeBackgroundColor: "#0b0f1a",
  accentColor: "#ff6a1a",
  fontFamily: "var(--font-plex-sans), ui-sans-serif, system-ui, sans-serif",
  headerFontFamily: "var(--font-plex-mono), ui-monospace, monospace",
});

const STATUS_CLASS: Record<string, string> = {
  DEAD: "bg-rose-500/15 text-rose-300",
  LOW: "bg-amber-500/15 text-amber-300",
  FAST: "bg-emerald-500/15 text-emerald-300",
  OK: "bg-slate-400/15 text-slate-300",
};

// React cell renderer — v33 no longer parses HTML returned from a string
// renderer (it shows it as literal text), so the status pill must be a node.
function StatusPill(p: ICellRendererParams<StockRow, string>) {
  const value = p.value ?? "";
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
        STATUS_CLASS[value] ?? "bg-slate-400/15 text-slate-300"
      }`}
    >
      {value}
    </span>
  );
}

export function StockGrid({ rows }: { rows: StockRow[] }) {
  const columnDefs = useMemo<ColDef<StockRow>[]>(
    () => [
      { field: "sku", headerName: "SKU", width: 130, filter: true },
      { field: "item_name", headerName: "Item", flex: 1, filter: true },
      { field: "warehouse_name", headerName: "Warehouse", flex: 1, filter: true },
      { field: "quantity", headerName: "In stock", width: 110, type: "numericColumn" },
      {
        field: "outbound",
        headerName: "Outbound",
        width: 120,
        type: "numericColumn",
      },
      {
        field: "velocity_per_week",
        headerName: "Units/wk",
        width: 120,
        type: "numericColumn",
      },
      {
        field: "status",
        headerName: "Status",
        width: 120,
        cellRenderer: StatusPill,
      },
    ],
    [],
  );

  return (
    <div style={{ height: 520, width: "100%" }}>
      <AgGridReact<StockRow>
        theme={gridTheme}
        rowData={rows}
        columnDefs={columnDefs}
        defaultColDef={{ sortable: true, resizable: true }}
        pagination
        paginationPageSize={20}
        paginationPageSizeSelector={[20, 50, 100]}
      />
    </div>
  );
}
