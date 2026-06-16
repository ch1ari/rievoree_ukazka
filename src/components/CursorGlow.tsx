import { useEffect } from "react"
import { motion, useMotionTemplate, useMotionValue, useSpring } from "motion/react"

/**
 * Cursor-reactive aurora background. A coral glow follows the pointer (spring-
 * smoothed) over softer teal/amber pools. Performant: the pointer updates motion
 * values that drive `background` directly — no React re-render per move.
 *
 * intensity:
 *   "rich"   — marketing surfaces (Landing, Login): vivid, cursor-following.
 *   "subtle" — data surfaces (Dashboard/Reports/X-ray): faint + static, so it
 *              never competes with tables or live data for attention.
 */
export function CursorGlow({ intensity = "rich" }: { intensity?: "rich" | "subtle" }) {
  const mx = useMotionValue(50)
  const my = useMotionValue(28)
  const sx = useSpring(mx, { stiffness: 50, damping: 20 })
  const sy = useSpring(my, { stiffness: 50, damping: 20 })

  const reactive = intensity === "rich"

  useEffect(() => {
    if (!reactive) return
    const onMove = (e: PointerEvent) => {
      mx.set((e.clientX / window.innerWidth) * 100)
      my.set((e.clientY / window.innerHeight) * 100)
    }
    window.addEventListener("pointermove", onMove, { passive: true })
    return () => window.removeEventListener("pointermove", onMove)
  }, [mx, my, reactive])

  const a = reactive ? 0.42 : 0.14 // coral (cursor)
  const b = reactive ? 0.30 : 0.12 // teal
  const c = reactive ? 0.22 : 0.08 // amber

  const background = useMotionTemplate`
    radial-gradient(38rem 38rem at ${sx}% ${sy}%, oklch(0.70 0.19 35 / ${a}), transparent 60%),
    radial-gradient(42rem 42rem at 12% 88%, oklch(0.72 0.12 185 / ${b}), transparent 65%),
    radial-gradient(34rem 34rem at 88% 8%, oklch(0.85 0.15 80 / ${c}), transparent 60%)`

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10"
      style={{ background }}
    />
  )
}
