# Portfólio projekt — "X-Ray Financial Reporting Engine"

Pracovný plán a checklist. Cieľ: jeden technicky hustý full-stack projekt, ktorý cez interaktívny "X-ray" panel ukáže, **kde a ako beží backend, ako bezpečne a ako výkonne**.

---

## ČASŤ A — Čo má spĺňať full-stack (2026) a kde stojíš

Zdroje sa zhodujú na 7 pilieroch: frontend, backend, databázy, návrh API, cloud, DevOps, bezpečnosť. Návrh API je označovaný za najuniverzálnejšiu zručnosť (každý klient hovorí cez API).

| Pilier | Čo trh pýta | Tvoj stav (z repov) | Akcia v projekte |
|---|---|---|---|
| **Frontend** | React/Vue do hĺbky, state, data flow, responzívnosť, a11y | React 18 + TS + Vite, Radix/shadcn, Tailwind, react-query, RHF+Zod, recharts | Ukázať — silné. Pridať dôraz na a11y + responzívnosť |
| **Backend & API** | REST design, validácia, auth, error handling, logging | Deno Edge (98 fn), FastAPI, RPC kontrakty, doménové error triedy | Ukázať — veľmi silné |
| **Databázy** | SQL, schéma, indexy, dopyty | Postgres expert: RLS, triggery, advisory locks, pg_cron/pg_net, MV, window fns, InitPlan optim. | Ukázať — najsilnejšia zbraň |
| **ETL / data** | (bonus, ale tvoja špecialita) | multi-source ingest, polymorfný Excel reader, z-score, idempotencia | Ukázať — výnimočné |
| **Cloud** | AWS/Azure/GCP, aspoň jeden | okrajovo (AWS "introductory") | Voliteľne neskôr |
| **DevOps** | Git, CI/CD, Docker, secrets, monitoring | GitHub Actions (migration-safety scanner!), Vercel/Supabase | **Pridať Docker** — jediná reálna medzera |
| **Bezpečnosť** | JWT/OAuth, OWASP, šifrovanie, rate-limit | CSP+nonce, HMAC, rate-limit, MFA/AAL2, formula-injection defense, constant-time | Ukázať — nadštandard |
| **AI-assisted** | trendová zručnosť | multi-agent Claude pipeline, OCR cez Gemini | Ukázať — máš |

---

## ČASŤ B — Projekt: "X-Ray Financial Reporting Engine"

### Koncept
Finančný reporting nástroj, ktorý prijíma surové účtovné dáta (CSV/XLSX uploady simulujúce viacero "klientov"), spracuje ich cez ETL, detekuje anomálie a generuje reporty. **Čísla sú vedľajšie — show je v backendovej mašinérii a v tom, že ju vidno.**

### Hlavná odlišnosť: X-ray panel
Na každej stránke je tlačidlo (napr. ikona 🔬 v rohu), ktoré otvorí bočný panel. Panel pre danú stránku ukazuje **naživo**:
- ktoré API/RPC volania práve bežia a ako dlho trvali (ms)
- ktoré RLS policies sa na dáta vzťahujú a prečo daný user vidí presne toto
- aký SQL dopyt / EXPLAIN beží pod kapotou
- bezpečnostné vrstvy aktívne na tejto stránke (auth, rate-limit, validácia)
- kde to fyzicky beží (Edge fn / Postgres / Docker kontajner) — malý arch. diagram

### Stack
- **Frontend:** React 18 + TS + Vite + Tailwind + shadcn (tvoj zaužívaný)
- **Backend:** Supabase (Postgres + Edge Functions) — tvoja sila
- **Docker:** lokálny Postgres + jeden vlastný service (napr. ETL worker alebo "metrics collector" pre X-ray dáta) v kontajneri, `docker-compose up` rozbehne celé
- **CI:** GitHub Actions (lint, typecheck, test, migration-safety scanner)

### Backend featury na ukázanie (vyber, nemusí byť všetko)
1. ETL pipeline: upload → validácia (per-klient pravidlá) → transform → load (idempotentný delete-and-reload)
2. Async spracovanie veľkých súborov: queue + advisory lock + self-invoke (proti edge timeoutu)
3. Z-score anomaly detection pred importom
4. RLS multi-tenant izolácia + InitPlan optimalizácia (ukázať before/after čas)
5. Trigger chains: po schválení staging → production + refresh views
6. pg_cron + pg_net (DB sama plánuje a volá funkcie)
7. Bezpečnosť: rate-limit, formula-injection defense, HMAC, MFA

### "Predaj" v portfóliu
- README s architektúra diagramom
- `docker-compose up` a beží celé lokálne za 1 min
- seed script s realistickými fake dátami (ŽIADNE reálne klientske dáta z Capily!)
- test suite (ETL + anomaly logika)
- nasadené demo + GitHub odkaz

---

## ČASŤ C — Týždňový plán (1–2 týždne)

**Dni 1–2:** Scaffold + Docker
- Vite+React+TS+Tailwind+shadcn, `docker-compose.yml` (Postgres + worker), základná schéma + RLS

**Dni 3–4:** ETL jadro
- Upload, validácia, transform, idempotentný load, seed dáta

**Dni 5–6:** Backend featury
- Async queue + advisory lock, z-score detection, trigger chains, pg_cron

**Dni 7–8:** X-ray panel (srdce projektu)
- Inštrumentácia volaní (čas, RLS, SQL), bočný panel UI, arch. diagram per stránka

**Dni 9–10:** Bezpečnosť + CI + leštenie
- Rate-limit, MFA, GitHub Actions, README, deploy, testy

---

## DÔLEŽITÉ — etika a čistota
- Žiadny kód ani dáta priamo skopírované z Capila repov. Tento projekt staviame od nuly, znovu, ako TVOJ vlastný — patterny ovládaš, takže ich vieš reimplementovať lepšie a vysvetliť.
- Do CV/portfólia uvádzaj len to, čo v tomto projekte reálne bude.
