# SETUP — krok za krokom (terminál + VS Code)

Repo: https://github.com/ch1ari/rievoree_ukazka

---

## 0. Príprava (raz)

Over, že máš nainštalované:
```bash
node -v        # ideálne 20+
git --version
claude --version   # Claude Code CLI; ak nemáš: https://docs.claude.com
```

Naklonuj repo a otvor vo VS Code:
```bash
git clone https://github.com/ch1ari/rievoree_ukazka.git
cd rievoree_ukazka
code .
```

Nahraj `PLAN.md` do koreňa repa (skopíruj súbor, ktorý som ti dal), potom:
```bash
git add PLAN.md && git commit -m "Add project plan" && git push
```

---

## 1. Supabase MCP server (Claude Code spravuje DB)

> POZOR na bezpečnosť: MCP daj do **read-only** + naviazané na konkrétny projekt,
> kým si nie si istá. Write operácie zapni až keď to potrebuješ.

V koreni repa pridaj MCP server do Claude Code:
```bash
claude mcp add supabase --transport http "https://mcp.supabase.com/mcp?project_ref=TVOJ_PROJECT_REF&read_only=true"
```
`TVOJ_PROJECT_REF` nájdeš v Supabase dashboard → Settings → General (Reference ID).

Potom spusti Claude Code a over pripojenie:
```bash
claude
```
V chate napíš: `Authenticate with Supabase MCP` — otvorí sa OAuth flow v
prehliadači, prihlás sa a povoľ organizáciu s tvojím projektom.

Test: `List all tables in my Supabase project` — ak vráti zoznam, funguje.

Keď budeš chcieť, aby Claude vedel aj zapisovať (vytvárať tabuľky), odstráň
`&read_only=true` z URL a MCP znova pridaj.

---

## 2. Supabase CLI (na migrácie — MCP samo nestačí)

```bash
npm install -g supabase   # alebo brew install supabase/tap/supabase
supabase login
supabase init             # vytvorí supabase/ priečinok v repe
supabase link --project-ref TVOJ_PROJECT_REF
```
Odteraz: migrácie verzuješ ako súbory v `supabase/migrations/`, aplikuješ cez
`supabase db push`. Claude Code ich vie písať, ty ich pushneš.

---

## 3. Docker (lokálny dev stack)

Supabase CLI vie rozbehnúť celý lokálny stack v Dockeri:
```bash
supabase start   # spustí lokálny Postgres + Studio + Auth v Dockeri
```
Plus do projektu pridáme vlastný `docker-compose.yml` s ETL/metrics workerom —
to ti napíše Claude Code (je to v PLAN.md). Cieľ: `docker-compose up` =
celé beží lokálne.

---

## 4. Animačná knižnica

Odporúčam **Framer Motion** (dnes `motion`) — štandard pre React, deklaratívne,
ľahko sa s ním robia tie editorial/scroll animácie z inšpirácie:
```bash
npm install motion
```
Import v kóde: `import { motion } from "motion/react"`

(Alternatíva ak chceš ľahší bundle: `react` + CSS transitions, ako tvoj shim
z Capily. Ale na portfólio s dôrazom na vizuál je Framer Motion lepšia voľba.)

---

## 5. Kickoff prompt pre Claude Code

Spusti `claude` v koreni repa a vlož toto:

```
Prečítaj PLAN.md v koreni repa — to je kompletná špecifikácia projektu, ktorý staviame.

Toto je portfólio projekt: full-stack finančný reporting engine s dôrazom na
backend kvalitu, bezpečnosť a na "X-ray" panel, ktorý ukazuje backend mašinériu.

Začni FÁZOU 1 (Dni 1-2 v pláne):
1. Scaffold: Vite + React 18 + TypeScript + Tailwind + shadcn/ui
2. Nainštaluj motion (Framer Motion) na animácie
3. Priprav docker-compose.yml (lokálny Postgres + ETL worker placeholder)
4. Navrhni základnú DB schému: entities, users/profiles (4 roly),
   journal/staging/production tabuľky, ingest queue
5. Napíš prvé migrácie do supabase/migrations/ s RLS policies (multi-tenant)
6. Základný routing a layout 7 stránok podľa pláne (zatiaľ prázdne stránky)

Pred písaním kódu mi navrhni štruktúru priečinkov a schému tabuliek, nech to
odsúhlasím. Postupuj po malých krokoch a vysvetľuj rozhodnutia.

Estetika: editorial/brutalist-clean, čierno-biela + jeden akcent, veľká
typografia, veľa whitespace. NEKOPÍRUJ konkrétne existujúce práce.
```

Odtiaľ pokračuj konverzačne — schvaľuj návrhy, pýtaj si zmeny, a postupne
prechádzaj fázy z PLAN.md.

---

## 6. Bezpečnostné pripomienky

- `.env` s kľúčmi NIKDY necommituj — over `.gitignore`
- Service-role key drž len server-side (nikdy vo frontend kóde)
- MCP nechaj read-only, kým nepotrebuješ write
- Do seed dát daj LEN vymyslené čísla, žiadne reálne klientske dáta
```
