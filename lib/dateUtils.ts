// Trip/catch dates are stored as date-only strings ("YYYY-MM-DD"). Formatting
// them with `new Date("2026-07-03")` parses as UTC midnight, which renders as
// the PREVIOUS day in any timezone behind UTC (e.g. US). Parse the parts as a
// LOCAL date so the displayed day matches what was entered.
export function formatDate(
  dateStr: string | null | undefined,
  opts: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric', year: 'numeric' },
  locale = 'en-US'
): string {
  if (!dateStr) return ''
  const datePart = String(dateStr).split('T')[0]
  const [y, m, d] = datePart.split('-').map(Number)
  const dt = y && m && d ? new Date(y, m - 1, d) : new Date(dateStr)
  return dt.toLocaleDateString(locale, opts)
}
