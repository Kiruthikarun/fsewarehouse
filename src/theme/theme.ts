"use client";

import { createTheme } from "@mui/material/styles";

/**
 * "Operations control-room" theme.
 *
 * A warehouse analytics console should feel like instrumentation, not a generic
 * SaaS dashboard. Ink/slate base, a single hi-vis signal-orange accent (the
 * colour of warehouse safety vests / forklift markings — not the AI-slop purple),
 * and IBM Plex Mono for every number so figures read like a readout.
 */

export const INK = "#0b0f1a";
export const PANEL = "#11182b";
export const SIGNAL = "#ff6a1a"; // hi-vis signal orange
export const SIGNAL_SOFT = "#ffb38a";

const mono = "var(--font-plex-mono), ui-monospace, monospace";
const sans = "var(--font-plex-sans), ui-sans-serif, system-ui, sans-serif";

export const theme = createTheme({
  cssVariables: true,
  palette: {
    mode: "dark",
    primary: { main: SIGNAL, contrastText: "#0b0f1a" },
    // Ink canvas + lit instrument panels — same surfaces as the sidebar/header.
    background: { default: INK, paper: PANEL },
    // Brighter secondary than before (was #5b6472, which merged into the panels)
    // so labels/secondary cells read clearly on the dark surface.
    text: { primary: "#e8edf6", secondary: "#aeb8c7" },
    divider: "rgba(232,237,246,0.12)",
    success: { main: "#34c97b" },
    warning: { main: "#e8a13a" },
    error: { main: "#f0584a" },
  },
  shape: { borderRadius: 14 },
  typography: {
    fontFamily: sans,
    h4: { fontWeight: 700, letterSpacing: "-0.02em" },
    h5: { fontWeight: 700, letterSpacing: "-0.01em" },
    overline: {
      fontFamily: mono,
      fontWeight: 600,
      letterSpacing: "0.18em",
      fontSize: "0.66rem",
    },
    button: { textTransform: "none", fontWeight: 600 },
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: "none" },
      },
    },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          border: "1px solid rgba(232,237,246,0.08)",
          borderRadius: 14,
        },
      },
    },
  },
});

/** Monospace numeral helper for figures throughout the dashboard. */
export const monoFont = mono;
