/**
 * Full-bleed colourful orbs (system B) behind the whole page. Fixed so they sit
 * under every section; gentle GPU-only drift (transform/opacity via the .orb
 * keyframes in index.css). prefers-reduced-motion stops the drift (CSS).
 * A faint background wash keeps text contrast over the orbs.
 *
 * `subtle` dials the orbs back (lower opacity + stronger wash) for in-app pages,
 * where they're atmosphere behind real content — not the landing's showpiece.
 */
export function OrbsBackground({ subtle = false }: { subtle?: boolean }) {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-background">
      <div className={`absolute inset-0 ${subtle ? "opacity-45" : ""}`}>
        <div className="orb absolute -left-10 top-[4%] size-80 bg-accent/35" style={{ animationDelay: "0s" }} />
        <div className="orb absolute right-[2%] top-[18%] size-96 bg-signal/30" style={{ animationDelay: "-5s" }} />
        <div className="orb absolute left-[34%] top-[44%] size-80 bg-cold/35" style={{ animationDelay: "-9s" }} />
        <div className="orb absolute -right-10 top-[60%] size-96 bg-accent/25" style={{ animationDelay: "-3s" }} />
        <div className="orb absolute left-[8%] top-[82%] size-80 bg-cold/30" style={{ animationDelay: "-7s" }} />
      </div>
      {/* readability wash */}
      <div className={`absolute inset-0 ${subtle ? "bg-background/60" : "bg-background/35"}`} />
    </div>
  )
}
