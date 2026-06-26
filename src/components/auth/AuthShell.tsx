import type { ReactNode } from "react"
import { Link } from "@tanstack/react-router"
import { motion } from "motion/react"

/**
 * Lime "paper" wrapper for the auth pages. AppShell already supplies the `.paper`
 * scope + PaperBackground + header for /login and /register, so this just lays out
 * a centred hairline card with the marketing voice.
 */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="mx-auto flex min-h-[78vh] max-w-md flex-col justify-center px-6 py-16">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: "easeOut" }}>
        <h1 className="poster text-[clamp(1.9rem,6vw,3.1rem)] leading-[0.9] text-foreground">{title}</h1>
        {subtitle && <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{subtitle}</p>}
        <div className="mt-7 rounded-[1.5rem] border border-border p-6 md:p-8">{children}</div>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Or <Link to="/" className="font-semibold text-foreground underline-offset-4 hover:underline">explore the demo</Link> — no account needed.
        </p>
      </motion.div>
    </section>
  )
}
