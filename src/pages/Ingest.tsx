import { PageHeader } from "@/components/PageHeader"

export function Ingest() {
  return (
    <PageHeader
      title="Upload / Ingest"
      description="CSV/XLSX upload feeding the ETL pipeline: validate, transform, z-score anomaly check, then staged for review. Phase 2."
      phase="Phase 2"
    />
  )
}
