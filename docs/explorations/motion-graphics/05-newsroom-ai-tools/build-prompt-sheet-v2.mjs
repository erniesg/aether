import {writeFileSync} from 'node:fs';

const output = new URL('./newsroom-ai-120-prompts-v2.md', import.meta.url);

const script = [
  "Every day, the news changes. Somehow, the chores don't.",
  "Readers see a market chart and understand the day in seconds. What they don't see is the work behind it.",
  "When the market closes, the routine begins.",
  "Why are we still doing this?",
  "News Room AI Tools killed Ctrl+C, Ctrl+V with AI — turning one click into a daily financial summary.",
  "Behind the scenes, it monitors data and creates editable copy and charts for print and digital — with humans in the loop.",
  "This isn't about automating journalism. It's about removing the grunt work around it.",
  "Now take that simple idea and scale it: earnings, statistical releases, property graphics — even social media.",
  "Every day brings a new story. The work around it shouldn't be the same old story.",
  "News Room AI Tools: giving journalists more time for the work that matters.",
];

const styles = {
  A: {
    name: 'Singapore Newsprint Photomontage',
    prompt: 'Mixed-media editorial newsprint photomontage. Use black-and-white documentary photographic cutouts with visible white scissor edges, restrained torn blank newsprint, flat color blocks, halftone texture, and real paper grain. Palette: warm cream, black, teal, and brick red, with no other saturated colors. People must read as contemporary Singapore newsroom staff through explicit Chinese Singaporean, Malay Singaporean, and Indian Singaporean casting, natural office clothing, and local context; avoid generic Western stock-photo casting. Layers are designed to slide flat with parallax; no morphing.',
  },
  B: {
    name: 'Precision Layered Paper Cutout',
    prompt: 'Precision flat layered paper-cut illustration. Use crisp stacked construction-paper shapes, exact rectangular geometry, subtle physical paper texture, and controlled shallow shadows between layers; no rounded toy-like forms and no generic 3D render. Palette: warm cream, deep navy, teal, brick red, and small mustard accents. Singaporean people use varied realistic skin-tone papers, contemporary local office clothing, and recognizable Singapore context rather than generic Western silhouettes. Layers are designed to slide flat with parallax; no morphing.',
  },
  C: {
    name: 'Singapore Risograph Zine',
    prompt: 'Risograph editorial illustration printed with two spot inks, teal and fluorescent red, on rough off-white stock. Use coarse grain, visible but controlled misregistration, blotchy ink coverage, halftone shading, and bold flat shapes; no gradients. Singaporean people and locations must be established through explicit multicultural casting, local clothing and objects, Marina Bay, CBD, heartland, HDB, or tropical urban cues as relevant. Motion is designed as stepped printed changes, never liquid morphing.',
  },
  D: {
    name: 'Singapore Kirigami Pop-Up',
    prompt: 'Handcrafted kirigami pop-up book diorama photographed macro. Use cut and folded cardstock in precise layered planes, real cast shadows, visible paper fibre, craft-knife edges, kraft brown, off-white, dusty teal, and restrained brick-red accents. Singaporean people and locations must be established through multicultural miniature figures, local newsroom clothing, Marina Bay, CBD, heartland, HDB, or tropical urban cues as relevant. Paper pieces hinge and slide on tracks; they never melt, stretch, or bend like rubber.',
  },
};

const global = 'Create a single cinematic 16:9 landscape keyframe suitable for a 1920×1080 film. Preserve the described camera angle exactly. Reserve a clean caption-safe band covering the bottom 16% of frame unless the shot explicitly reserves an upper band. Newspapers, proof sheets, whiteboards, charts, phones, and ordinary screens stay completely blank warm cream unless a chroma surface is explicitly requested. Do not generate letters, numbers, headlines, mastheads, chart marks, keyboard glyphs, UI, logos, watermarks, or pseudo-text. Precise labels, charts, captions, and product recordings are composited later in Remotion or After Effects.';
const negative = 'Negative prompt: generic Western newsroom, American city, European city, tourism poster, Singapore flags, publication logos, fake words, pseudo-text, random glyphs, readable headlines, generated charts, distorted hands, extra fingers, warped rectangles, rounded toy keyboard, melting paper, morphing shapes, drifting texture, gradients, glossy generic CGI, clutter crossing a replacement surface, green spill outside an explicitly requested chroma region.';

const scenes = [
  {
    variants: [
      ['Wide — the desk that never changes', 'A contemporary Singapore newsroom desk at a low three-quarter angle. The foreground desk, a blank cream paper stack, and one kopi mug remain visually still. Behind them, rectangular story-reference panels show varied Singapore contexts—CBD towers, HDB heartlands, tropical rain, port activity—without text, arranged to imply rapid replacement. The camera begins at frame left and leads right. Keep the lower caption band dark and uncluttered.'],
      ['Detail — the same mug, the same stack', 'Macro on the unchanged corner of a Singapore newsroom desk: one kopi mug, one exact stack of blank cream paper, and two curled blank notes. Behind the objects, hard-edged light shapes imply a rapid shift from humid daylight to night. Nothing overlaps the paper stack. Locked foreground, lateral visual flow toward frame right.'],
      ['Graphic — motion above, loop below', 'Split composition. The upper portion contains rapidly changing Singapore story imagery—CBD, HDB, port, rain, transport—represented as distinct blank-edged panels. The lower portion contains one perfectly aligned row of identical blank grey work cards repeating in a closed loop. No people. Keep the contrast high and the caption band clear.'],
    ],
  },
  {
    variants: [
      ['Over shoulder — the reader at the café', 'Exact over-the-shoulder view of a Singaporean Chinese male reader seated at a contemporary kopitiam or café table, seen from behind. His head and shoulders occupy the lower-left third. Both hands naturally hold the outer edges of a large open broadsheet. The visible page is one rigid, nearly frontal, completely blank warm-cream rectangle occupying much of the center, reserved for a composited market chart. A kopi cup and tiny tropical plant stay at the extreme edge and never cross the page. Marina Bay and the Singapore CBD appear behind him in restrained layered form. The camera pushes forward over his shoulder into the page.'],
      ['Detail — hands on the broadsheet', 'Macro on anatomically correct Singaporean reader hands gripping the two outer edges of a large completely blank warm-cream broadsheet. The page is nearly frontal, rigid, centered, and unobstructed for later chart compositing. A kopi cup and small tropical plant appear only at the far edge. Use shallow focus while keeping the full page boundary crisp. Reserve the upper-right exterior for captions.'],
      ['Reveal — behind the simple page', 'A large blank warm-cream broadsheet fills the left two-thirds of frame. The camera has begun gliding behind it, revealing a dense but readable tangle of repeated data cards, paper strips, file modules, and newsroom fragments feeding into the clean page from the back. Include subtle Singapore CBD geometry and multicultural newsroom fragments, but no readable content. Direct the tangle toward a dark doorway at frame right.'],
    ],
  },
  {
    variants: [
      ['Wide — the Singapore newsroom empties', 'Wide view of a contemporary Singapore financial newsroom emptying after market close. Chinese Singaporean, Malay Singaporean, and Indian Singaporean staff leave naturally in the distance until one seated journalist remains. Deep teal windows reveal a restrained Singapore CBD dusk silhouette. A brick-red or mustard sun shape sinks behind the buildings. The camera travels laterally toward the remaining lit desk.'],
      ['Detail — one lamp left on', 'Macro on one newsroom desk lamp switching on as the Singapore newsroom falls into deep navy and black. A single warm cream rectangle of light lands on an exact stack of blank proof pages. The long hard-edged shadow points toward frame right. No other people or screens in frame.'],
      ['Graphic — the market stops, the belt starts', 'A clean abstract market-line shape rises, becomes perfectly horizontal, and drains to grey without numbers or labels. From frame left, a conveyor of identical blank grey work cards begins moving steadily toward frame right. No people. Keep the shapes exact and the lower caption band clear.'],
    ],
  },
  {
    variants: [
      ['Hands — the copy-paste loop', 'Tight locked-off macro of anatomically correct Singaporean office-worker hands at a conventional newsroom keyboard. Two oversized adjacent keycap faces near center are perfectly blank, flat, rectangular, front-facing, and unobstructed, reserved for deterministic overlays reading Ctrl+C and Ctrl+V. One index finger is poised over each key. Identical blank paper rectangles stack beside the keyboard, creating an absurdly tall column. No factory, conveyor, reels, or background people. Reserve a dark upper caption band.'],
      ['Overhead — the tower grows', 'Exact overhead view of one Singaporean journalist at a desk repeating the same keyboard gesture. Two central blank keycap faces remain clearly visible and reserved for Ctrl+C and Ctrl+V overlays. A comically tall column of identical blank paper rectangles grows beside the worker and begins to lean. Torn blank newsprint frames the composition. No background people.'],
      ['Graphic — the duplication stutter', 'Extreme close-up of one blank grey work card being lifted, duplicated, and placed beside an identical card, creating a rigid visual stutter. Two empty rectangular label tabs at the lower edge are reserved for Ctrl+C and Ctrl+V overlays. No hands unless anatomically correct, no people, and no text. Camera completely static.'],
    ],
  },
  {
    variants: [
      ['Action — one click assembles the summary', 'A documentary hand presses one large perfectly blank action key at lower left. The tall column of repeated blank work cards breaks apart into separate pieces that align into one clean blank financial-summary page layout at center-right. A brick-red circle snaps behind the completed page. The page contains no chart marks or text and remains suitable for later compositing.'],
      ['Detail — the single press', 'Extreme macro on one large perfectly blank action key being pressed by one anatomically correct documentary hand. The key face is flat, rigid, and front-facing so a one-click icon can be overlaid later. The surrounding frame shifts from repetitive grey paper to warm cream and teal. No other keys, labels, or people.'],
      ['Graphic — the transformation wave', 'A restrained brick-red pulse travels from left to right along a grey repeated-card pathway. Everything it passes separates into crisp torn-paper fragments and reassembles into one clean blank cream page layout at frame right. No liquid swirl, no morphing geometry, and no generated content on the page.'],
    ],
  },
  {
    variants: [
      ['Demo hero — editor and live monitor', 'Over-the-shoulder view of a Singaporean Indian female financial journalist seated on the left third, reviewing a large professional monitor on the right two-thirds. Her right hand holds a red pen above a blank cream proof sheet; her other hand rests near the keyboard, making human review unmistakable. The monitor is nearly front-facing with a rigid black or deep-navy rectangular bezel. Inside it is one perfectly uniform solid #00FF00 chroma-green 16:9 rectangle occupying at least half the full frame. The green area has no texture, shadow, reflection, gradient, glare, hand, hair, object, or bezel intrusion. Do not use green anywhere else. Reserve the upper-left band for captions.'],
      ['Demo detail — human adjustment beside the screen', 'Tight three-quarter view of a large nearly frontal professional monitor with a rigid rectangular bezel and a perfectly uniform solid #00FF00 chroma-green 16:9 display. A Singaporean Malay male journalist is visible at the far left edge, reaching toward a mouse or pointing with a red pen, but the hand never crosses the green display. A blank proof sheet sits below the monitor. The green surface occupies most of frame and green appears nowhere else. Reserve the upper-left exterior for captions.'],
      ['Print and digital — editable outputs', 'A precise Singapore newsroom desk composition with one large nearly frontal professional monitor, one upright portrait phone, and one flat print proof. The monitor display and phone display are perfectly uniform solid #00FF00 chroma-green rectangles with no texture, reflection, gradient, or overlap; green appears nowhere else. The print proof stays completely blank warm cream for separate layout compositing. A Singaporean Chinese female journalist hand with a red pen rests beside the proof without crossing any replacement surface. Keep each boundary crisp and independently maskable.'],
    ],
  },
  {
    variants: [
      ['Two journalists — the conversation', 'Two Singaporean journalists—one Chinese Singaporean woman and one Malay Singaporean man—lean toward each other in genuine conversation over a desk. One holds a worn blank notebook. Their documentary interaction is the hero; all machinery and screens are absent. A large restrained brick-red circle sits behind them. Keep the lower caption band clear.'],
      ['Detail — the reporter notebook', 'Macro on a worn spiral reporter notebook with pages turned away or blurred so no writing is readable, resting beside a conventional keyboard and red pen. The notebook is the hero. Warm newsroom light, subtle Singapore desk context, no screen, no machinery, no generated text.'],
      ['Graphic — journalism and tools interlock', 'Two distinct forms on a warm cream ground: one rigid geometric grid representing tools and one loose organic torn-paper form representing journalism. They move toward each other and interlock without merging or replacing one another. No people, text, logos, or screens. Keep the visual human and editorial rather than technological.'],
    ],
  },
  {
    variants: [
      ['Multiply — one output becomes four', 'One central clean output frame expands into four clearly separated paper-framed replacement displays. The four interiors are perfectly uniform solid #00FF00 chroma green and green appears nowhere else. Arrange them as two landscape displays, one portrait property artboard, and one portrait social artboard. Every surface is rigid, unobstructed, non-overlapping, and independently maskable. The four frames can later receive earnings, statistical releases, property, and social recordings or screenshots. Reserve an upper caption band.'],
      ['Travel — past four Singapore desks', 'A single lateral-camera composition showing four distinct Singapore newsroom desks extending from left to right. Each desk has one clean professional display with a perfectly uniform solid #00FF00 chroma-green interior; green appears nowhere else. Staff representation across the four stations includes Chinese Singaporean, Malay Singaporean, and Indian Singaporean journalists in natural contemporary office clothing. No person, hand, plant, lamp, or desk object crosses any green display.'],
      ['Formats — every shape at once', 'A precise grid of independently maskable replacement frames: wide broadsheet, landscape chart, square tile, portrait phone, and vertical social format. Every frame interior is perfectly uniform solid #00FF00 chroma green; green appears nowhere else. All frames are rigid, evenly separated, non-overlapping, and shown close to frontal. Use restrained Singapore newsroom texture only around the outer border. No people.'],
    ],
  },
  {
    variants: [
      ['Slide — new Singapore stories keep coming', 'A continuous row of blank story cards slides laterally across frame. Each card uses imagery outside its blank content area to suggest a different Singapore story: CBD earnings, public statistics, HDB property, transport, weather, port, community, or mobile social coverage. The cards remain free of text and charts. Foreground torn edges create speed while preserving a clean lower caption band.'],
      ['Aerial — the whole newsroom alive', 'High-angle view of a multicultural Singapore newsroom with every desk active. Chinese Singaporean, Malay Singaporean, and Indian Singaporean staff move naturally between desks. A wide sweep of warm light crosses the space as the camera rises. Screens and pages remain blank; avoid crowding the image with tiny illegible details.'],
      ['River — varied stories pass the camera', 'A stream of varied blank story cards and Singapore documentary fragments flows toward the camera and passes on both sides. Include recognizable but restrained fragments of the CBD, HDB heartlands, port, rain, transport, property, and community life. Every card differs in shape or outer imagery but contains no text or chart marks. Fast forward travel with crisp paper edges.'],
    ],
  },
  {
    variants: [
      ['Whiteboard — the endcard frame', 'Everything clears toward frame left, leaving two Singaporean journalists mid-conversation beside a completely blank whiteboard on the left third. Use one Chinese Singaporean journalist and one Indian Singaporean journalist in natural contemporary newsroom clothing. A large pristine warm-cream area fills the right half for the News Room AI Tools end title. Camera comes to rest.'],
      ['Quiet — one journalist writing', 'One Singaporean journalist sits at a desk writing by hand in a notebook, unhurried and focused on original reporting. Warm cream light falls across the desk. All mechanical workflow elements are absent. The right half remains a large clean warm-cream negative-space area for the final title and caption. Camera static.'],
      ['Clear — the work remains human', 'Nearly every production element has cleared away, leaving a plain warm-cream ground, one small kopi cup at lower left, and a subtle torn newsprint edge along the bottom. The right two-thirds remain pristine for the final title. No people, text, charts, logos, or screens. Camera completely at rest.'],
    ],
  },
];

const variantLabels = ['.1', '.2', '.3'];
const lines = [
  '# News Room AI Tools — Full Prompt Sheet v2',
  '',
  '120 complete prompts: **4 styles × 10 script scenes × 3 shot variants**.',
  '',
  '## Production rules',
  '',
  '1. Style A is recommended for the final film because it preserves the original over-shoulder newspaper, photographic Singaporean people, and editorial tone.',
  '2. Use one fixed seed per style where the selected generator exposes seed control.',
  '3. All images are 16:9 keyframes. Reuse an identical boundary PNG as one Seedance clip’s last frame and the following clip’s first frame.',
  '4. Do not rely on image generation for `Ctrl+C`, `Ctrl+V`, charts, captions, headlines, or product UI. Add those deterministically in Remotion or After Effects.',
  '5. Scene 6 contains the main live product recording. Scene 8 contains the four-output scale demonstration.',
  '6. Chroma surfaces are exact `#00FF00`, completely uniform, and green appears nowhere else in those images. Derive geometric mattes after selecting the final frame.',
  '7. Proper captions come from the final voice-over word timings; generated images only reserve safe space.',
  '',
  '## Full narration',
  '',
  ...script.map((line, index) => `${index + 1}. ${line}`),
  '',
];

for (let sceneIndex = 0; sceneIndex < scenes.length; sceneIndex++) {
  lines.push('---', '', `# Scene ${sceneIndex + 1}`, '', `> *${script[sceneIndex]}*`, '');
  for (const [styleCode, style] of Object.entries(styles)) {
    lines.push(`## ${styleCode} — ${style.name}`, '');
    for (let variantIndex = 0; variantIndex < 3; variantIndex++) {
      const [title, shot] = scenes[sceneIndex].variants[variantIndex];
      const id = `${styleCode}${sceneIndex + 1}${variantLabels[variantIndex]}`;
      lines.push(`**${id} — ${title}**`, '', '```text', `${style.prompt} ${global} ${shot} ${negative}`, '```', '');
    }
  }
}

lines.push('---', '', '# Negative prompt only', '', '```text', negative.replace('Negative prompt: ', ''), '```', '');
writeFileSync(output, `${lines.join('\n')}\n`);

