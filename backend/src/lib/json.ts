export function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function stringifyJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

/** Remove obvious secrets before persisting provider payloads or error strings. */
export function redact(value: unknown): unknown {
  if (typeof value === "string") {
    return value
      .replace(/access_token["':\s]+[A-Za-z0-9._-]+/gi, "access_token=[REDACTED]")
      .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]");
  }
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (/secret|token|authorization|password|card/i.test(key)) {
        out[key] = "[REDACTED]";
      } else {
        out[key] = redact(val);
      }
    }
    return out;
  }
  return value;
}

export function safeJson(value: unknown, maxLength = 20000): string {
  const serialized = JSON.stringify(redact(value) ?? null);
  return serialized.length > maxLength ? serialized.slice(0, maxLength) : serialized;
}
