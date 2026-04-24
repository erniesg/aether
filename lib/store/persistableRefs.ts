const MAX_PERSISTED_REF_CHARS = 200_000;

function isInlineDataRef(value: string) {
  return value.startsWith('data:');
}

export function toPersistableRef(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (isInlineDataRef(value)) return undefined;
  if (value.length > MAX_PERSISTED_REF_CHARS) return undefined;
  return value;
}

export function toPersistableRefs(
  values: string[] | undefined
): string[] | undefined {
  if (!values) return undefined;
  const refs = values.flatMap((value) => {
    const ref = toPersistableRef(value);
    return ref ? [ref] : [];
  });
  return refs.length > 0 ? refs : undefined;
}
