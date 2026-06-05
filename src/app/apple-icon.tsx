import { ImageResponse } from "next/og";

// Apple touch icon (PNG required by iOS — SVG isn't honoured), generated from
// the same stacked-bays mark as icon.svg so the home-screen icon stays on-brand.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

function Bay({ color }: { color: string }) {
  return (
    <div style={{ display: "flex", width: 52, height: 52, borderRadius: 9, background: color }} />
  );
}

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexWrap: "wrap",
          alignContent: "center",
          justifyContent: "center",
          gap: 12,
          padding: 28,
          background: "linear-gradient(135deg, #1b2540, #0b0f1a)",
        }}
      >
        <Bay color="#ff6a1a" />
        <Bay color="#94a3b8" />
        <Bay color="#475569" />
        <Bay color="#475569" />
      </div>
    ),
    { ...size },
  );
}
