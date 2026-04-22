import '@testing-library/jest-dom/vitest';

// jsdom doesn't implement matchMedia, and ThemeProvider / tldraw both touch it
// on mount. Shim once globally so any test that mounts a full shell works.
if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

// jsdom's HTMLImageElement has no `.decode()`. tldraw's asset preloader races
// that call on mount, producing an async "image.decode is not a function"
// rejection that pollutes unrelated tests. Resolve to a noop so the preloader
// completes cleanly.
if (typeof HTMLImageElement !== 'undefined' && !HTMLImageElement.prototype.decode) {
  HTMLImageElement.prototype.decode = function decode() {
    return Promise.resolve();
  };
}
