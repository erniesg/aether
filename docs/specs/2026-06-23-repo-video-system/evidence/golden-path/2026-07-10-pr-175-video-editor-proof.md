# PR #175 video editor proof

Date: 2026-07-10

## Source

- Pull request: `https://github.com/erniesg/aether/pull/175`
- Draft: `Primary PR explainer`
- Format: `x 9:16`, 30 fps
- Duration after edit: 32.1 seconds

## Canvas edit

- Changed the diff scene copy to: `Deck workflows now become reusable, editable creative artifacts.`
- The edit propagated to the story beat, visual, caption, and voice clips.
- Moving the diff scene start from 8.0 to 8.1 seconds rippled the following mechanism scene from 16.0 to 16.1 seconds without overlap.
- The editor exposed synchronized scene selection, direct timeline scrubbing, move/trim handles, keyboard nudging, aspect switching, effects, regeneration, approval, render, export, and canvas placement.

## Source engines

- Remotion source preparation completed with 7 files.
- HyperFrames source preparation completed with 7 files and the embedded HTML/GSAP preview runtime.
- Both engine controls remained available after either package was prepared.

## Render and export

- Renderer: `aether-draft-render`
- Output: `outputs/motion-draft-renders/renders/motion-pr-https-github-com-erniesg-aether-pull-175-1783659879582/export-x-9x16/video.mp4`
- Video: H.264, 1080x1920, 30 fps
- Audio: AAC
- Duration: 32.1 seconds
- Size: 995,264 bytes
- The matching edited line is present in `subtitles.vtt` and `transcript.txt`.
- The browser loaded the MP4 through `/api/motion/artifacts` with range requests and advanced playback time.

## Canvas return

- `place export on canvas` created a native `x 9:16 MP4` artboard to the right of the existing frames.
- The rendered video played inside that artboard; a later frame showed the mechanism scene, confirming playback continued after placement.

## Validation

- `npm test`: 350 files passed; 2,339 tests passed; 1 skipped.
- `npm run typecheck`: passed.
- Scoped ESLint for the edited runtime, editor, API, render provider, and canvas files: passed with no warnings.
- `git diff --check`: passed.
