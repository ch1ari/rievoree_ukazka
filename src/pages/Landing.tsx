import { Link } from "@tanstack/react-router"
import { motion } from "motion/react"
import { Button } from "@/components/ui/button"

export function Landing() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-24">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        <p className="font-mono text-sm uppercase tracking-[0.3em] text-accent">
          Financial reporting engine
        </p>
        <h1 className="mt-6 text-7xl font-bold leading-[0.95] tracking-tighter md:text-8xl">
          See the
          <br />
          machinery.
        </h1>
        <p className="mt-8 max-w-xl text-xl text-muted-foreground">
          CSV in, reports out — and an X-ray panel on every page showing the
          ETL pipeline, RLS policies and security layers doing the work, live.
        </p>
        <div className="mt-12 flex gap-4">
          <Button asChild size="lg" className="text-base">
            <Link to="/dashboard">Open dashboard</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="text-base">
            <Link to="/reports">View reports</Link>
          </Button>
        </div>
      </motion.div>
    </div>
  )
}
