# Playback Corpus Evidence

Reviewed on 2026-06-29 for the repo-video motion taste corpus. Media used for inspection was kept in `/tmp/aether-playback-review` and is not committed.

## Sources Reviewed

### HyperFrames PR-to-video skill drop

- Corpus id: `hyperframes-pr-to-video-skill-drop`
- Source URL: https://x.com/HeyGen/status/2069160747041763493
- Local receipt command: `yt-dlp --no-update --skip-download --print '%(title)s|%(duration)s|%(webpage_url)s' https://x.com/HeyGen/status/2069160747041763493`
- Playback receipt: 31.321s from X metadata, sampled to `/tmp/aether-playback-review/hyperframes-pr-to-video-contact.png`
- Probe receipt: H.264 video, 1280x720, AAC audio, 31.338667s
- Reviewed beats: PR prompt/comment, long PR evidence surface, agent prompt, terminal/render surface, generated video preview, create-video CTA.
- Aether mapping: `hook-card`, `agent-trace`, `code-diff-card`, `terminal-card`, `command-card`, `app-frame`, `proof-card`, `cta-card`.
- Proof boundary: public video playback was reachable through local tooling without storing the source video in the repo.

### Claude Code public agent demo

- Corpus id: `claude-agent-demo-playback-review`
- Source URL: https://www.youtube.com/watch?v=AJpK3YTTKZ4
- Local receipt command: `yt-dlp --no-update --download-sections '*22-90' -f 'bv*[height<=360]+ba/b[height<=360]/b' --merge-output-format mp4 -o '/tmp/aether-playback-review/claude-code-intro-22-90.%(ext)s' https://www.youtube.com/watch?v=AJpK3YTTKZ4`
- Playback receipt: sampled source window 0:22-1:30 to `/tmp/aether-playback-review/claude-code-intro-22-90-contact.png`
- Probe receipt: AV1 video, 640x360, Opus audio, 68.007s sampled window. The full public video metadata reported 234s.
- Reviewed beats: title/product hook, desktop invocation, terminal task prompt, to-do/progress proof, browser/app result, receipt CTA.
- Aether mapping: `hook-card`, `agent-trace`, `app-frame`, `cursor-callout`, `terminal-card`, `code-highlight-card`, `proof-card`, `cta-card`.
- Proof boundary: public YouTube playback was sampled locally; only metadata and short visual summaries are committed.

### Screen Studio polished product demo

- Corpus id: `screen-studio-product-demo-polish`
- Source URL: https://screen.studio/videos/hero/hero-demo.mp4
- Source page: https://screen.studio/
- Local receipt command: `ffprobe -v error -show_entries format=duration:stream=width,height,codec_name -of json https://screen.studio/videos/hero/hero-demo.mp4`
- Playback receipt: sampled to `/tmp/aether-playback-review/screen-studio-hero-contact.png`
- Probe receipt: H.264 video, 1280x720, 6.3s.
- Reviewed beats: actual app frame, cursor-guided spreadsheet action, menu/UI reveal, captioned social polish, compact end frame.
- Aether mapping: `app-frame`, `cursor-callout`, `ui-reveal-frame`, `caption-line`, `social-overlay`, `split-screen-compare`, `cta-card`.
- Proof boundary: public MP4 linked from Screen Studio OpenGraph metadata and directly probed.

## Adjacent Skill Pattern

The user-supplied `iart-ai/motion-skills` reference is useful for Aether's reusable-skill packaging pattern, not as one of the three playback rows. The repo describes installable motion skills for short-form vertical video, explainers, product demos, kinetic typography, data animation, WebGL, Manim, and Remotion, with a deliver-and-verify loop using frame renders, contact sheets, and MP4 probes.

Reference URL: https://github.com/iart-ai/motion-skills

## Import Rules

- Store source URLs, playback status, timing, component ids, effect tags, caption style, crop target, transition notes, CTA, and proof boundary.
- Do not commit downloaded videos, screenshots, contact sheets, or complete post captions.
- Prefer public playback sources. X examples can be used when local metadata and video playback are reachable without storing media.
- Keep reviewed examples provider-agnostic: they teach Aether's motion grammar, not a hardcoded video model.
