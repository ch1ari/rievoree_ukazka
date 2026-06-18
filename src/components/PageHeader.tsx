import { motion } from "motion/react"

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
    <motion.header
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: "easeOut" }}
      className="pb-10"
    >
      {props.phase && (
        <span className="mb-5 inline-block rounded-full bg-accent/12 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-accent ring-1 ring-accent/20">
          {props.phase}
        </span>
      )}
      <h1 className="text-5xl font-semibold tracking-tight md:text-6xl lg:text-7xl">
        {props.title}
      </h1>
      <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
        {props.description}
      </p>
    </motion.header>
  )
}
