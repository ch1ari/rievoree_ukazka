import { assertEquals } from "@std/assert"
import { isNumeric, sanitizeCell } from "./sanitize.ts"

// The whole point of type-aware escaping: tell a number from a formula. This is
// exactly the boundary where it could silently go wrong, so it is pinned here.

Deno.test("isNumeric: numbers (incl. negatives, signs, thousands, exponent)", () => {
  for (const n of ["-100", "+5", "100", "0", "1.5", "-1,234.56", "1,000", "1.5e3"]) {
    assertEquals(isNumeric(n), true, `"${n}" should be numeric`)
  }
})

Deno.test("isNumeric: non-numbers (formulas, dangerous text, malformed)", () => {
  for (const s of ["=SUM(A1)", "-not a number", "@cmd", "+44 20 7946", "abc", "", "1,23", "12-34"]) {
    assertEquals(isNumeric(s), false, `"${s}" should NOT be numeric`)
  }
})

Deno.test("sanitizeCell: a real negative number is NOT escaped", () => {
  assertEquals(sanitizeCell("-100"), "-100")        // the headline case
  assertEquals(sanitizeCell("-1,234.56"), "-1,234.56")
  assertEquals(sanitizeCell("+5"), "+5")
})

Deno.test("sanitizeCell: a formula IS escaped", () => {
  assertEquals(sanitizeCell("=SUM(A1)"), "'=SUM(A1)")
  assertEquals(sanitizeCell("=1+1"), "'=1+1")
})

Deno.test("sanitizeCell: non-numeric text with a dangerous prefix IS escaped", () => {
  assertEquals(sanitizeCell("-not a number"), "'-not a number") // the tricky one
  assertEquals(sanitizeCell("@handle"), "'@handle")
  assertEquals(sanitizeCell("+44 20 7946"), "'+44 20 7946")     // phone-like text, not a number
})

Deno.test("sanitizeCell: leading TAB/CR escaped; plain text/spaces left alone", () => {
  assertEquals(sanitizeCell("\t=evil"), "'\t=evil")
  assertEquals(sanitizeCell("hello"), "hello")
  assertEquals(sanitizeCell("  hello"), "  hello") // plain leading spaces are harmless
})
