"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Grid from "@mui/material/Grid";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogActions from "@mui/material/DialogActions";
import TableCell from "@mui/material/TableCell";
import { alpha } from "@mui/material/styles";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import { PANEL, SIGNAL, monoFont } from "@/theme/theme";

/**
 * Shared MUI building blocks for the operations data pages (Warehouses,
 * Inventory, Movements). Every screen is built as the same dark "instrument
 * panel" the dashboard charts live in — so the whole product reads as one
 * control-room rather than a stack of unrelated CRUD screens. Page identity is
 * carried by the sidebar + breadcrumb header, so these panels lead straight
 * with the data, no repeated page titles.
 */

/* ── Control-room screen palette — matches AnalyticsCharts / dashboard panels ── */
export const screen = {
  panel: PANEL, // #11182b — the lit instrument surface
  deep: "#0b0f1a", // header band / inset wells
  text: "#e8edf6", // primary readout
  dim: "rgba(232,237,246,0.62)", // labels, secondary cells
  faint: "rgba(232,237,246,0.40)", // hints, placeholders
  line: "rgba(232,237,246,0.10)", // dividers / borders
  lineSoft: "rgba(232,237,246,0.06)", // inset wells
  hover: "rgba(255,255,255,0.04)", // row hover wash
} as const;

/** Faint signal-orange corner glow shared by every dark panel. */
const panelGlow = {
  content: '""',
  position: "absolute" as const,
  inset: 0,
  background: `radial-gradient(120% 120% at 100% 0%, ${alpha(SIGNAL, 0.14)} 0%, transparent 45%)`,
  pointerEvents: "none" as const,
};

/** Dark-surface treatment for MUI inputs (search / selects) on the panels. */
export const darkFieldSx = {
  "& .MuiInputBase-root": {
    color: screen.text,
    bgcolor: screen.lineSoft,
    borderRadius: 2,
  },
  "& .MuiOutlinedInput-notchedOutline": { borderColor: screen.line },
  "&:hover .MuiOutlinedInput-notchedOutline": {
    borderColor: "rgba(232,237,246,0.28)",
  },
  "& .Mui-focused .MuiOutlinedInput-notchedOutline": {
    borderColor: SIGNAL,
  },
  "& .MuiInputBase-input::placeholder": { color: screen.faint, opacity: 1 },
  "& .MuiSvgIcon-root": { color: screen.dim },
} as const;

/* ── KPI tile — a dark readout cell, mirroring the dashboard mini-stats ─────── */
export function StatTile({
  icon,
  label,
  value,
  accent = SIGNAL,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  accent?: string;
  hint?: string;
}) {
  return (
    <Grid size={{ xs: 6, md: 3 }}>
      <Card
        sx={{
          p: 2.5,
          height: "100%",
          position: "relative",
          overflow: "hidden",
          bgcolor: screen.panel,
          border: "1px solid",
          borderColor: screen.line,
          color: screen.text,
          transition: "border-color .2s, transform .2s",
          "&::before": panelGlow,
          "&:hover": {
            borderColor: alpha(accent, 0.5),
            transform: "translateY(-2px)",
          },
        }}
      >
        <Box
          sx={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            gap: 1,
            mb: 1,
          }}
        >
          <Box
            sx={{
              display: "grid",
              placeItems: "center",
              width: 28,
              height: 28,
              borderRadius: 1.5,
              bgcolor: alpha(accent, 0.16),
              color: accent,
              "& svg": { fontSize: 18 },
            }}
          >
            {icon}
          </Box>
          <Typography variant="overline" sx={{ color: screen.dim }}>
            {label}
          </Typography>
        </Box>
        <Typography
          sx={{
            position: "relative",
            fontFamily: monoFont,
            fontSize: "2rem",
            fontWeight: 600,
            lineHeight: 1,
            color: screen.text,
          }}
        >
          {value}
        </Typography>
        {hint && (
          <Typography
            variant="caption"
            sx={{ position: "relative", mt: 0.75, display: "block", color: screen.faint }}
          >
            {hint}
          </Typography>
        )}
      </Card>
    </Grid>
  );
}

/* ── Live search field (dark) ──────────────────────────────────────────────── */
export function SearchField({
  value,
  onChange,
  placeholder = "Search…",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <TextField
      size="small"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      sx={{ minWidth: { xs: "100%", sm: 260 }, ...darkFieldSx }}
      slotProps={{
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <SearchRoundedIcon sx={{ fontSize: 18, color: screen.dim }} />
            </InputAdornment>
          ),
        },
      }}
    />
  );
}

/* ── Toolbar above the table — count on the left, controls + action on right ── */
export function Toolbar({
  count,
  noun,
  action,
  children,
}: {
  count: number;
  noun: string;
  /** Primary page action (e.g. "Add warehouse") — lives here now that the
   *  redundant page header is gone. */
  action?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <Box
      sx={{
        position: "relative",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 1.5,
        px: { xs: 2, md: 2.5 },
        py: 2,
        borderBottom: "1px solid",
        borderColor: screen.line,
        bgcolor: screen.deep,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
        <Typography sx={{ fontFamily: monoFont, fontWeight: 700, color: screen.text }}>
          {count.toLocaleString()}
        </Typography>
        <Typography variant="body2" sx={{ color: screen.dim }}>
          {noun}
        </Typography>
      </Box>
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 1.5,
        }}
      >
        {children}
        {action}
      </Box>
    </Box>
  );
}

/* ── Card shell holding a toolbar + table (dark instrument panel) ──────────── */
export function TableCard({ children }: { children: React.ReactNode }) {
  return (
    <Card
      sx={{
        position: "relative",
        overflow: "hidden",
        p: 0,
        bgcolor: screen.panel,
        border: "1px solid",
        borderColor: screen.line,
        color: screen.text,
        "&::before": panelGlow,
      }}
    >
      <Box sx={{ position: "relative" }}>{children}</Box>
    </Card>
  );
}

/* ── Header cell sx — mono, uppercase, quiet, on the deep inset band ───────── */
export const headCellSx = {
  fontFamily: monoFont,
  textTransform: "uppercase" as const,
  letterSpacing: "0.1em",
  fontSize: "0.66rem",
  fontWeight: 600,
  color: screen.dim,
  borderBottom: "1px solid",
  borderColor: screen.line,
  bgcolor: screen.deep,
  py: 1.25,
};

/* ── Empty state row ───────────────────────────────────────────────────────── */
export function EmptyRow({
  colSpan,
  icon,
  message,
}: {
  colSpan: number;
  icon: React.ReactNode;
  message: string;
}) {
  return (
    <TableCell colSpan={colSpan} sx={{ border: 0, py: 8 }}>
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 1.5,
          color: screen.dim,
        }}
      >
        <Box
          sx={{
            display: "grid",
            placeItems: "center",
            width: 48,
            height: 48,
            borderRadius: 2,
            bgcolor: screen.lineSoft,
            color: screen.faint,
            "& svg": { fontSize: 26 },
          }}
        >
          {icon}
        </Box>
        <Typography variant="body2" sx={{ color: screen.dim }}>
          {message}
        </Typography>
      </Box>
    </TableCell>
  );
}

/* ── Confirm dialog for destructive actions ────────────────────────────────── */
export function ConfirmDialog({
  open,
  title,
  body,
  busy,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  body: string;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
        <WarningAmberRoundedIcon sx={{ color: "error.main" }} />
        {title}
      </DialogTitle>
      <DialogContent>
        <DialogContentText>{body}</DialogContentText>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose} color="inherit" disabled={busy}>
          Cancel
        </Button>
        <Button
          onClick={onConfirm}
          color="error"
          variant="contained"
          disableElevation
          disabled={busy}
        >
          {busy ? "Deleting…" : "Delete"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
