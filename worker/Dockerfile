# ETL / metrics worker — Deno (consistent with Supabase Edge Functions)
FROM denoland/deno:alpine-2.8.2

WORKDIR /app

# Cache dependencies first for layer reuse
COPY deno.json .
COPY src/ src/
RUN deno cache src/main.ts

# Non-root: the deno image ships a dedicated user
USER deno

CMD ["run", "--allow-net", "--allow-env", "src/main.ts"]
