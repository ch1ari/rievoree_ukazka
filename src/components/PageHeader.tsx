import { Badge } from "@/components/ui/badge"

/**
 * Editorial page header: oversized title, generous whitespace, one accent.
 * Every page starts with this until its real content lands in later phases.
 */
export function PageHeader(props: {
  title: string
  description: string
  phase?: string
}) {
  return (
    <header className="border-b border-border pb-10">
      {props.phase && (
        <Badge className="mb-6 bg-accent text-accent-foreground font-mono text-xs uppercase tracking-widest">
          {props.phase}
        </Badge>
      )}
      <h1 className="text-6xl font-bold tracking-tighter md:text-7xl">
        {props.title}
      </h1>
      <p className="mt-6 max-w-xl text-lg text-muted-foreground">
        {props.description}
      </p>
    </header>
  )
}
