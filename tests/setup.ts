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

// tldraw asks canvas for a 2D context while mounting pattern fills / shape
// indicators. jsdom exposes `getContext` but throws "not implemented", which
// shows up as an unhandled error after otherwise-passing tests. Return a tiny
// inert 2D-like surface instead.
if (typeof HTMLCanvasElement !== 'undefined') {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: () => ({
      canvas: null,
      fillRect: () => {},
      clearRect: () => {},
      getImageData: () => ({ data: new Uint8ClampedArray(4) }),
      putImageData: () => {},
      createImageData: () => ({ data: new Uint8ClampedArray(4) }),
      drawImage: () => {},
      beginPath: () => {},
      closePath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      fill: () => {},
      rect: () => {},
      arc: () => {},
      save: () => {},
      restore: () => {},
      translate: () => {},
      scale: () => {},
      rotate: () => {},
      setTransform: () => {},
      transform: () => {},
      clip: () => {},
      fillText: () => {},
      measureText: () => ({ width: 0 }),
    }),
  });
  Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', {
    configurable: true,
    value: () =>
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9ZwkmBYAAAAASUVORK5CYII=',
  });
}

// jsdom's `document.fonts` is absent / non-iterable, but tldraw's font
// manager iterates it during mount. Provide the tiny iterable surface it uses.
if (typeof globalThis !== 'undefined' && typeof globalThis.FontFace === 'undefined') {
  class MockFontFace {
    family: string;
    source: string;
    descriptors?: FontFaceDescriptors;
    status: FontFaceLoadStatus = 'loaded';

    constructor(family: string, source: string, descriptors?: FontFaceDescriptors) {
      this.family = family;
      this.source = source;
      this.descriptors = descriptors;
    }

    load() {
      return Promise.resolve(this);
    }
  }

  Object.defineProperty(globalThis, 'FontFace', {
    configurable: true,
    value: MockFontFace,
  });
}

if (typeof document !== 'undefined') {
  const fonts = document.fonts as
    | (FontFaceSet & { [Symbol.iterator]?: () => IterableIterator<FontFace> })
    | undefined;
  if (!fonts || typeof fonts[Symbol.iterator] !== 'function') {
    const store = new Set<FontFace>();
    type MockFontSet = {
      ready: Promise<void>;
      check: () => boolean;
      load: () => Promise<never[]>;
      add: (font: FontFace) => MockFontSet;
      delete: (font: FontFace) => boolean;
      has: (font: FontFace) => boolean;
      clear: () => void;
      forEach: (cb: (value: FontFace, value2: FontFace, set: MockFontSet) => void) => void;
      values: () => IterableIterator<FontFace>;
      keys: () => IterableIterator<FontFace>;
      entries: () => IterableIterator<readonly [FontFace, FontFace]>;
      addEventListener: () => void;
      removeEventListener: () => void;
      [Symbol.iterator]: () => IterableIterator<FontFace>;
    };
    let fontSet: MockFontSet;
    fontSet = {
      ready: Promise.resolve(),
      check: () => true,
      load: async () => [],
      add: (font: FontFace) => {
        store.add(font);
        return fontSet;
      },
      delete: (font: FontFace) => store.delete(font),
      has: (font: FontFace) => store.has(font),
      clear: () => store.clear(),
      forEach: (cb: (value: FontFace, value2: FontFace, set: MockFontSet) => void) => {
        store.forEach((font) => cb(font, font, fontSet));
      },
      values: () => store.values(),
      keys: () => store.values(),
      entries: function* () {
        for (const font of store) yield [font, font] as const;
      },
      addEventListener: () => {},
      removeEventListener: () => {},
      [Symbol.iterator]: () => store.values(),
    };
    Object.defineProperty(fontSet, 'size', {
      configurable: true,
      get: () => store.size,
    });
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: fontSet,
    });
  }
}
