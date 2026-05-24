/** Normalize user-entered site rules to hostnames for matching. */
export function normalizeAllowedUrlEntry(entry: string): string {
  const raw = entry.trim().toLowerCase();
  if (!raw) return "";
  try {
    if (raw.includes("://")) {
      return new URL(raw).hostname;
    }
  } catch {
    /* fall through */
  }
  return raw.replace(/^https?:\/\//, "").split("/")[0].split("?")[0];
}

export function parseAllowedUrls(input: unknown): string[] {
  if (!input) return [];
  if (Array.isArray(input)) {
    return [...new Set(input.map((u) => normalizeAllowedUrlEntry(String(u))).filter(Boolean))];
  }
  if (typeof input === "string") {
    return [...new Set(
      input.split(/[\n,]+/).map((u) => normalizeAllowedUrlEntry(u)).filter(Boolean),
    )];
  }
  return [];
}

/** Returns true when url's host matches an allowed pattern (*.domain.com supported). */
export function isUrlAllowed(url: string, allowedUrls: string[]): boolean {
  if (!allowedUrls.length) return false;
  let host: string;
  try {
    const normalized = url.trim().startsWith("http") ? url.trim() : `https://${url.trim()}`;
    host = new URL(normalized).hostname.toLowerCase();
  } catch {
    return false;
  }

  for (const entry of allowedUrls) {
    const pattern = normalizeAllowedUrlEntry(entry);
    if (!pattern) continue;

    if (pattern.startsWith("*.")) {
      const base = pattern.slice(2);
      if (host === base || host.endsWith(`.${base}`)) return true;
      continue;
    }

    if (host === pattern || host.endsWith(`.${pattern}`)) return true;
  }

  return false;
}
