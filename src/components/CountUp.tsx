import { useEffect, useRef } from "react"
import { animate } from "motion/react"

/**
 * Count-up for the big editorial hero numbers. GPU-friendly: motion animates a
 * scalar and writes straight to the node's textContent — no per-frame React
 * re-render. prefers-reduced-motion → the final value, no animation.
 */
export function CountUp({
  value,
  format = (n) => Math.round(n).toLocaleString("en"),
  duration = 1.6,
  delay = 0,
  className,
}: {
  value: number
  format?: (n: number) => string
  duration?: number
  delay?: number
  className?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (reduce) {
      el.textContent = format(value)
      return
    }
    el.textContent = format(0)
    const controls = animate(0, value, {
      duration,
      delay,
      ease: [0.22, 0.61, 0.18, 1],
      onUpdate: (v) => { el.textContent = format(v) },
    })
    return () => controls.stop()
  }, [value, duration, delay, format])

  // SSR/fallback render shows the final value (also the no-JS state).
  return <span ref={ref} className={className}>{format(value)}</span>
}
