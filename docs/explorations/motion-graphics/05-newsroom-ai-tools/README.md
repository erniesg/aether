# Newsroom AI Tools — SPH Staff Awards video draft

A voiceover-timed Remotion treatment in three selectable visual styles:

- `NewsroomAI-Scrapbook` — tactile mixed-media scrapbook
- `NewsroomAI-Newsprint` — high-contrast newsprint photomontage
- `NewsroomAI-Kirigami` — dimensional kirigami pop-up

All three compositions share the same 34-second edit, exact voiceover, background music, scene timing, and story structure. The supplied voiceover is 32.99 seconds; the extra second lets the award lock-up and music resolve cleanly.

## Image-generation prompt sheet

[`newsroom-ai-120-prompts-v2.md`](./newsroom-ai-120-prompts-v2.md) contains the revised 120-prompt matrix with Singapore-specific casting and locations, restored original shot compositions, caption-safe areas, precise `Ctrl+C` / `Ctrl+V` overlay reservations, and chroma-ready demo surfaces for Scenes 6 and 8.

## Preview

```bash
npm install
npm run studio
```

## Render

```bash
npm run render:scrapbook
npm run render:newsprint
npm run render:kirigami
```

The major scene changes are aligned to the voiceover phrases and the nearest beat in the supplied 152 BPM music track.
