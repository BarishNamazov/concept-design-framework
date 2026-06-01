/**
 * Small presentation helpers shared across the UI: humane timestamps, author
 * initials, and deterministic accent colors derived from ids (so avatars and
 * category dots stay stable without the backend storing a color).
 */

/** Coerces the backend's serialized `Date` (ISO string) into a `Date`. */
export function toDate(value: unknown): Date | null {
  if (value == null) return null;
  const d = new Date(value as string);
  return Number.isNaN(d.getTime()) ? null : d;
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 60 * 60 * 24 * 365],
  ["month", 60 * 60 * 24 * 30],
  ["week", 60 * 60 * 24 * 7],
  ["day", 60 * 60 * 24],
  ["hour", 60 * 60],
  ["minute", 60],
];

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** "3 hours ago", "just now", "2 days ago". */
export function relativeTime(value: unknown): string {
  const date = toDate(value);
  if (!date) return "";
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 45) return "just now";
  for (const [unit, secs] of UNITS) {
    if (abs >= secs) return rtf.format(Math.round(seconds / secs), unit);
  }
  return "just now";
}

/** "Jun 1, 2026, 3:21 PM" — full timestamp for tooltips/titles. */
export function fullTime(value: unknown): string {
  const date = toDate(value);
  if (!date) return "";
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** Up to two uppercase initials from a display name. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// A warm, editorial spread of hues for derived accents (avatars, category dots).
const ACCENTS = [
  "oklch(0.62 0.15 32)", // ember
  "oklch(0.58 0.1 150)", // moss
  "oklch(0.55 0.11 250)", // ink blue
  "oklch(0.6 0.13 330)", // plum
  "oklch(0.62 0.12 95)", // ochre
  "oklch(0.55 0.09 200)", // teal
  "oklch(0.58 0.14 12)", // rust
  "oklch(0.5 0.09 285)", // iris
];

/** A stable color for an id/string, used for avatar and category dot fills. */
export function accentFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return ACCENTS[hash % ACCENTS.length];
}

/** Short, monospace-friendly id fragment, e.g. `0a1b2c3d`. */
export function shortId(id: string): string {
  return id.replace(/-/g, "").slice(0, 8);
}

/** First non-empty line of markdown, stripped of heading/format markers. */
export function titleFromContent(content: string): string {
  const line =
    content
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.length > 0) ?? "";
  return line.replace(/^#{1,6}\s+/, "").replace(/[*_`>#]/g, "").trim() ||
    "(untitled)";
}

/** Plain-text excerpt for feed previews. */
export function excerpt(content: string, max = 180): string {
  const text = content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`~]/g, "")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

/** Pluralize a count with its noun: `count(1, "reply")` → "1 reply". */
export function count(n: number, noun: string, plural?: string): string {
  return `${n} ${n === 1 ? noun : plural ?? `${noun}s`}`;
}
