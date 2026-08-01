# News Room AI Tools Continuous-Camera Film — Design

## Objective

Create a 16:9 narrated film that appears to be one continuous camera move through a tactile editorial paper newsroom. The film uses generated start/end anchors, Seedance image-to-video transitions, real News Room AI Tools recordings, and deterministic Remotion typography and compositing.

## Source narration

1. “Every day, the news changes. Somehow, the chores don't.”
2. “Readers see a market chart and understand the day in seconds. What they don't see is the work behind it.”
3. “When the market closes, the routine begins.”
4. “Why are we still doing this?”
5. “News Room AI Tools killed Ctrl+C, Ctrl+V with AI — turning one click into a daily financial summary.”
6. “Behind the scenes, it monitors data and creates editable copy and charts for print and digital — with humans in the loop.”
7. “This isn't about automating journalism. It's about removing the grunt work around it.”
8. “Now take that simple idea and scale it: earnings, statistical releases, property graphics — even social media.”
9. “Every day brings a new story. The work around it shouldn't be the same old story.”
10. “News Room AI Tools: giving journalists more time for the work that matters.”

Punctuation may be normalized for narration, but the words and meaning stay unchanged.

## Continuity contract

Ten narrative scenes use eleven shared anchor frames, `F00` through `F10`.

- Scene 1 uses `F00` as its first frame and `F01` as its last frame.
- Scene 2 uses the exact `F01` file as its first frame and `F02` as its last frame.
- This continues through Scene 10, which runs from `F09` to `F10`.
- A boundary is never regenerated independently. The preceding clip's last-frame input and the following clip's first-frame input point to the same PNG.
- Seedance motion prompts preserve one left-to-right camera vector, with motivated pushes, pullbacks, and occlusion wipes. No unexplained direction reversals.
- Remotion may overlap adjacent clips by 2–4 frames, but it must not conceal a mismatched anchor.

## Visual identity

Use a hybrid editorial style:

- Black-and-white documentary photo cutouts for people and hands.
- Precise flat layered paper geometry for desks, keys, screens, cards, charts, and transitions.
- Visible scissor/craft edges, restrained halftone texture, paper grain, and shallow physical shadows.
- Palette: warm cream, black, deep navy, teal, brick red, and small mustard accents.
- 16:9, 1920×1080 delivery framing with protected caption and interface safe areas.
- No generated letters, keyboard labels, headlines, charts, logos, UI, or pseudo-text. All precise content is added in Remotion.
- Avoid drifting textures, melting paper, warped screens, extra fingers, generic 3D rendering, gradients, and decorative clutter over replaceable surfaces.

## Anchor frames

### F00 — Changing news, unchanged desk

A wide newsroom desk at a low three-quarter angle. Changing city/news reference cutouts occupy the background. A blank stack of cream paper and unchanged mug sit in the foreground. The camera begins at the left edge of the newsroom.

### F01 — Reader and market-page portal

A documentary cutout reader at a café, seen from behind, holding a large blank cream broadsheet. Marina Bay is simplified into layered teal paper. The page is nearly frontal and large enough to become a transition portal. No text or chart is generated.

### F02 — Work hidden behind the page

The camera has moved behind the broadsheet. A dense but readable mechanism of paper strips, data cards, hands, and repeated blank modules feeds the simple front page. The visual leads toward a dark newsroom doorway at frame right.

### F03 — Market-close desk

A wide newsroom after hours. Most desks are dark; one pool of warm light remains. Repeated blank cards begin entering a mechanical paper track. The camera continues rightward toward the active desk.

### F04 — Precise copy/paste machine

Macro mechanical composition with two oversized blank keycaps, paper-card conveyors, and one documentary hand. The keycap faces are clean and flat so Remotion can add exact `CTRL+C` and `CTRL+V` labels. The repeated paper path feels exhausting and absurd, not futuristic.

### F05 — One-click AI and demo entry

The two-key mechanism has collapsed into one illuminated blank action key. A completed paper card travels from the key toward a large, nearly frontal 16:9 monitor. The monitor display occupies approximately 65–70% of the frame and has a rigid, unobstructed rectangle. This is the principal live-demo insertion surface.

### F06 — Editable output and human review

The same monitor, bezel, desk, lighting, camera height, and screen quadrilateral remain recognizable. A journalist is now visible beside the monitor, editing with one hand. A blank print page and blank phone preview sit alongside it. The monitor, paper, and phone are unobstructed replacement surfaces. This frame demonstrates copy, chart, print, digital, and human approval.

### F07 — Journalism foreground, grunt work background

The camera moves past the monitor to a journalist interviewing, reviewing notes, or writing original analysis in the foreground. Behind them, the repetitive paper-card mechanism runs quietly and recedes into soft focus. The composition clearly distinguishes journalism from surrounding production chores.

### F08 — Scale-out wall

The camera pulls back to reveal four linked paper-framed displays, each with a clean unobstructed 16:9 or portrait replacement region. They represent earnings, statistical releases, property graphics, and social media. Labels and content are added only in Remotion.

### F09 — New stories, reusable workflow

Multiple visually distinct story inputs—company, public statistics, property, social—flow through one stable paper pathway without becoming a dashboard. The outputs emerge as clean artboards. The camera follows one new story card toward the final newsroom area.

### F10 — Work that matters endcard

A calm journalist at a desk or in conversation, doing original reporting. Mechanical elements are absent or folded away. Large protected cream negative space sits at frame right for the News Room AI Tools end title. The camera comes to rest.

## Demo compositing

The generated images are beauty plates. Replaceable surfaces remain blank cream rather than permanently green.

For each screen-bearing anchor, create a deterministic companion matte:

- White or pure `#00FF00` only inside the screen polygon.
- Black or transparent everywhere else.
- The main monitor in `F05` and `F06` uses the same named four-corner region.
- The real recording is composited in Remotion beneath the bezel and above the background plate.
- A subtle paper texture, exposure tint, and soft reflection overlay sits above the recording.
- No generated-video motion is used during sustained interface legibility. Use a deterministic 1–2% Remotion camera drift instead.

The narration for Scene 6 receives the longest clean product view. Scene 8 uses cropped recordings or screenshots inside the four scale-out frames.

## Captions

Captions are generated from the final voice-over word timings and stored as Remotion `Caption` JSON.

- Phrase-level chunks, normally 3–7 words.
- Maximum two lines.
- Sentence case, with exact product capitalization: `News Room AI Tools`.
- Stable lower safe area for scenic shots.
- Move captions to an upper safe area during live-demo shots so they never obscure interactive UI.
- Warm cream caption card or dark navy translucent paper strip, chosen per shot for contrast.
- Current spoken phrase may receive teal or brick-red emphasis; no karaoke effect on every word.
- `Ctrl+C` and `Ctrl+V` appear as deterministic scene labels, separate from the subtitle track.
- Captions never enter or leave via hard cuts. Use short masked paper reveals and retain full readability for the spoken duration.

## Timing and audio

- ElevenLabs narration is generated before video clips.
- Store `ELEVENLABS_API_KEY` in the local environment; never commit or print it.
- Generate one audio file per narration sentence so individual pacing can be revised without regenerating the whole voice-over.
- Measure each file and add 8–14 frames of editorial breathing room where needed.
- Seedance duration is chosen from the measured narration beat, within the selected model's supported duration.
- If a sentence exceeds a model clip limit, hold a deterministic Remotion demo segment or split motion at a shared internal anchor; do not speed up narration unnaturally.
- Disable generated Seedance speech/audio for the master. The final soundtrack uses ElevenLabs narration, designed sound effects, and optional music.

## Assembly

Remotion is the master timeline and source of truth. It:

1. Places narration and derives scene durations.
2. Joins Seedance clips using their exact shared anchor frames.
3. Adds interface recordings, screenshots, screen mattes, and perspective placement.
4. Adds `CTRL+C`, `CTRL+V`, product labels, charts, and all captions.
5. Adds small deterministic camera corrections to preserve the one-camera illusion.
6. Adds paper movement, key clicks, newsroom ambience, restrained music, and the final mix.
7. Renders junction-frame reviews before the full export.

## Validation

- Every requested narration sentence is present and audible.
- Every clip boundary resolves to the same shared PNG on both sides.
- Screen polygons remain stable during live-demo holds.
- No caption obscures important product UI.
- No generated pseudo-text survives in the final edit.
- `CTRL+C` and `CTRL+V` are exact and legible.
- The four scale categories are exact and legible.
- The final title has sufficient negative space and contrast.
- Review at full speed and frame-by-frame at every boundary.
