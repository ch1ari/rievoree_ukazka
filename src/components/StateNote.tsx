/**
 * Shared loading / empty / error states for data pages — mono, in-theme, never
 * a blank white page or a crash. Used by Dashboard and Reports.
 */
export function LoadingNote({ label = "loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-12 font-mono text-xs uppercase tracking-widest text-muted-foreground">
      <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-accent" />
      {label}
    </div>
  )
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <div className="border border-destructive/50 bg-destructive/5 px-4 py-3 font-mono text-xs text-destructive">
      <p className="mb-1 uppercase tracking-widest">Query failed</p>
      <p className="break-words text-destructive/80">{message}</p>
    </div>
  )
}

export function EmptyNote({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="border border-dashed border-border px-4 py-12 text-center font-mono text-xs text-muted-foreground">
      <p className="uppercase tracking-widest text-foreground">{title}</p>
      {hint && <p className="mt-2 leading-relaxed">{hint}</p>}
    </div>
  )
}
