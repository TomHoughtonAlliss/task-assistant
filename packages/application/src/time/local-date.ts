/**
 * Returns the user-local calendar date string for one absolute instant in the supplied timezone.
 */
export function getLocalDateString(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = readPart(parts, "year");
  const month = readPart(parts, "month");
  const day = readPart(parts, "day");
  return `${year}-${month}-${day}`;
}

/**
 * Reads one named part from a `formatToParts` result or throws when it is missing.
 */
function readPart(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): string {
  const part = parts.find((candidate) => candidate.type === type);
  if (!part) {
    throw new Error(`Missing date part: ${type}`);
  }

  return part.value;
}
