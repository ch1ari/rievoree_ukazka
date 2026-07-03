// ============================================================================
// Shared Google OAuth2 + Drive API helpers (Web fetch only).
//
// Scope: drive.readonly. We use the offline flow (access_type=offline,
// prompt=consent) to obtain a refresh token, then mint short-lived access
// tokens on demand. The Drive *Changes* API gives us a resumable page token
// (startPageToken) so a sync only ever sees what changed since last time —
// the "survives restart" property from PLAN.md §7.
// ============================================================================

const TOKEN_URL = "https://oauth2.googleapis.com/token"
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
const DRIVE = "https://www.googleapis.com/drive/v3"
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly"

export function clientId(): string { return Deno.env.get("GOOGLE_OAUTH_CLIENT_ID") ?? "" }
export function clientSecret(): string { return Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET") ?? "" }
export function redirectUri(): string { return Deno.env.get("GOOGLE_OAUTH_REDIRECT_URI") ?? "" }
/** Where the callback sends the browser back to (the app's /connectors page). */
export function appRedirect(): string {
  return Deno.env.get("GOOGLE_OAUTH_APP_REDIRECT") ?? "http://127.0.0.1:3000/connectors"
}
export function isConfigured(): boolean {
  return Boolean(clientId() && clientSecret() && redirectUri())
}

export function consentUrl(state: string): string {
  const p = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: DRIVE_SCOPE,
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state,
  })
  return `${AUTH_URL}?${p.toString()}`
}

export interface TokenSet {
  access_token: string
  refresh_token?: string
  expires_in: number
}

export async function exchangeCode(code: string): Promise<TokenSet> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  })
  if (!res.ok) throw new Error(`token exchange failed: ${res.status} ${await res.text()}`)
  return await res.json() as TokenSet
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenSet> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId(),
      client_secret: clientSecret(),
      grant_type: "refresh_token",
    }),
  })
  if (!res.ok) throw new Error(`token refresh failed: ${res.status} ${await res.text()}`)
  return await res.json() as TokenSet
}

/** Initial resumable cursor for the Changes feed. */
export async function getStartPageToken(accessToken: string): Promise<string> {
  const res = await fetch(`${DRIVE}/changes/startPageToken`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`startPageToken failed: ${res.status} ${await res.text()}`)
  const j = await res.json() as { startPageToken: string }
  return j.startPageToken
}

export interface DriveChange {
  fileId: string
  removed: boolean
  file?: { id: string; name: string; mimeType: string; trashed?: boolean; parents?: string[] }
}

export interface ChangesPage {
  changes: DriveChange[]
  newStartPageToken?: string
  nextPageToken?: string
}

/** One page of the Changes feed from `pageToken`. */
export async function listChanges(accessToken: string, pageToken: string): Promise<ChangesPage> {
  const p = new URLSearchParams({
    pageToken,
    pageSize: "100",
    fields: "newStartPageToken,nextPageToken,changes(fileId,removed,file(id,name,mimeType,trashed,parents))",
    includeRemoved: "false",
    restrictToMyDrive: "false",
    spaces: "drive",
  })
  const res = await fetch(`${DRIVE}/changes?${p.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`changes list failed: ${res.status} ${await res.text()}`)
  return await res.json() as ChangesPage
}

const GOOGLE_SHEET = "application/vnd.google-apps.spreadsheet"
const CSV_MIMES = ["text/csv", "application/csv", "text/plain"]

export function isIngestableFile(mimeType: string, name: string): boolean {
  return mimeType === GOOGLE_SHEET || CSV_MIMES.includes(mimeType) || /\.csv$/i.test(name)
}

/** Download a file as CSV text. Google Sheets are exported; CSVs are streamed. */
export async function downloadAsCsv(accessToken: string, fileId: string, mimeType: string): Promise<string> {
  const endpoint = mimeType === GOOGLE_SHEET
    ? `${DRIVE}/files/${fileId}/export?mimeType=text/csv`
    : `${DRIVE}/files/${fileId}?alt=media`
  const res = await fetch(endpoint, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) throw new Error(`download ${fileId} failed: ${res.status} ${await res.text()}`)
  return await res.text()
}
