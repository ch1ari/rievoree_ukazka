import { useMemo, useState } from "react"
import { motion } from "motion/react"
import {
  ShieldCheck, ShieldAlert, UserPlus, Mail, KeyRound,
  Smartphone, Check, X, Copy, Trash2, Power,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { SimpleSelect } from "@/components/ui/select"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { LoadingNote, ErrorNote, EmptyNote } from "@/components/StateNote"
import { useAuth } from "@/lib/auth/useAuth"
import { useEntities } from "@/lib/data/useEntities"
import { useMyEntities } from "@/lib/data/useMyEntities"
import {
  useOrgMembers, useIsPlatformAdmin, useAddMember, useRemoveMember,
  useSetMemberRole, useSetUserActive, useCreateUser, useResetPassword, useResetMfa,
  type OrgMember, type AppRole,
} from "@/lib/data/useUsers"

const ROLE_OPTIONS: { value: AppRole; label: string }[] = [
  { value: "viewer", label: "Viewer" },
  { value: "manager", label: "Manager" },
  { value: "admin", label: "Admin" },
  { value: "super_admin", label: "Super admin" },
]

function isAdminRole(role: string | null) {
  return role === "admin" || role === "super_admin"
}

export function Users() {
  const { role } = useAuth()
  const members = useOrgMembers()
  const platform = useIsPlatformAdmin()
  const isPlatform = platform.data === true

  if (!isAdminRole(role)) {
    return (
      <div className="relative">
        <PageHead />
        <div className="rounded-2xl bg-card px-6 py-6 font-mono text-xs leading-relaxed text-muted-foreground shadow-soft ring-1 ring-border">
          User management is admin-only. Your role ({role ?? "—"}) can't reach it —
          the server enforces this too (the list RPC refuses non-admins).
        </div>
      </div>
    )
  }

  return (
    <div className="relative">
      <PageHead />

      <div className={cn(
        "mb-6 flex items-center gap-2 rounded-2xl px-5 py-3 text-sm ring-1",
        isPlatform ? "bg-accent/[0.07] text-foreground ring-accent/20" : "bg-secondary text-muted-foreground ring-border",
      )}>
        {isPlatform ? <ShieldCheck className="size-4 text-accent" /> : <ShieldAlert className="size-4" />}
        {isPlatform
          ? "Platform admin — full control: create users, assign roles, reset passwords & MFA."
          : "Scoped admin — you manage membership of the entities you own. Credential resets are platform-only."}
      </div>

      {isPlatform ? <CreateUserPanel /> : <InviteMemberPanel />}

      <section className="mt-12">
        <h2 className="mb-4 font-mono text-xs uppercase tracking-widest text-muted-foreground">
          {isPlatform ? "All users" : "Members of your entities"}
        </h2>
        {members.isLoading ? (
          <LoadingNote label="loading users…" />
        ) : members.error ? (
          <ErrorNote message={members.error.message} />
        ) : (members.data?.length ?? 0) === 0 ? (
          <EmptyNote title="No users to show" hint="Invite a teammate above." />
        ) : (
          <div className="overflow-hidden rounded-[1.5rem] bg-card shadow-soft ring-1 ring-border">
            <Table className="min-w-[760px]">
              <TableHeader className="bg-secondary/50">
                <TableRow>
                  <TableHead className="font-mono text-[10px] uppercase tracking-wider">User</TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-wider">Role</TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-wider">Entities</TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-wider">MFA</TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-wider">Status</TableHead>
                  <TableHead className="text-right font-mono text-[10px] uppercase tracking-wider">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.data!.map((m) => (
                  <MemberRow key={m.id} member={m} isPlatform={isPlatform} />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  )
}

function PageHead() {
  return (
    <motion.header
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: "easeOut" }}
      className="pb-10">
      <span className="font-mono text-xs font-semibold uppercase tracking-widest text-accent">Admin</span>
      <h1 className="mt-3 text-5xl font-semibold tracking-tight md:text-6xl lg:text-7xl">User management</h1>
      <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
        Create users, assign roles and entity access, reset passwords and MFA.
        Every privileged change runs through an audited RPC behind the frozen-column
        guard — the server never trusts a client-writable role.
      </p>
    </motion.header>
  )
}

const inputClass =
  "rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-accent/50"

/** Platform-admin: create a brand-new user (Auth admin API via edge function). */
function CreateUserPanel() {
  const create = useCreateUser()
  const { data: entities } = useEntities()
  const [email, setEmail] = useState("")
  const [fullName, setFullName] = useState("")
  const [role, setRole] = useState<AppRole>("viewer")
  const [entityId, setEntityId] = useState("")
  const [result, setResult] = useState<{ email: string; temp?: string } | null>(null)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    create.mutate(
      { email: email.trim(), fullName: fullName.trim() || undefined, role, entityId: entityId || undefined },
      {
        onSuccess: (r) => {
          setResult({ email: r.email, temp: r.temp_password })
          setEmail(""); setFullName("")
        },
      },
    )
  }

  return (
    <section className="rounded-[1.5rem] bg-card p-6 shadow-soft ring-1 ring-border md:p-7">
      <div className="flex items-center gap-2">
        <UserPlus className="size-4 text-accent" />
        <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Create user</h2>
      </div>
      <form onSubmit={submit} className="mt-5 grid gap-4 md:grid-cols-5 md:items-end">
        <div className="space-y-1.5 md:col-span-2">
          <Label className="font-mono text-[10px] uppercase tracking-widest">Email</Label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="person@example.com" className={cn(inputClass, "w-full")} />
        </div>
        <div className="space-y-1.5">
          <Label className="font-mono text-[10px] uppercase tracking-widest">Full name</Label>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="optional" className={cn(inputClass, "w-full")} />
        </div>
        <div className="space-y-1.5">
          <Label className="font-mono text-[10px] uppercase tracking-widest">Role</Label>
          <SimpleSelect size="default" className="w-full" aria-label="Role"
            value={role} onValueChange={(v) => setRole(v as AppRole)} options={ROLE_OPTIONS} />
        </div>
        <Button type="submit" className="font-mono" disabled={create.isPending || !email.trim()}>
          <UserPlus className="size-4" /> {create.isPending ? "Creating…" : "Create"}
        </Button>
        <div className="space-y-1.5 md:col-span-2">
          <Label className="font-mono text-[10px] uppercase tracking-widest">Add to entity (optional)</Label>
          <SimpleSelect size="default" className="w-full" aria-label="Entity" placeholder="none"
            value={entityId} onValueChange={setEntityId}
            options={(entities ?? []).map((e) => ({ value: e.id, label: e.name }))} />
        </div>
      </form>

      {create.isError && <p role="alert" className="mt-3 font-mono text-xs text-destructive">{(create.error as Error).message}</p>}
      {result && (
        <div className="mt-4 rounded-xl border border-accent/30 bg-accent/[0.06] p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-accent">User created · {result.email}</p>
          {result.temp ? (
            <>
              <p className="mt-2 text-sm text-muted-foreground">Temporary password (shown once — hand it over securely):</p>
              <CopyRow label="Password" value={result.temp} />
            </>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">The user can sign in with the password you set.</p>
          )}
          <Button size="xs" variant="ghost" className="mt-2 font-mono text-[10px]" onClick={() => setResult(null)}>Done</Button>
        </div>
      )}
    </section>
  )
}

/** Scoped admin: invite an existing user (by email) into an entity you own. */
function InviteMemberPanel() {
  const add = useAddMember()
  const { data: owned } = useMyEntities()
  const [entityId, setEntityId] = useState("")
  const [email, setEmail] = useState("")

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!entityId || !email.trim()) return
    add.mutate({ entityId, email: email.trim() }, { onSuccess: () => setEmail("") })
  }

  return (
    <section className="rounded-[1.5rem] bg-card p-6 shadow-soft ring-1 ring-border md:p-7">
      <div className="flex items-center gap-2">
        <Mail className="size-4 text-accent" />
        <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Invite a member</h2>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Add an existing user (they must have registered) to one of your entities. They keep their own role.
      </p>
      <form onSubmit={submit} className="mt-5 grid gap-4 md:grid-cols-3 md:items-end">
        <div className="space-y-1.5">
          <Label className="font-mono text-[10px] uppercase tracking-widest">Your entity</Label>
          <SimpleSelect size="default" className="w-full" aria-label="Entity" placeholder="select…"
            value={entityId} onValueChange={setEntityId}
            options={(owned ?? []).map((e) => ({ value: e.id, label: e.name }))} />
        </div>
        <div className="space-y-1.5">
          <Label className="font-mono text-[10px] uppercase tracking-widest">Email</Label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@example.com" className={cn(inputClass, "w-full")} />
        </div>
        <Button type="submit" className="font-mono" disabled={add.isPending || !entityId || !email.trim()}>
          <UserPlus className="size-4" /> {add.isPending ? "Adding…" : "Add member"}
        </Button>
      </form>
      {add.isError && <p role="alert" className="mt-3 font-mono text-xs text-destructive">{(add.error as Error).message}</p>}
      {add.isSuccess && <p className="mt-3 font-mono text-xs text-accent">Member added.</p>}
    </section>
  )
}

function MemberRow({ member: m, isPlatform }: { member: OrgMember; isPlatform: boolean }) {
  const setRole = useSetMemberRole()
  const setActive = useSetUserActive()
  const resetPw = useResetPassword()
  const resetMfa = useResetMfa()
  const removeMember = useRemoveMember()
  const myEntities = useMyEntities()
  const ownedIds = useMemo(() => new Set((myEntities.data ?? []).map((e) => e.id)), [myEntities.data])

  const [pwLink, setPwLink] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)

  // For a scoped admin, the entities they may remove this user from (owned ∩ user's).
  const removableEntities = m.entities.filter((e) => ownedIds.has(e.id))

  return (
    <>
      <TableRow className={cn(!m.is_active && "opacity-50")}>
        <TableCell>
          <div className="font-medium">{m.full_name ?? m.email.split("@")[0]}</div>
          <div className="font-mono text-[11px] text-muted-foreground">{m.email}{m.is_self && " · you"}</div>
        </TableCell>
        <TableCell>
          {isPlatform && !m.is_self ? (
            <SimpleSelect size="sm" className="w-32" aria-label={`Role for ${m.email}`}
              value={m.role} onValueChange={(v) => setRole.mutate({ userId: m.id, role: v as AppRole })}
              options={ROLE_OPTIONS} />
          ) : (
            <Badge className="rounded-full font-mono text-[10px] uppercase tracking-wider">{m.role}</Badge>
          )}
        </TableCell>
        <TableCell className="font-mono text-[11px] text-muted-foreground">
          {m.entities.length ? m.entities.map((e) => e.name).join(", ") : "—"}
        </TableCell>
        <TableCell>
          {m.mfa_verified
            ? <Badge className="rounded-full bg-signal font-mono text-[10px] uppercase tracking-wider text-signal-foreground">On</Badge>
            : <span className="font-mono text-[11px] text-muted-foreground">off</span>}
        </TableCell>
        <TableCell>
          <span className={cn("font-mono text-[11px]", m.is_active ? "text-accent" : "text-destructive")}>
            {m.is_active ? "active" : "disabled"}
          </span>
        </TableCell>
        <TableCell className="text-right">
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {isPlatform && !m.is_self && (
              <>
                <Button size="xs" variant="ghost" className="font-mono text-[10px]" disabled={resetPw.isPending}
                  onClick={() => resetPw.mutate(m.id, { onSuccess: (link) => setPwLink(link ?? "sent") })}>
                  <KeyRound className="size-3.5" /> Password
                </Button>
                <Button size="xs" variant="ghost" className="font-mono text-[10px]" disabled={resetMfa.isPending || !m.mfa_verified}
                  onClick={() => resetMfa.mutate(m.id)}>
                  <Smartphone className="size-3.5" /> MFA
                </Button>
                <Button size="xs" variant="ghost" className={cn("font-mono text-[10px]", m.is_active && "text-destructive")}
                  disabled={setActive.isPending}
                  onClick={() => setActive.mutate({ userId: m.id, active: !m.is_active })}>
                  <Power className="size-3.5" /> {m.is_active ? "Disable" : "Enable"}
                </Button>
              </>
            )}
            {!isPlatform && !m.is_self && removableEntities.length > 0 && (
              confirmRemove ? (
                <span className="flex items-center gap-1">
                  <SimpleSelect size="sm" className="w-28" aria-label="Remove from entity"
                    value={confirmRemove} onValueChange={setConfirmRemove}
                    options={removableEntities.map((e) => ({ value: e.id, label: e.name }))} />
                  <button onClick={() => { removeMember.mutate({ entityId: confirmRemove, userId: m.id }); setConfirmRemove(null) }}
                    className="rounded-md bg-destructive/15 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-destructive">Remove</button>
                  <button onClick={() => setConfirmRemove(null)} className="rounded-md p-1 text-muted-foreground hover:bg-foreground/[0.05]"><X className="size-3.5" /></button>
                </span>
              ) : (
                <Button size="xs" variant="ghost" className="font-mono text-[10px] text-destructive"
                  onClick={() => setConfirmRemove(removableEntities[0].id)}>
                  <Trash2 className="size-3.5" /> Remove
                </Button>
              )
            )}
          </div>
        </TableCell>
      </TableRow>

      {(pwLink || resetPw.isError || resetMfa.isError || setRole.isError || setActive.isError || removeMember.isError) && (
        <TableRow>
          <TableCell colSpan={6} className="bg-secondary/30">
            {pwLink && pwLink !== "sent" && (
              <div className="rounded-lg border border-accent/30 bg-accent/[0.06] p-3">
                <p className="font-mono text-[10px] uppercase tracking-widest text-accent">Recovery link for {m.email} (deliver securely)</p>
                <CopyRow label="Link" value={pwLink} />
                <Button size="xs" variant="ghost" className="mt-1 font-mono text-[10px]" onClick={() => setPwLink(null)}>Done</Button>
              </div>
            )}
            {pwLink === "sent" && <p className="font-mono text-[11px] text-accent">Recovery email queued.</p>}
            {resetMfa.isSuccess && <p className="font-mono text-[11px] text-accent">MFA reset — {resetMfa.data} factor(s) removed.</p>}
            {[resetPw.error, resetMfa.error, setRole.error, setActive.error, removeMember.error]
              .filter(Boolean)
              .map((e, i) => <p key={i} className="font-mono text-[11px] text-destructive">{(e as Error).message}</p>)}
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="mt-2 flex items-center gap-2">
      <span className="w-16 shrink-0 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
      <code className="min-w-0 flex-1 truncate rounded-md bg-background px-2 py-1.5 font-mono text-xs">{value}</code>
      <button onClick={() => navigator.clipboard?.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })}
        aria-label={`Copy ${label}`} className="rounded-md p-1.5 text-muted-foreground transition hover:bg-foreground/[0.05] hover:text-foreground">
        {copied ? <Check className="size-3.5 text-accent" /> : <Copy className="size-3.5" />}
      </button>
    </div>
  )
}
