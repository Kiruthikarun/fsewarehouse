"use client";

import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Grid from "@mui/material/Grid";
import Skeleton from "@mui/material/Skeleton";
import Typography from "@mui/material/Typography";
import { PANEL } from "@/theme/theme";
import { Flex } from "./Flex";

// Light-on-dark shimmer + dark panel surface, so the placeholder matches the
// real (now fully dark) dashboard while it streams in.
const shimmer = { bgcolor: "rgba(255,255,255,0.08)" };
const panelCard = {
  p: 2.5,
  bgcolor: PANEL,
  border: "1px solid rgba(232,237,246,0.10)",
} as const;

/**
 * Instant placeholder streamed by dashboard/loading.tsx while the BigQuery
 * queries resolve on the server. Mirrors the real layout so the page feels like
 * it's materialising rather than hanging on a blank screen.
 */
export function DashboardSkeleton() {
  return (
    <Box>
      <Flex direction="column" gap={0.5} sx={{ mb: 3 }}>
        <Typography variant="overline" color="text.secondary">
          Analytics · Live from BigQuery
        </Typography>
        <Flex direction="row" align="center" gap={1.5}>
          <Skeleton variant="text" width={260} height={44} />
          <Box
            sx={{
              fontSize: 12,
              color: "text.secondary",
              fontFamily: "var(--font-plex-mono)",
            }}
          >
            loading…
          </Box>
        </Flex>
      </Flex>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <Grid size={{ xs: 6, lg: 3 }} key={i}>
            <Card sx={panelCard}>
              <Skeleton variant="rounded" width={28} height={28} sx={{ mb: 1, ...shimmer }} />
              <Skeleton variant="text" width="60%" sx={shimmer} />
              <Skeleton variant="text" width="45%" height={40} sx={shimmer} />
            </Card>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <Grid size={{ xs: 12, md: 4 }} key={i}>
            <Card sx={panelCard}>
              <Flex direction="row" justify="space-between">
                <Skeleton variant="text" width="40%" sx={shimmer} />
                <Skeleton variant="text" width={32} height={36} sx={shimmer} />
              </Flex>
              <Skeleton variant="text" width="55%" sx={shimmer} />
            </Card>
          </Grid>
        ))}
      </Grid>

      <Card sx={{ mb: 2, p: 3, bgcolor: PANEL, border: "1px solid rgba(232,237,246,0.10)" }}>
        <Skeleton variant="text" width={200} sx={shimmer} />
        <Skeleton variant="rounded" height={250} sx={{ mt: 2, ...shimmer }} />
      </Card>

      <Card sx={panelCard}>
        <Skeleton variant="text" width={260} sx={{ mb: 2, ...shimmer }} />
        <Skeleton variant="rounded" height={360} sx={shimmer} />
      </Card>
    </Box>
  );
}
