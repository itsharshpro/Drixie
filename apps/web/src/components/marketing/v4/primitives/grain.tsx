const TILE =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter><rect width="180" height="180" filter="url(#n)"/></svg>`,
  );

export function Grain({ opacity = 0.07, className }: { opacity?: number; className?: string }) {
  return (
    <div
      data-art
      aria-hidden
      className={["pointer-events-none absolute inset-0", className].filter(Boolean).join(" ")}
      style={{ backgroundImage: `url("${TILE}")`, backgroundSize: "180px 180px", opacity, mixBlendMode: "multiply" }}
    />
  );
}
