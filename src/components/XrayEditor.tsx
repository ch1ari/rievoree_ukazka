import { useEffect, useState } from "react"

import { extractRegions, highlightCode, type XrayLang } from "@/lib/code-xray"

/**
 * X-RAY EDITOR — the landing's own source, shown as a real VS Code (Dark+) editor.
 *
 * Scope: LANDING code only — the page, its components and its styles. The backend
 * (SQL, worker) lives in the live X-ray panel inside the app, not here. "X-ray
 * THIS page" means the code of this page, nothing else.
 *
 * Honesty: every tab is the LITERAL repo file via Vite `?raw` (build-time synced).
 * extractRegions() then trims it to the marked, comment-free, focused parts so it
 * reads like clean production code rather than a raw dump. Highlighted with Shiki
 * using the genuine VS Code Dark+ grammar + theme, lazy-loaded.
 */
import landingSrc from "@/pages/Landing.tsx?raw"
import tearSrc from "@/components/PageTear.tsx?raw"
import scanSrc from "@/components/XrayScan.tsx?raw"
import cssSrc from "@/index.css?raw"

interface FileTab { dir: string; name: string; lang: XrayLang; code: string }

const FILES: FileTab[] = [
  { dir: "src/pages", name: "Landing.tsx", lang: "tsx", code: extractRegions(landingSrc) },
  { dir: "src/components", name: "PageTear.tsx", lang: "tsx", code: extractRegions(tearSrc) },
  { dir: "src/components", name: "XrayScan.tsx", lang: "tsx", code: extractRegions(scanSrc) },
  { dir: "src", name: "index.css", lang: "css", code: extractRegions(cssSrc) },
]

const LANG_LABEL: Record<XrayLang, string> = {
  tsx: "TypeScript JSX", typescript: "TypeScript", css: "CSS", sql: "SQL",
}

export default function XrayEditor() {
  const [active, setActive] = useState(0)
  const [html, setHtml] = useState<Record<number, string>>({})
  const file = FILES[active]

  // Highlight the active file once, then cache by index.
  useEffect(() => {
    if (html[active] != null) return
    let cancelled = false
    highlightCode(FILES[active].code, FILES[active].lang)
      .then((out) => { if (!cancelled) setHtml((h) => ({ ...h, [active]: out })) })
      .catch(() => { /* fallback <pre> stays */ })
    return () => { cancelled = true }
  }, [active, html])

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[#1e1e1e] font-mono text-[#d4d4d4]">
      {/* Title bar */}
      <div className="flex h-9 shrink-0 items-center bg-[#323233] px-3 text-[12px] text-white/55">
        <div className="flex gap-2">
          <span className="size-3 rounded-full bg-white/20" />
          <span className="size-3 rounded-full bg-white/20" />
          <span className="size-3 rounded-full bg-white/20" />
        </div>
        <span className="mx-auto truncate">
          {file.dir}/{file.name} — xray-reporting-engine
        </span>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Explorer sidebar — desktop only */}
        <aside className="hidden w-60 shrink-0 flex-col overflow-y-auto bg-[#252526] py-2 text-[12px] text-white/60 md:flex">
          <div className="px-4 pb-2 pt-1 text-[10px] uppercase tracking-widest text-white/35">Explorer</div>
          <div className="px-2 pb-1 text-[11px] font-semibold text-white/45">xray-reporting-engine · landing</div>
          {FILES.map((f, i) => (
            <button
              key={f.dir + f.name}
              onClick={() => setActive(i)}
              className={`flex items-center gap-2 truncate px-4 py-1 text-left transition-colors hover:bg-white/5 ${
                i === active ? "bg-[#37373d] text-white" : ""
              }`}
              title={`${f.dir}/${f.name}`}
            >
              <span className={`size-1.5 shrink-0 rounded-full ${dotColor(f.lang)}`} />
              <span className="truncate">{f.name}</span>
            </button>
          ))}
        </aside>

        {/* Editor column */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Tab strip */}
          <div className="flex shrink-0 overflow-x-auto bg-[#252526] text-[12px]">
            {FILES.map((f, i) => (
              <button
                key={f.dir + f.name}
                onClick={() => setActive(i)}
                className={`flex items-center gap-2 whitespace-nowrap border-r border-black/30 px-4 py-2 transition-colors ${
                  i === active ? "bg-[#1e1e1e] text-white" : "text-white/50 hover:bg-white/5"
                }`}
              >
                <span className={`size-1.5 rounded-full ${dotColor(f.lang)}`} />
                {f.name}
              </button>
            ))}
          </div>

          {/* Breadcrumb */}
          <div className="shrink-0 border-b border-black/40 bg-[#1e1e1e] px-4 py-1 text-[11px] text-white/35">
            {file.dir.split("/").join("  ›  ")}  ›  {file.name}
          </div>

          {/* Code */}
          <div className="code-shiki min-h-0 flex-1 overflow-auto">
            {/* Safe: __html is Shiki's escaped output of our OWN build-time source
                files (?raw), never user input — no untrusted content. */}
            {html[active] != null ? (
              <div dangerouslySetInnerHTML={{ __html: html[active] }} />
            ) : (
              <pre className="px-4 py-4 text-[12.5px] leading-[1.65] text-white/70">{file.code}</pre>
            )}
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div className="flex h-6 shrink-0 items-center gap-4 bg-accent px-3 text-[11px] font-medium text-accent-foreground">
        <span>⎇ main</span>
        <span className="ml-auto">{LANG_LABEL[file.lang]}</span>
        <span>UTF-8</span>
        <span className="hidden sm:inline">REAL SOURCE · ?raw @ build</span>
      </div>
    </div>
  )
}

function dotColor(lang: XrayLang) {
  if (lang === "css") return "bg-cold"
  return "bg-accent"
}
