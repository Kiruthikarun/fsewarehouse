import { renderBanner, OG_SIZE, OG_CONTENT_TYPE, OG_ALT } from "@/lib/og";

// Same banner as opengraph-image, served as twitter:image so X/Twitter renders
// a large summary card rather than falling back to a bare link.
export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderBanner();
}
