# PLAN.md — X-Ray Financial Reporting Engine

> Tento súbor je kontext pre Claude Code. Popisuje CO staviame a PRECO.
> Projekt je portfólio ukážka full-stack zručností. Dôraz na backend kvalitu,
> bezpečnosť a na to, aby bola backend mašinéria VIDITEĽNÁ cez "X-ray" panel.

---

## 1. Cieľ projektu

Finančný reporting nástroj: prijíma surové účtovné dáta (CSV/XLSX), spracuje ich
cez ETL pipeline, detekuje anomálie, generuje reporty. **Čísla sú vedľajšie —
hodnota je v backendovej architektúre a v tom, že ju vidno.**

Hlavná odlišnosť: **X-ray panel** na každej stránke ukazuje naživo, čo beží pod
kapotou (API/RPC volania, časy, RLS policies, SQL, bezpečnostné vrstvy, kde to
fyzicky beží).

Toto NIE JE klon žiadnej existujúcej aplikácie. Staviame od nuly.

---

## 2. Stack

- **Frontend:** React 18 + TypeScript + Vite + Tailwind + shadcn/ui
- **Backend:** Supabase (PostgreSQL + Edge Functions v Deno)
- **Docker:** docker-compose s lokálnym Postgresom + 1 vlastný service (ETL/metrics worker)
- **CI:** GitHub Actions (lint, typecheck, test, migration-safety scanner)
- **Animácie:** (knižnica — viď SETUP, inštaluje Claude Code)

---

## 3. Dizajn — vibe (NEKOPÍROVAŤ konkrétne práce)

Estetika: editorial / brutalist-clean.
- Čierno-biela paleta + JEDEN akcent (napr. elektrická modrá alebo červená)
- Výrazná veľká typografia, veľa whitespace
- Ostré hrany, kartový layout, jemné tiene
- Voliteľne abstraktné 3D tvary ako dekor (vlastné, nie cudzie assety)
- X-ray panel: tmavý "developer console" vzhľad, monospace font, živé grafy latencie

Žiadne reálne osoby, žiadne cudzie logá/značky, žiadne licencované assety.

---

## 4. Stránky (každá má X-ray panel)

1. **Landing** — hero, čo to je, prihlásenie
2. **Dashboard** — prehľad reportov, KPI karty
3. **Upload / Ingest** — nahranie CSV/XLSX, spustenie ETL
4. **Reports** — P&L / journal / anomálie (dáta filtrované cez RLS podľa roly)
5. **Connectors** — pripojenie Google Drive (auto-ingest) + OAuth login
6. **User Management** (admin) — useri, roly, reset hesla, reset MFA
7. **Account / Security** — vlastný profil, MFA setup, zmena hesla

---

## 5. Backend featury na implementáciu

### ETL pipeline
- Upload → validácia (per-"klient" pravidlá) → transform → load
- Idempotentný delete-and-reload
- Polymorfný čítač (rôzne formáty/hlavičky)

### Async spracovanie
- Queue tabuľka + advisory lock (pg_try_advisory_xact_lock)
- FOR UPDATE SKIP LOCKED na pick-one
- Self-invoke / pg_net retrigger proti edge timeoutu

### Anomaly detection
- Z-score: porovnanie záznamu voči historickému mean + std pre účet/mesiac
- Flagnuté položky → manual review pred importom

### DB
- Trigger chains: po schválení staging → production + refresh views
- pg_cron (naplánovaný refresh / housekeeping)
- pg_net (DB volá edge funkcie)
- RLS multi-tenant izolácia
- InitPlan RLS optimalizácia — ukázať before/after čas v X-ray

---

## 6. Auth & User Management

### Roly (4 úrovne)
- **Super Admin** — všetko vrátane priraďovania entít
- **Admin** — spravuje userov v organizácii, reset hesla/MFA iným
- **Manager** — vidí dáta priradených entít, schvaľuje importy, nespravuje userov
- **Viewer** — len čítanie reportov svojich entít

### Featury
- Email+heslo login (Supabase Auth + JWT)
- OAuth login (Google / GitHub) — "Sign in with..."
- Reset hesla (vlastný flow)
- MFA/TOTP: setup + verify + reset, AAL2 enforcement na citlivých akciách
- Account lockout po N neúspešných pokusoch
- Admin: createUser, prideľovanie rolí, reset MFA iným userom
- Privilege-escalation hardening: zmrazené stĺpce (is_admin, allowed_entities),
  server NIKDY netrustuje user-writable polia

### X-ray ukážka rol
Ten istý dopyt ako Viewer vs. Manager vs. Admin vráti iné riadky kvôli RLS.
Panel ukáže vedľa seba: "Viewer vidí 3 entity / 412 riadkov (policy X);
Admin by videl 30 entít / 5000 riadkov". Voliteľne "impersonate role" prepínač
LEN v demo režime.

---

## 7. Connectors

### Google Drive (hlavný connector)
- User pripojí Drive → sleduje priečinok → nové CSV/XLSX auto-natiahne do ETL
- Changes API + resumable page-token (prežije reštart)
- Idempotentný claim_file, bounded cron
- X-ray: živý reťazec "Drive → download → Storage → ETL queue → validate → load"

### OAuth login (Google/GitHub)
- Ukáže OAuth2 flow vedľa password auth

### Fallback ak málo času
- HMAC-podpísaný webhook endpoint (constant-time verify)

---

## 8. X-ray panel — čo zbiera a ukazuje

Na každej stránke tlačidlo (🔬). Panel ukazuje pre AKTUÁLNU stránku:
- ktoré API/RPC volania bežali + trvanie (ms)
- ktoré RLS policies sa vzťahujú na zobrazené dáta a prečo user vidí toto
- SQL dopyt / EXPLAIN pod kapotou
- aktívne bezpečnostné vrstvy (auth, rate-limit, validácia, MFA/AAL2)
- arch. diagram: kde to fyzicky beží (Edge fn / Postgres / Docker kontajner)

Implementačná pozn.: inštrumentovať volania (timing wrapper okolo supabase
klienta / RPC), zbierať metadáta do contextu, panel ich renderuje.

---

## 9. Bezpečnosť (defense-in-depth)

- RLS na všetkých tenant tabuľkách
- Rate limiting (per-IP, per-endpoint)
- Formula-injection defense pri CSV/XLSX importe (escape = + - @)
- HMAC na webhookoch, constant-time porovnanie
- MFA/AAL2 na citlivých akciách
- CSP/security headers na deploy
- migration-safety CI scanner: blokuje "fake RLS" USING(true)

---

## 10. Definition of Done

- `docker-compose up` rozbehne celé lokálne za ~1 min
- seed script s realistickými FAKE dátami (žiadne reálne dáta)
- test suite: ETL transform + z-score logika
- README s architektúra diagramom + screenshotmi X-ray panelu
- nasadené demo + GitHub odkaz
- v portfóliu uvádzať LEN to, čo v projekte reálne je

---

## 11. Plán po dňoch (1–2 týždne)

- **D1–2:** Scaffold + Docker + základná schéma + RLS
- **D3–4:** ETL jadro + seed dáta
- **D5–6:** Async queue + advisory lock, z-score, trigger chains, pg_cron
- **D7–8:** X-ray panel (srdce projektu)
- **D9–10:** Auth/user mgmt + connectors + CI + leštenie + deploy

(Roly, connectors a user management sa prelínajú — rob ich spolu s X-ray, lebo
sú jeho najlepšou ukážkou.)
