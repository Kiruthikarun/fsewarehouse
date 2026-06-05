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
    mode: "light",
    primary: { main: SIGNAL, contrastText: "#0b0f1a" },
    background: { default: "#f4f5f7", paper: "#ffffff" },
    text: { primary: "#0b0f1a", secondary: "#5b6472" },
    divider: "rgba(11,15,26,0.10)",
    success: { main: "#1f9d55" },
    warning: { main: "#c77700" },
    error: { main: "#d33a2c" },
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
          border: "1px solid rgba(11,15,26,0.08)",
          borderRadius: 14,
        },
      },
    },
  },
});

/** Monospace numeral helper for figures throughout the dashboard. */
export const monoFont = mono;
