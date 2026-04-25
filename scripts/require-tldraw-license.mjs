const key = process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY?.trim();

if (!key) {
  console.error(
    [
      'Missing NEXT_PUBLIC_TLDRAW_LICENSE_KEY.',
      'tldraw hides the production canvas after its license timeout without it.',
      'Set a valid public tldraw license key before deploying staging/production.',
    ].join('\n')
  );
  process.exit(1);
}
