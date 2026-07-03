/**
 * A real product screenshot, framed for the "What it does" showcase. Replaces the
 * old code-built MiniPanels — these are captured from the live app (Ingest batches,
 * the RLS-scoped Reports charts, the X-ray call stream) so the section shows the
 * actual product with real data. Framed in a soft dark-green console shell so the
 * near-black screenshots pop against the lime page and stay on-brand.
 */
export function PanelShot({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-accent/20 bg-[oklch(0.15_0.02_158)] shadow-[0_24px_60px_-24px_oklch(0.15_0.05_158)]">
      <img src={src} alt={alt} loading="lazy" className="block w-full" />
    </div>
  )
}
