import { renderBanner, OG_SIZE, OG_CONTENT_TYPE, OG_ALT } from "@/lib/og";

// Next.js serves this as the site's og:image (absolute URL resolved from the
// root layout's metadataBase), so a shared link renders a branded card.
export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderBanner();
}
