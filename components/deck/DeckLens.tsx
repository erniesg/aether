'use client';

import { useState } from 'react';
import { PAILLETTE_SHARE_DECK } from '@/lib/deck/fixtures/paillette';
import { DeckPresentation } from './DeckPresentation';

export function DeckLens() {
  const [tab, setTab] = useState<(typeof PAILLETTE_SHARE_DECK.drawerTabs)[number]>('Product');
  return (
    <main data-taxonomy="output" className="relative flex min-w-0 flex-1 overflow-hidden">
      <DeckPresentation
        deck={PAILLETTE_SHARE_DECK}
        presenterMode={false}
        liveDemoFocus={tab}
        onLiveDemoFocusChange={setTab}
      />
    </main>
  );
}
