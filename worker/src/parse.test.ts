import { assertEquals } from "@std/assert";
import { detectKind, parseFile } from "./parse.ts";
import { parseRuleset } from "./rules.ts";
import * as XLSX from "xlsx";

// Ruleset mirroring the seeded global default (incl. Slovak header aliases).
const rules = parseRuleset({
  required_columns: ["account_code", "txn_date"],
  header_aliases: {
    account_code: ["account", "acct", "account code", "kód účtu"],
    txn_date: ["date", "posting date", "dátum"],
    debit: ["dr", "debit"],
    credit: ["cr", "credit"],
    amount: ["amount", "value", "suma"],
    description: ["memo", "narrative", "popis"],
    currency: ["ccy", "currency", "mena"],
  },
  date_formats: ["YYYY-MM-DD", "DD.MM.YYYY", "MM/DD/YYYY"],
  allowed_currencies: ["EUR", "USD", "GBP"],
  amount_mode: "split",
  zscore: {},
});

const csv = (s: string) => new TextEncoder().encode(s);

Deno.test("CSV: header aliases (mixed case + Slovak) map to canonical fields", () => {
  // headers: account_code(alias 'Account'), txn_date('Dátum'), debit, credit,
  // currency('Mena'), description('Popis'); DD.MM.YYYY date.
  const res = parseFile(
    csv("Account,Dátum,Debit,Credit,Mena,Popis\n1000,15.03.2026,100,0,EUR,Rent\n"),
    "csv",
    rules,
  );
  assertEquals(res.rows.length, 1);
  const r = res.rows[0];
  assertEquals(r.account_code, "1000");
  assertEquals(r.txn_date, "2026-03-15"); // parsed from DD.MM.YYYY
  assertEquals(r.debit, 100);
  assertEquals(r.credit, 0);
  assertEquals(r.currency, "EUR");
  assertEquals(r.description, "Rent");
});

Deno.test("CSV: all three date formats parse; junk → null", () => {
  const res = parseFile(
    csv(
      "account,date,debit\n" +
        "1,2026-03-15,1\n" + // ISO
        "2,15.03.2026,1\n" + // DD.MM.YYYY
        "3,03/15/2026,1\n" + // MM/DD/YYYY
        "4,not-a-date,1\n",
    ),
    "csv",
    rules,
  );
  assertEquals(res.rows.map((r) => r.txn_date), [
    "2026-03-15",
    "2026-03-15",
    "2026-03-15",
    null,
  ]);
});

Deno.test("CSV: amount thousands separators are coerced", () => {
  const res = parseFile(
    csv("account,date,debit,credit\n1000,2026-03-15,\"1,234.56\",0\n"),
    "csv",
    rules,
  );
  assertEquals(res.rows[0].debit, 1234.56);
});

Deno.test("signed amount_mode: sign splits into debit/credit", () => {
  const signed = parseRuleset({ ...structuredClone(rulesObj()), amount_mode: "signed" });
  const res = parseFile(
    csv("account,date,amount\nA,2026-03-15,-50\nB,2026-03-15,30\n"),
    "csv",
    signed,
  );
  assertEquals([res.rows[0].debit, res.rows[0].credit], [0, 50]); // negative → credit
  assertEquals([res.rows[1].debit, res.rows[1].credit], [30, 0]); // positive → debit
});

Deno.test("raw is verbatim; only the typed text field is injection-escaped", () => {
  const res = parseFile(
    csv("account,date,memo\n1000,2026-03-15,=cmd|'/bin/calc'\n"),
    "csv",
    rules,
  );
  // raw keeps the original cell exactly as read...
  assertEquals(res.rows[0].raw["memo"], "=cmd|'/bin/calc'");
  // ...while the extracted description is neutralized with a leading quote.
  assertEquals(res.rows[0].description, "'=cmd|'/bin/calc'");
});

Deno.test("CSV: all-empty rows are skipped", () => {
  const res = parseFile(
    csv("account,date,debit\n1000,2026-03-15,100\n,,\n2000,2026-03-16,200\n"),
    "csv",
    rules,
  );
  assertEquals(res.rows.map((r) => r.account_code), ["1000", "2000"]);
});

Deno.test("XLSX: a real .xlsx workbook parses through the same path", () => {
  const ws = XLSX.utils.aoa_to_sheet([
    ["account", "date", "debit", "credit", "currency"],
    ["2000", "2026-04-01", "50", "0", "USD"],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  const bytes = new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }));

  assertEquals(detectKind(bytes), "xlsx"); // PK zip magic
  const res = parseFile(bytes, "xlsx", rules);
  assertEquals(res.rows.length, 1);
  assertEquals(res.rows[0].account_code, "2000");
  assertEquals(res.rows[0].txn_date, "2026-04-01");
  assertEquals(res.rows[0].debit, 50);
  assertEquals(res.rows[0].currency, "USD");
});

// Plain object form of the rules (for variants); kept in one place.
function rulesObj() {
  return {
    required_columns: ["account_code", "txn_date"],
    header_aliases: {
      account_code: ["account", "acct", "account code", "kód účtu"],
      txn_date: ["date", "posting date", "dátum"],
      debit: ["dr", "debit"],
      credit: ["cr", "credit"],
      amount: ["amount", "value", "suma"],
      description: ["memo", "narrative", "popis"],
      currency: ["ccy", "currency", "mena"],
    },
    date_formats: ["YYYY-MM-DD", "DD.MM.YYYY", "MM/DD/YYYY"],
    allowed_currencies: ["EUR", "USD", "GBP"],
    amount_mode: "split" as const,
    zscore: {},
  };
}
