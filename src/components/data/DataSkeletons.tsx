"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Grid from "@mui/material/Grid";
import Skeleton from "@mui/material/Skeleton";
import { alpha } from "@mui/material/styles";
import { PANEL, SIGNAL } from "@/theme/theme";

/**
 * Instant Suspense fallbacks for the operations data pages. Each route's
 * loading.tsx renders one of these so navigation paints the dark instrument
 * panel immediately — the layout appears to materialise while the page's
 * Postgres queries resolve, instead of hanging on a blank canvas.
 *
 * Geometry mirrors DataKit (StatTile / Toolbar / TableCard) so there's no
 * visible reflow when the real data swaps in.
 */

const LINE = "rgba(232,237,246,0.10)";
const DEEP = "#0b0f1a";
const shimmer = { bgcolor: "rgba(255,255,255,0.07)" } as const;
// Divider for skeleton elements that sit on the off-white app canvas (the home
// greeting band, the settings tab strip) rather than inside a dark panel.
const CANVAS_LINE = "rgba(15,23,42,0.10)";

const panelGlow = {
  content: '""',
  position: "absolute" as const,
  inset: 0,
  background: `radial-gradient(120% 120% at 100% 0%, ${alpha(SIGNAL, 0.12)} 0%, transparent 45%)`,
  pointerEvents: "none" as const,
};

const panelSx = { bgcolor: PANEL, border: "1px solid", borderColor: LINE } as const;
const riseSx = (delayMs: number) => ({
  opacity: 0,
  animation: "consoleRise 0.4s cubic-bezier(0.22,1,0.36,1) both",
  animationDelay: `${delayMs}ms`,
});

/** One KPI readout tile — same shell as DataKit's StatTile. */
export function StatTileSkeleton() {
  return (
    <Grid size={{ xs: 6, md: 3 }}>
      <Card
        sx={{
          p: 2.5,
          height: "100%",
          position: "relative",
          overflow: "hidden",
          bgcolor: PANEL,
          border: "1px solid",
          borderColor: LINE,
          "&::before": panelGlow,
        }}
      >
        <Box sx={{ position: "relative", display: "flex", alignItems: "center", gap: 1, mb: 1.25 }}>
          <Skeleton animation="wave" variant="rounded" width={28} height={28} sx={shimmer} />
          <Skeleton animation="wave" variant="text" width={80} height={12} sx={shimmer} />
        </Box>
        <Skeleton animation="wave" variant="text" width="52%" height={34} sx={{ ...shimmer, position: "relative" }} />
        <Skeleton animation="wave" variant="text" width="68%" height={12} sx={{ ...shimmer, mt: 0.75 }} />
      </Card>
    </Grid>
  );
}

/** A single table column's geometry — matched between header and body rows. */
export type SkelCol = {
  /** Fixed px width; omit to flex-fill the remaining space. */
  width?: number;
  align?: "left" | "right";
  /** Leading cell: render a small square (icon/avatar) before the text. */
  lead?: boolean;
};

function flexFor(c: SkelCol): React.CSSProperties["flex"] {
  return c.width ? `0 0 ${c.width}px` : "1 1 0";
}

/**
 * Full data-page skeleton: KPI tile row + a table card (toolbar + header +
 * body rows) shaped by `cols`.
 */
export function DataPageSkeleton({
  cols,
  rows = 8,
  controls = 1,
  tiles = 4,
  minWidth,
}: {
  cols: SkelCol[];
  rows?: number;
  /** Number of toolbar controls on the right (filters + search). */
  controls?: number;
  tiles?: number;
  /** Min table width before the panel clips (mirrors the real <Table>). */
  minWidth?: number;
}) {
  return (
    <Box>
      <Grid container spacing={2} sx={{ mb: 2.5 }}>
        {Array.from({ length: tiles }).map((_, i) => (
          <StatTileSkeleton key={i} />
        ))}
      </Grid>

      <Card
        sx={{
          position: "relative",
          overflow: "hidden",
          bgcolor: PANEL,
          border: "1px solid",
          borderColor: LINE,
          "&::before": panelGlow,
        }}
      >
        <Box sx={{ position: "relative" }}>
          {/* Toolbar band */}
          <Box
            sx={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 1.5,
              px: { xs: 2, md: 2.5 },
              py: 2,
              borderBottom: "1px solid",
              borderColor: LINE,
              bgcolor: DEEP,
            }}
          >
            <Skeleton animation="wave" variant="text" width={116} height={18} sx={shimmer} />
            <Box sx={{ display: "flex", gap: 1.5 }}>
              {Array.from({ length: controls }).map((_, i) => (
                <Skeleton
                  key={i}
                  animation="wave"
                  variant="rounded"
                  width={i === controls - 1 ? 200 : 132}
                  height={38}
                  sx={shimmer}
                />
              ))}
            </Box>
          </Box>

          <Box sx={{ overflow: "hidden" }}>
            <Box sx={{ minWidth }}>
              {/* Column header row */}
              <Box
                sx={{
                  display: "flex",
                  gap: 2,
                  px: { xs: 2, md: 2.5 },
                  py: 1.5,
                  borderBottom: "1px solid",
                  borderColor: LINE,
                  bgcolor: DEEP,
                }}
              >
                {cols.map((c, i) => (
                  <Box
                    key={i}
                    sx={{
                      flex: flexFor(c),
                      display: "flex",
                      justifyContent: c.align === "right" ? "flex-end" : "flex-start",
                    }}
                  >
                    <Skeleton
                      animation="wave"
                      variant="text"
                      width={c.align === "right" ? 40 : 60}
                      height={10}
                      sx={shimmer}
                    />
                  </Box>
                ))}
              </Box>

              {/* Body rows */}
              {Array.from({ length: rows }).map((_, r) => (
                <Box
                  key={r}
                  sx={{
                    display: "flex",
                    gap: 2,
                    alignItems: "center",
                    px: { xs: 2, md: 2.5 },
                    py: 1.75,
                    borderBottom: r === rows - 1 ? "none" : "1px solid",
                    borderColor: LINE,
                    // Gentle top-down stagger so the table reads as filling in.
                    ...riseSx(Math.min(r, 10) * 35),
                  }}
                >
                  {cols.map((c, i) => (
                    <Box
                      key={i}
                      sx={{
                        flex: flexFor(c),
                        display: "flex",
                        alignItems: "center",
                        gap: 1.25,
                        justifyContent: c.align === "right" ? "flex-end" : "flex-start",
                        minWidth: 0,
                      }}
                    >
                      {c.lead && (
                        <Skeleton
                          animation="wave"
                          variant="rounded"
                          width={32}
                          height={32}
                          sx={{ ...shimmer, flexShrink: 0 }}
                        />
                      )}
                      <Skeleton
                        animation="wave"
                        variant="text"
                        height={14}
                        width={c.align === "right" ? 44 : c.lead ? "60%" : "78%"}
                        sx={{ ...shimmer, maxWidth: c.lead ? 150 : undefined }}
                      />
                    </Box>
                  ))}
                </Box>
              ))}
            </Box>
          </Box>
        </Box>
      </Card>
    </Box>
  );
}

/* ── Settings console (Members tab) ───────────────────────────────────────── */

export function SettingsSkeleton() {
  return (
    <Box>
      {/* Tabs strip */}
      <Box sx={{ display: "flex", gap: 1, mb: 3, borderBottom: "1px solid", borderColor: CANVAS_LINE }}>
        {[70, 110].map((w, i) => (
          <Box key={i} sx={{ display: "flex", alignItems: "center", gap: 1, px: 2, py: 1.5 }}>
            <Skeleton animation="wave" variant="circular" width={18} height={18} />
            <Skeleton animation="wave" variant="text" width={w} height={14} />
          </Box>
        ))}
      </Box>

      {/* Console bar: filter + role distribution */}
      <Card
        sx={{
          ...panelSx,
          borderRadius: 3,
          p: 2,
          mb: 3,
          display: "flex",
          flexDirection: { xs: "column", sm: "row" },
          alignItems: { sm: "center" },
          justifyContent: "space-between",
          gap: { xs: 2.5, sm: 5 },
        }}
      >
        <Skeleton
          animation="wave"
          variant="rounded"
          height={38}
          sx={{ ...shimmer, width: { xs: "100%", sm: 300 }, flexShrink: 0 }}
        />
        <Box sx={{ flex: 1, width: "100%" }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}>
            <Skeleton animation="wave" variant="text" width={120} height={10} sx={shimmer} />
            <Skeleton animation="wave" variant="text" width={70} height={10} sx={shimmer} />
          </Box>
          <Skeleton animation="wave" variant="rounded" height={10} sx={{ ...shimmer, borderRadius: 5 }} />
          <Box sx={{ display: "flex", gap: 2, mt: 1.25 }}>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} animation="wave" variant="text" width={84} height={10} sx={shimmer} />
            ))}
          </Box>
        </Box>
      </Card>

      {/* Roster label */}
      <Skeleton animation="wave" variant="text" width={120} height={10} sx={{ mb: 1.5, ml: 0.5 }} />

      {/* Personnel rows */}
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
        {Array.from({ length: 5 }).map((_, r) => (
          <Card
            key={r}
            sx={{
              ...panelSx,
              borderRadius: 3,
              position: "relative",
              overflow: "hidden",
              px: 2,
              py: 1.5,
              display: "flex",
              alignItems: "center",
              gap: 2,
              ...riseSx(r * 45),
            }}
          >
            <Box sx={{ position: "absolute", insetBlock: 0, left: 0, width: 4, bgcolor: "rgba(255,255,255,0.08)" }} />
            <Skeleton animation="wave" variant="rounded" width={44} height={44} sx={{ ...shimmer, borderRadius: 2.5, flexShrink: 0 }} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Skeleton animation="wave" variant="text" width="38%" height={16} sx={shimmer} />
              <Skeleton animation="wave" variant="text" width="58%" height={11} sx={{ ...shimmer, mt: 0.5 }} />
            </Box>
            <Skeleton animation="wave" variant="rounded" width={140} height={40} sx={{ ...shimmer, flexShrink: 0 }} />
          </Card>
        ))}
      </Box>
    </Box>
  );
}

/* ── Home / operations overview ───────────────────────────────────────────── */

export function HomeSkeleton() {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {/* Header band */}
      <Box
        sx={{
          display: "flex",
          flexDirection: { xs: "column", sm: "row" },
          justifyContent: "space-between",
          alignItems: { sm: "flex-end" },
          gap: 3,
          pb: 3.5,
          borderBottom: "1px solid",
          borderColor: CANVAS_LINE,
        }}
      >
        <Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
            <Box sx={{ width: 4, height: 16, borderRadius: 1, bgcolor: SIGNAL }} />
            <Skeleton animation="wave" variant="text" width={150} height={11} />
          </Box>
          <Skeleton animation="wave" variant="text" width={280} height={40} sx={{ mt: 1.5 }} />
          <Box sx={{ display: "flex", gap: 1, mt: 1.5 }}>
            <Skeleton animation="wave" variant="rounded" width={120} height={24} />
            <Skeleton animation="wave" variant="rounded" width={90} height={24} />
          </Box>
        </Box>
        <Box sx={{ display: "flex", gap: 1.5, alignItems: "center" }}>
          <Skeleton animation="wave" variant="rounded" width={150} height={48} />
          <Skeleton animation="wave" variant="rounded" width={170} height={44} />
        </Box>
      </Box>

      {/* KPI cards */}
      <Grid container spacing={2}>
        {[0, 1, 2].map((i) => (
          <Grid key={i} size={{ xs: 12, sm: 4 }}>
            <Card sx={{ ...panelSx, p: 2.5, position: "relative", overflow: "hidden", "&::before": panelGlow }}>
              <Box sx={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Skeleton animation="wave" variant="text" width={70} height={10} sx={shimmer} />
                <Skeleton animation="wave" variant="rounded" width={32} height={32} sx={shimmer} />
              </Box>
              <Skeleton animation="wave" variant="text" width="45%" height={44} sx={{ ...shimmer, mt: 1.5 }} />
              <Skeleton animation="wave" variant="text" width="60%" height={11} sx={{ ...shimmer, mt: 0.5 }} />
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Workspace nav cards */}
      <Box>
        <Skeleton animation="wave" variant="text" width={150} height={10} sx={{ mb: 2 }} />
        <Grid container spacing={2}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Grid key={i} size={{ xs: 12, sm: 6 }}>
              <Card sx={{ ...panelSx, p: 2.5, display: "flex", gap: 2, ...riseSx(i * 50) }}>
                <Skeleton animation="wave" variant="rounded" width={44} height={44} sx={{ ...shimmer, flexShrink: 0 }} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Skeleton animation="wave" variant="text" width="45%" height={16} sx={shimmer} />
                  <Skeleton animation="wave" variant="text" width="88%" height={11} sx={{ ...shimmer, mt: 0.75 }} />
                  <Skeleton animation="wave" variant="text" width="68%" height={11} sx={{ ...shimmer, mt: 0.4 }} />
                </Box>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Box>
    </Box>
  );
}
