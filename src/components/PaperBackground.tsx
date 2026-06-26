/**
 * PAPER BACKGROUND — the whole landing as one sheet of vivid lime matte paper.
 * A fixed full-bleed #A3E635 field with a two-pass SVG feTurbulence grain: a fine
 * darkening TOOTH (multiply) + an anisotropic lightening FIBRE (soft-light). Pure
 * CSS/SVG — no raster image. It is entirely STATIC, so it costs nothing per frame
 * and needs no prefers-reduced-motion handling.
 */
export function PaperBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 bg-[#A3E635]">
      <svg className="absolute size-0" aria-hidden focusable="false">
        <filter id="paper-tooth" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch" seed="11" result="n" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.6 0.6 0.6 0 0" />
        </filter>
        <filter id="paper-fiber" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.28 0.12" numOctaves="2" stitchTiles="stitch" seed="29" result="f" />
          <feColorMatrix in="f" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0.5 0.5 0.5 0 0" />
        </filter>
      </svg>
      {/* Fine tooth — darkens the lime in micro-pits. */}
      <div className="absolute inset-0" style={{ filter: "url(#paper-tooth)", mixBlendMode: "multiply", opacity: 0.13 }} />
      {/* Anisotropic fibre — gentle directional lift; the "it's paper, not noise" cue. */}
      <div className="absolute inset-0" style={{ filter: "url(#paper-fiber)", mixBlendMode: "soft-light", opacity: 0.18 }} />
    </div>
  )
}
