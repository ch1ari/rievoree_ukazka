import { parse as parseCsv } from "@std/csv";
import * as XLSX from "xlsx";
import { sanitizeCell } from "./sanitize.ts";
import type { Ruleset } from "./rules.ts";

export type FileKind = "csv" | "xlsx";

// One row destined for journal_staging. Text fields are sanitized; amounts/date
// are coerced (NULL when unparseable — the DB transform records that as a
// validation_error rather than rejecting the row).
export interface ParsedRow {
  row_num: number;
  account_code: string | null;
  txn_date: string | null; // ISO YYYY-MM-DD
  description: string | null;
  debit: number | null;
  credit: number | null;
  currency: string | null;
  raw: Record<string, string>; // original row verbatim, for audit/reprocessing
}

export interface ParseResult {
  rows: ParsedRow[];
  headers: string[];
  mappedFields: string[]; // canonical fields successfully resolved from headers
}

// XLSX (and any OOXML) is a ZIP: PK\x03\x04. Everything else is treated as CSV.
// The edge function already gated content on upload; this only picks a parser.
export function detectKind(bytes: Uint8Array): FileKind {
  return (bytes.length >= 4 &&
      bytes[0] === 0x50 && bytes[1] === 0x4b &&
      bytes[2] === 0x03 && bytes[3] === 0x04)
    ? "xlsx"
    : "csv";
}

function readGrid(bytes: Uint8Array, kind: FileKind): string[][] {
  if (kind === "xlsx") {
    const wb = XLSX.read(bytes, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) return [];
    // header:1 → array-of-arrays; raw:false → formatted strings; defval keeps
    // empty cells aligned so column indexes stay stable.
    return XLSX.utils.sheet_to_json<string[]>(ws, {
      header: 1,
      raw: false,
      defval: "",
    });
  }
  const text = new TextDecoder("utf-8").decode(bytes);
  return parseCsv(text) as string[][];
}

// Build column-index → canonical-field from the ruleset's header_aliases (plus
// each field name as its own alias). Case-insensitive, trimmed; first column
// wins if two headers map to the same field.
function buildFieldMap(headers: string[], rules: Ruleset): Map<number, string> {
  const aliasToField = new Map<string, string>();
  for (const [field, aliases] of Object.entries(rules.header_aliases)) {
    aliasToField.set(field.toLowerCase().trim(), field);
    for (const a of aliases) aliasToField.set(a.toLowerCase().trim(), field);
  }
  const map = new Map<number, string>();
  const taken = new Set<string>();
  headers.forEach((h, i) => {
    const field = aliasToField.get((h ?? "").toLowerCase().trim());
    if (field && !taken.has(field)) {
      map.set(i, field);
      taken.add(field);
    }
  });
  return map;
}

// Coerce an amount: strip thousands separators, accept a plain signed decimal.
// Unparseable / empty → null (the DB flags it).
function parseAmount(value: string | undefined): number | null {
  if (value == null) return null;
  const cleaned = value.trim().replace(/,/g, "");
  if (cleaned === "" || !/^[+-]?\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

const DATE_PATTERNS: Record<string, { re: RegExp; y: number; m: number; d: number }> = {
  "YYYY-MM-DD": { re: /^(\d{4})-(\d{2})-(\d{2})$/, y: 1, m: 2, d: 3 },
  "DD.MM.YYYY": { re: /^(\d{2})\.(\d{2})\.(\d{4})$/, y: 3, m: 2, d: 1 },
  "MM/DD/YYYY": { re: /^(\d{2})\/(\d{2})\/(\d{4})$/, y: 3, m: 1, d: 2 },
};

// Try each accepted format in order; return ISO YYYY-MM-DD or null. Validates
// the calendar (rejects e.g. 2026-13-40) via a UTC round-trip.
function parseDate(value: string | undefined, formats: string[]): string | null {
  if (value == null) return null;
  const v = value.trim();
  if (v === "") return null;
  for (const fmt of formats) {
    const p = DATE_PATTERNS[fmt];
    if (!p) continue;
    const m = v.match(p.re);
    if (!m) continue;
    const year = Number(m[p.y]), month = Number(m[p.m]), day = Number(m[p.d]);
    const dt = new Date(Date.UTC(year, month - 1, day));
    if (
      dt.getUTCFullYear() === year && dt.getUTCMonth() === month - 1 &&
      dt.getUTCDate() === day
    ) {
      const mm = String(month).padStart(2, "0");
      const dd = String(day).padStart(2, "0");
      return `${year}-${mm}-${dd}`;
    }
  }
  return null;
}

// Sanitize a text cell and normalize empty → null.
function text(value: string | undefined): string | null {
  if (value == null) return null;
  const s = sanitizeCell(value);
  return s.trim() === "" ? null : s;
}

function buildRow(
  rowNum: number,
  field: Record<string, string>,
  raw: Record<string, string>,
  rules: Ruleset,
): ParsedRow {
  let debit: number | null = null;
  let credit: number | null = null;
  if (rules.amount_mode === "signed") {
    // Single signed column: positive → debit, negative → credit.
    const amt = parseAmount(field["amount"]);
    if (amt != null) {
      if (amt >= 0) { debit = amt; credit = 0; }
      else { debit = 0; credit = -amt; }
    }
  } else {
    debit = parseAmount(field["debit"]);
    credit = parseAmount(field["credit"]);
  }

  const currency = field["currency"] != null
    ? (sanitizeCell(field["currency"]).trim().toUpperCase().slice(0, 3) || null)
    : null;

  return {
    row_num: rowNum,
    account_code: text(field["account_code"]),
    txn_date: parseDate(field["txn_date"], rules.date_formats),
    description: text(field["description"]),
    debit,
    credit,
    currency,
    raw,
  };
}

export function parseFile(
  bytes: Uint8Array,
  kind: FileKind,
  rules: Ruleset,
): ParseResult {
  const grid = readGrid(bytes, kind);
  if (grid.length === 0) return { rows: [], headers: [], mappedFields: [] };

  const headers = grid[0].map((h) => (h ?? "").toString());
  const fieldByCol = buildFieldMap(headers, rules);

  const rows: ParsedRow[] = [];
  for (let r = 1; r < grid.length; r++) {
    const cells = grid[r] ?? [];
    if (cells.every((c) => (c ?? "").toString().trim() === "")) continue; // skip blank lines

    const raw: Record<string, string> = {};
    const field: Record<string, string> = {};
    headers.forEach((h, i) => {
      const val = (cells[i] ?? "").toString();
      raw[h || `col${i}`] = val; // verbatim, pre-sanitize
      const f = fieldByCol.get(i);
      if (f) field[f] = val;
    });
    // row_num = source line (1-based incl. header); unique per batch, maps to file.
    rows.push(buildRow(r, field, raw, rules));
  }

  return { rows, headers, mappedFields: [...new Set(fieldByCol.values())] };
}
