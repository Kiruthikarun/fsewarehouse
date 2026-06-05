import type { SvgIconComponent } from "@mui/icons-material";
import WarehouseRoundedIcon from "@mui/icons-material/WarehouseRounded";
import Inventory2RoundedIcon from "@mui/icons-material/Inventory2Rounded";
import SwapHorizRoundedIcon from "@mui/icons-material/SwapHorizRounded";
import InsightsRoundedIcon from "@mui/icons-material/InsightsRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
import ShieldRoundedIcon from "@mui/icons-material/ShieldRounded";
import type { RoleKey } from "./types";

/**
 * The "signal channel" each role is rendered as throughout the Settings console.
 *
 * The app's identity is a SINGLE hi-vis signal-orange accent over an ink/slate
 * base — not a multi-hue palette. So roles are a monochrome privilege ramp:
 * orange is reserved for the apex role (Admin), and the lower-privilege roles
 * step down the neutral slate scale. Privilege reads as intensity, on-theme.
 *
 * On the dark control-room surface, brightness IS privilege: the ramp descends
 * from hi-vis orange through a bright slate to a dim floor — the opposite
 * direction a light theme would use, so every channel stays legible on ink.
 */
export interface Channel {
  accent: string;
  /** 3-letter channel code shown in the segmented selector / lane tags. */
  code: string;
}

const FALLBACK: Channel = { accent: "#94a3b8", code: "—" };

const CHANNELS: Record<string, Channel> = {
  ADMIN: { accent: "#ff6a1a", code: "ADM" }, // signal orange — apex privilege
  WAREHOUSE_MANAGER: { accent: "#94a3b8", code: "MGR" }, // slate 400
  OPERATOR: { accent: "#64748b", code: "OPR" }, // slate 500 — floor role
};

export function channelOf(role: RoleKey): Channel {
  return CHANNELS[role] ?? FALLBACK;
}

/** Readable text colour (ink or white) for a filled channel swatch. */
export function textOn(accent: string): string {
  const h = accent.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "#0b0f1a" : "#ffffff";
}

/** Section icon for the access matrix, keyed by PERMISSION_GROUPS[].page. */
export const SECTION_ICON: Record<string, SvgIconComponent> = {
  warehouses: WarehouseRoundedIcon,
  inventory: Inventory2RoundedIcon,
  movements: SwapHorizRoundedIcon,
  analytics: InsightsRoundedIcon,
  settings: SettingsRoundedIcon,
};

export const FallbackSectionIcon = ShieldRoundedIcon;

/** Hex (#rrggbb) → rgba string at the given alpha. */
export function rgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
