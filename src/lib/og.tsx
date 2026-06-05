import { ImageResponse } from "next/og";

/**
 * Shared social-share banner (1200×630) for the OpenGraph + Twitter image
 * routes. Rendered at the edge/build by Satori, so everything is flexbox + inline
 * styles (no external CSS, no custom font fetch — uses the bundled default font).
 *
 * Visual language matches the in-app control-room: ink canvas, a signal-orange
 * corner glow, the stacked-bays brand mark, and a single hi-vis accent.
 */

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = "image/png";
export const OG_ALT =
  "FSE Warehouse — multi-tenant warehouse management platform";

const INK = "#0b0f1a";
const SIGNAL = "#ff6a1a";

function Bay({ color }: { color: string }) {
  return (
    <div
      style={{ display: "flex", width: 20, height: 20, borderRadius: 4, background: color }}
    />
  );
}

export function renderBanner() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: INK,
          color: "#e8edf6",
          padding: 64,
          fontFamily: "sans-serif",
          position: "relative",
        }}
      >
        {/* signal-orange corner glow */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            background:
              "radial-gradient(620px 440px at 100% 0%, rgba(255,106,26,0.20), transparent 60%)",
          }}
        />

        {/* brand lockup */}
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignContent: "center",
              gap: 5,
              width: 66,
              height: 66,
              padding: 9,
              borderRadius: 15,
              background: "linear-gradient(135deg, #1b2540, #0b0f1a)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <Bay color={SIGNAL} />
            <Bay color="#94a3b8" />
            <Bay color="#475569" />
            <Bay color="#475569" />
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 30, fontWeight: 700, color: "#ffffff" }}>
              FSE Warehouse
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 15,
                fontWeight: 600,
                letterSpacing: 6,
                color: SIGNAL,
              }}
            >
              OPERATIONS
            </div>
          </div>
        </div>

        {/* headline */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div
            style={{
              display: "flex",
              fontSize: 68,
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: -1.5,
              color: "#ffffff",
              maxWidth: 940,
            }}
          >
            Multi-tenant warehouse management
          </div>
          <div style={{ display: "flex", fontSize: 27, color: "rgba(232,237,246,0.72)" }}>
            Transactional ops · BigQuery analytics · permission-based RBAC
          </div>
        </div>

        {/* footer rule */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ display: "flex", width: 48, height: 4, borderRadius: 2, background: SIGNAL }} />
          <div style={{ display: "flex", fontSize: 20, color: "rgba(232,237,246,0.55)" }}>
            warehouse · operations platform
          </div>
        </div>
      </div>
    ),
    { ...OG_SIZE },
  );
}
