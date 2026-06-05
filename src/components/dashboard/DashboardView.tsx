"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Grid from "@mui/material/Grid";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import type { Role } from "@prisma/client";
import { PANEL, SIGNAL, monoFont } from "@/theme/theme";
import type { AnalyticsData, WarehouseOption } from "@/lib/bigquery";
import { VelocityChart } from "@/components/VelocityChart";
import { StockGrid } from "@/components/StockGrid";
import {
  CapacityChart,
  StatusDonut,
  TopMoversChart,
  WarehouseThroughputChart,
} from "./AnalyticsCharts";
import { AnalyticsFilters } from "./AnalyticsFilters";
import { rangeLabel } from "@/lib/analytics-ranges";
import { Flex } from "./Flex";

interface Props {
  role: Role;
  orgName: string;
  data: AnalyticsData;
  warehouses: WarehouseOption[];
  rangeKey: string;
  warehouseId: string;
}

export function AnalyticsView({
  role,
  data,
  warehouses,
  rangeKey,
  warehouseId,
}: Props) {
  const isAdmin = role === "ADMIN";
  const label = rangeLabel(rangeKey);

  return (
    <Box>
      {/* Pinned console header — filters + key metrics in one dark block, stuck
          under the breadcrumb header (60px) so both stay visible while scrolling.
          Bled out to the content-column edges, then re-padded. */}
      <Box
        sx={{
          position: "sticky",
          top: 60,
          zIndex: 5,
          // Pull up by the content wrapper's top padding (py-8 = 32px) so the bar
          // sits flush against the breadcrumb header with no grey gap.
          mt: -4,
          // Break out of the centered content column to the FULL working-area
          // width, exactly like the breadcrumb header — so the two read as one
          // continuous dark header and the bar expands when the sidebar collapses.
          // Measured in container-query units (100cqw = <main> width), which
          // excludes the sidebar, unlike 100vw. The inner px re-pad matches the
          // header's px-4/sm:px-6/lg:px-10 so the filters align under the crumbs.
          width: "100cqw",
          mx: "calc((100cqw - 100%) / -2)",
          px: { xs: 2, sm: 3, lg: 5 },
          mb: 2.5,
          py: 1.5,
          bgcolor: "#0b0f1a",
          overflow: "hidden",
          boxShadow: "0 12px 28px -20px rgba(0,0,0,0.9)",
          // Lit signal underline — the base of the instrument panel.
          "&::after": {
            content: '""',
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: "1px",
            background:
              "linear-gradient(90deg, transparent, rgba(255,106,26,0.45), transparent)",
          },
          // Faint corner glow, echoing the dark chart panels below.
          "&::before": {
            content: '""',
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(80% 130% at 100% 0%, rgba(255,106,26,0.07), transparent 55%)",
            pointerEvents: "none",
          },
        }}
      >
        <Flex
          justify="space-between"
          align="center"
          sx={{ position: "relative", gap: { xs: 1.5, md: 3 }, flexWrap: "wrap", rowGap: 1.25 }}
        >
          <AnalyticsFilters
            warehouses={warehouses}
            rangeKey={rangeKey}
            warehouseId={warehouseId}
          />
          <MiniStats kpis={data.kpis} net={data.netUnits} rangeLabel={label} />
        </Flex>
      </Box>

      {isAdmin ? (
        <AdminSections data={data} rangeLabel={label} />
      ) : (
        <ManagerSections data={data} rangeLabel={label} />
      )}
    </Box>
  );
}

/* ── Admin: broad, cross-warehouse, portfolio health ──────────────────────── */

function AdminSections({ data, rangeLabel }: { data: AnalyticsData; rangeLabel: string }) {
  return (
    <>
      <Panel overline={`Movement Velocity · ${rangeLabel}`} title="Inbound vs Outbound" legend={<VelocityLegend />}>
        <VelocityChart data={data.velocity} dark />
      </Panel>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, lg: 7 }}>
          <Panel
            overline={`Throughput · ${rangeLabel}`}
            title="By Warehouse"
            legend={<VelocityLegend />}
            stretch
          >
            <WarehouseThroughputChart data={data.throughput ?? []} />
          </Panel>
        </Grid>
        <Grid size={{ xs: 12, lg: 5 }}>
          <Panel overline="Portfolio Health" title="Inventory Status" stretch center>
            <StatusDonut data={data.status} />
          </Panel>
        </Grid>
      </Grid>

      <Panel
        overline="Capacity"
        title="Warehouse Utilisation"
        legend={
          <>
            <Legend color="#1f9d55" label="< 75%" />
            <Legend color="#c77700" label="75–90%" />
            <Legend color="#d33a2c" label="> 90%" />
          </>
        }
      >
        <CapacityChart data={data.capacity ?? []} />
      </Panel>
    </>
  );
}

/* ── Manager: detailed, SKU-level, operational ────────────────────────────── */

function ManagerSections({ data, rangeLabel }: { data: AnalyticsData; rangeLabel: string }) {
  return (
    <>
      <Panel overline={`Movement Velocity · ${rangeLabel}`} title="Inbound vs Outbound" legend={<VelocityLegend />}>
        <VelocityChart data={data.velocity} dark />
      </Panel>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, lg: 7 }}>
          <Panel overline={`Top Movers · ${rangeLabel}`} title="Highest Outbound by SKU" stretch>
            <TopMoversChart data={data.topMovers ?? []} />
          </Panel>
        </Grid>
        <Grid size={{ xs: 12, lg: 5 }}>
          <Panel overline="Portfolio Health" title="Inventory Status" stretch center>
            <StatusDonut data={data.status} />
          </Panel>
        </Grid>
      </Grid>

      <Panel overline="Stock Ledger" title="Stock Levels &amp; Velocity by SKU">
        <StockGrid rows={data.stock ?? []} />
      </Panel>
    </>
  );
}

/* ── Minimal metrics strip ────────────────────────────────────────────────── */

function MiniStats({
  kpis,
  net,
  rangeLabel,
}: {
  kpis: AnalyticsData["kpis"];
  net: number;
  rangeLabel: string;
}) {
  const inflow = net >= 0;
  const items: { label: string; value: string; color?: string }[] = [
    { label: "SKUs Tracked", value: kpis.totalItems.toLocaleString() },
    { label: "Units In Stock", value: kpis.totalUnits.toLocaleString() },
    { label: "Warehouses", value: kpis.warehouses.toLocaleString() },
    { label: `Movements · ${rangeLabel}`, value: kpis.movementsInRange.toLocaleString() },
    {
      label: `Net · ${rangeLabel}`,
      value: `${inflow ? "+" : ""}${net.toLocaleString()}`,
      color: inflow ? "#36d399" : "#f87171",
    },
  ];
  return (
    <Flex align="center" sx={{ flexWrap: "wrap", rowGap: 1 }}>
      {/* live telemetry indicator */}
      <Box
        className="signal-pulse"
        sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: SIGNAL, mr: 2, ml: { xs: 1, md: 0 } }}
      />
      {items.map((it, i) => (
        <Box
          key={it.label}
          sx={{
            px: { xs: 1.5, md: 2.25 },
            borderLeft: i === 0 ? "none" : "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <Typography
            sx={{
              display: "block",
              whiteSpace: "nowrap",
              fontSize: "0.56rem",
              fontWeight: 600,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "rgba(232,237,246,0.45)",
              lineHeight: 1.5,
              mb: 0.25,
            }}
          >
            {it.label}
          </Typography>
          <Typography
            sx={{
              fontFamily: monoFont,
              fontWeight: 600,
              fontSize: "1.15rem",
              lineHeight: 1.1,
              color: it.color ?? "#e8edf6",
            }}
          >
            {it.value}
          </Typography>
        </Box>
      ))}
    </Flex>
  );
}

/* ── Shared dark "screen" panel + legends ─────────────────────────────────── */

function Panel({
  overline,
  title,
  legend,
  children,
  stretch,
  center,
}: {
  overline: string;
  title: string;
  legend?: React.ReactNode;
  children: React.ReactNode;
  stretch?: boolean;
  /** Center the body in the remaining height — used by the status donut. */
  center?: boolean;
}) {
  return (
    <Card
      sx={{
        mb: 2,
        p: { xs: 2, md: 3 },
        height: stretch ? "100%" : "auto",
        bgcolor: PANEL,
        border: "1px solid rgba(232,237,246,0.08)",
        color: "#e8edf6",
        position: "relative",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        "&::before": {
          content: '""',
          position: "absolute",
          inset: 0,
          background: `radial-gradient(120% 120% at 100% 0%, ${alpha(SIGNAL, 0.16)} 0%, transparent 45%)`,
          pointerEvents: "none",
        },
      }}
    >
      <Flex justify="space-between" align="flex-start" sx={{ mb: 1.5, position: "relative" }}>
        <Box>
          <Typography variant="overline" sx={{ color: alpha("#e8edf6", 0.6) }}>
            {overline}
          </Typography>
          <Typography variant="h6" sx={{ color: "#fff", fontWeight: 700, lineHeight: 1.2 }}>
            {title}
          </Typography>
        </Box>
        {legend && (
          <Flex gap={1.25} sx={{ flexWrap: "wrap", pt: 0.5 }}>
            {legend}
          </Flex>
        )}
      </Flex>
      <Box
        sx={{
          position: "relative",
          ...(center
            ? { flexGrow: 1, display: "flex", alignItems: "center", justifyContent: "center" }
            : {}),
        }}
      >
        {children}
      </Box>
    </Card>
  );
}

function VelocityLegend() {
  return (
    <>
      <Legend color="#38bdf8" label="Inbound" />
      <Legend color={SIGNAL} label="Outbound" />
    </>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <Flex gap={0.75} align="center">
      <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: color }} />
      <Typography variant="caption" sx={{ color: alpha("#e8edf6", 0.7), fontFamily: monoFont }}>
        {label}
      </Typography>
    </Flex>
  );
}
