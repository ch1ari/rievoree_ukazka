/**
 * Formula-injection (a.k.a. CSV-injection) defense — TYPE-AWARE.
 *
 * A spreadsheet treats a cell whose first character is `= + - @` (or TAB / CR)
 * as the start of a formula when the file is later opened in Excel/Sheets. The
 * textbook fix — prefix every such cell with a single quote — would CORRUPT
 * legitimate accounting data: "-100" is a real negative amount, not a formula.
 *
 * So we escape only NON-NUMERIC (text) cells. A value that parses as a number
 * (including a leading `-`/`+` and thousands separators) is left exactly as-is;
 * any other value that begins with a dangerous character gets a leading `'`.
 *
 * We never evaluate formulas anywhere — this purely neutralizes a value so it
 * can't be interpreted as one downstream (rendering / re-export). NUL bytes are
 * already rejected upstream by the edge function's content sniff.
 */

// OWASP CSV-injection leading characters: = + - @ TAB CR. Plain leading spaces
// are skipped (harmless) in sanitizeCell; TAB and CR are NOT skipped.
const DANGEROUS_LEADING = new Set(["=", "+", "-", "@", "\t", "\r"])

// A whole-string number: optional sign, plain digits OR thousands-grouped
// digits, optional decimals, optional exponent. Matches "-100", "+5",
// "-1,234.56", "1.5e3"; rejects "=SUM(A1)", "-not a number", "1,23", "12-34".
const NUMERIC_RE = /^[+-]?(\d+|\d{1,3}(,\d{3})+)(\.\d+)?([eE][+-]?\d+)?$/

/** True when the trimmed value is a plain number (so it is data, not a formula). */
export function isNumeric(value: string): boolean {
  return NUMERIC_RE.test(value.trim())
}

/**
 * Return a value safe to store/re-render. Numbers pass through untouched
 * (negatives preserved); a non-numeric value beginning with a dangerous
 * character (after skipping plain leading spaces) is prefixed with a single
 * quote.
 */
export function sanitizeCell(value: string): string {
  if (isNumeric(value)) return value

  let i = 0
  while (i < value.length && value[i] === " ") i++ // skip plain spaces only
  if (i < value.length && DANGEROUS_LEADING.has(value[i])) {
    return "'" + value
  }
  return value
}
