export function asObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function pickString(...candidates: unknown[]): string | undefined {
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return undefined;
}

export function pickNumber(...candidates: unknown[]): number | undefined {
  for (const c of candidates) {
    if (typeof c === 'number' && Number.isFinite(c)) return c;
    if (typeof c === 'string' && c.trim() && Number.isFinite(Number(c))) {
      return Number(c);
    }
  }
  return undefined;
}

export function pickArray(...candidates: unknown[]): unknown[] | undefined {
  for (const c of candidates) {
    if (Array.isArray(c) && c.length > 0) return c;
  }
  return undefined;
}

export function dig(
  source: unknown,
  ...path: ReadonlyArray<string | number>
): unknown {
  let cur: unknown = source;
  for (const key of path) {
    if (cur === undefined || cur === null) return undefined;
    if (typeof key === 'number') {
      if (!Array.isArray(cur)) return undefined;
      cur = cur[key];
    } else {
      const obj = asObject(cur);
      if (!obj) return undefined;
      cur = obj[key];
    }
  }
  return cur;
}

export function firstUrl(...candidates: unknown[]): string | undefined {
  for (const c of candidates) {
    if (typeof c === 'string' && /^https?:\/\//i.test(c)) return c;
    if (Array.isArray(c)) {
      for (const inner of c) {
        if (typeof inner === 'string' && /^https?:\/\//i.test(inner)) return inner;
        const url = asObject(inner)?.['url'];
        if (typeof url === 'string' && /^https?:\/\//i.test(url)) return url;
      }
    }
  }
  return undefined;
}
