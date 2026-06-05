import { PageHeader } from "@/components/PageHeader"

export function Users() {
  return (
    <PageHeader
      title="User Management"
      description="Admin-only: create users, assign roles and entities, reset passwords and MFA. Guarded by route checks, RLS and frozen-column triggers. Phase 5."
      phase="Phase 5"
    />
  )
}
