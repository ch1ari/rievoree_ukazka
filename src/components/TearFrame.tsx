import type { ReactNode } from "react"

/**
 * A reusable "torn hole in the lime paper" that reveals dark content beneath —
 * the same metaphor as the hero PageTear, but a self-contained box you can wrap
 * around anything (a product screenshot, a dark console panel). The ragged edge
 * comes from an feTurbulence + feDisplacementMap filter (#rip-torn-sm) applied to
 * the parent of the clipped layers, so a clean rounded clip is torn into fibre.
 *
 * Layers: a lighter-lime RIM (paper thickness, clipped slightly larger) behind a
 * dark HOLE (clipped smaller) that holds the content. A contour drop-shadow lifts
 * the sheet off the page. Render <TearDefs/> ONCE per page so the filter exists.
 */

export function TearDefs() {
  return (
    <svg className="rip-filter-def" width="0" height="0" aria-hidden="true" focusable="false">
      <filter id="rip-torn-sm" x="-20%" y="-20%" width="140%" height="140%">
        <feTurbulence type="fractalNoise" baseFrequency="0.019 0.03" numOctaves="5" seed="7" result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale="20" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  )
}

/**
 * Two modes:
 *  • default ("clip") — children are clipped INTO the ragged hole (for images:
 *    the screenshot shows through the rip). Needs a height on `className`.
 *  • panel — a ragged dark hole sits BEHIND crisp, normal-flow children (for
 *    text content: letters never get torn). Height comes from the content.
 */
export function TearFrame({
  children, className, panel = false,
}: { children: ReactNode; className?: string; panel?: boolean }) {
  if (panel) {
    return (
      <div className={`tear-frame tear-frame--panel ${className ?? ""}`}>
        <div className="tear-paper" aria-hidden="true">
          <div className="tear-rim" />
          <div className="tear-holebg" />
        </div>
        <div className="tear-content dark text-foreground">{children}</div>
      </div>
    )
  }
  // Clip mode: a ragged dark hole sits behind a CRISP image (the image is not
  // filtered, so it stays sharp; the torn dark rim peeks around it).
  return (
    <div className={`tear-frame ${className ?? ""}`}>
      <div className="tear-paper" aria-hidden="true">
        <div className="tear-rim" />
        <div className="tear-holebg" />
      </div>
      <div className="tear-img">{children}</div>
    </div>
  )
}
