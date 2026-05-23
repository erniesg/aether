# Prompt: relabel-themes

Structured-output prompt that re-labels theme labels + summaries based on top evidence posts. Mirrors `scripts/event-recap-finalize-analysis.ts:17` (`THEME_REWRITE_SCHEMA`). Used at step 13 of the playbook to produce the final theme copy.

## When to use
- After story authoring (step 11) and story assignment is complete
- Once for all themes in a single call (or chunked if many themes)

## Input contract

```json
{
  "themes": [
    {
      "themeId": "story-vivian-builder-keynote",
      "label": "Vivian Balakrishnan's builder keynote",
      "keywords": ["vivian balakrishnan", "nanoclaw", "raspberry pi", "second brain", "briefed on"],
      "postCount": 38,
      "evidence": [
        {
          "platform": "x",
          "author": "@vivianbala",
          "url": "https://x.com/...",
          "metrics": { "likes": 4200, "reposts": 1200, "replies": 380, "views": 280000 },
          "text": "Walked through how I built NanoClaw on Raspberry Pi this weekend..."
        },
        ... 6 evidence entries
      ]
    },
    ... 1 to ~15 themes
  ],
  "anchorCopy": {
    "story-vivian-builder-keynote": {
      "label": "Vivian's builder keynote",
      "summary": "Foreign Minister Vivian Balakrishnan, NanoClaw, Raspberry Pi, and the 'briefed on' line are one story: the keynote travelled because governance was framed through a minister visibly building and using his own AI workflow."
    }
  }
}
```

`anchorCopy` is optional — when provided, the LLM should treat the anchor as a fixed reference and either return it verbatim or refine only the parts that are unsupported by the new evidence. This is how `CURATED_THEME_COPY` (`scripts/event-recap-finalize-analysis.ts:75-141`) locks narrative consistency for keystone themes.

## System prompt (mirrors finalize-analysis.ts)

> You rewrite event-recap cluster labels and summaries. For each theme, output a `label` (2-5 words) and `summary` (1-2 evidence-grounded sentences, max 420 chars). Mention concrete sources or platform mix when useful. Never invent facts not present in the evidence posts. Keep every `themeId` unchanged — return one entry per supplied theme.

## User prompt template

> Rewrite these event-recap cluster labels and summaries. Keep every themeId unchanged. Return one entry per supplied theme.
>
> {{ JSON.stringify(themes) }}

When `anchorCopy` is supplied, append:

> The following themes have anchor copy that should be preferred verbatim unless the new evidence directly contradicts. Match the anchor's tone and specificity for any rewrites:
>
> {{ JSON.stringify(anchorCopy) }}

## Structured output schema (`THEME_REWRITE_SCHEMA`)

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "themes": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "themeId": {
            "type": "string",
            "description": "Existing theme id. Must match one supplied input theme id exactly."
          },
          "label": {
            "type": "string",
            "minLength": 2,
            "maxLength": 80,
            "description": "Creator-facing label, 2 to 5 words."
          },
          "summary": {
            "type": "string",
            "minLength": 20,
            "maxLength": 420,
            "description": "One or two concise evidence-grounded sentences. Mention concrete sources or platform mix when useful. Do not invent facts."
          }
        },
        "required": ["themeId", "label", "summary"]
      }
    }
  },
  "required": ["themes"]
}
```

## Output contract

```json
{
  "themes": [
    {
      "themeId": "story-vivian-builder-keynote",
      "label": "Vivian's builder keynote",
      "summary": "Foreign Minister Vivian Balakrishnan, NanoClaw, Raspberry Pi, and the 'briefed on' line are one story: the keynote travelled because governance was framed through a minister visibly building and using his own AI workflow."
    },
    {
      "themeId": "story-openai-codex-presence",
      "label": "OpenAI Codex presence",
      "summary": "OpenAI showed up through the Codex booth, technical workshops, FDE lunch chat, Gabriel Chua daily recaps, and student-seat posts that treated the workshops as core event value."
    },
    ...
  ]
}
```

## Implementation notes

The shipped finalize-analysis.ts implementation handles:
- **Full-corpus structured call** first — if it succeeds, done
- **Chunked retry** if the full call fails (chunk_size = 5 themes, then 3, then 1)
- **Anthropic / OpenAI fallback** — defaults to `claude-opus-4-7`; falls back to `gpt-4.1-mini` if Anthropic SDK unavailable; `EVENT_RECAP_FINALIZE_PRIMARY=openai` swaps order
- **Theme-id validation** — output themeIds must match input exactly; missing themeIds trigger retry

See `scripts/event-recap-finalize-analysis.ts:644-820` for the full implementation.

## Anti-patterns the schema prevents

- Labels >5 words — auto-rejected (max 80 chars but tone target is 2-5 words)
- Summaries >420 chars — auto-rejected
- Missing themeIds in output — triggers retry on missing themes
- Hallucinated themeIds — schema disallows unknown ids

## Anti-patterns the schema doesn't prevent (analyst must check at juncture E)

- Invented numbers ("over 1,000 attendees")
- Invented quotes (paraphrases mis-attributed to specific speakers)
- Sentiment dressing ("electric energy") replacing evidence
- Hallucinated cross-references ("Vivian's talk on Y" when Y wasn't his topic)
- Anchor-copy divergence (when CURATED_THEME_COPY is supplied but the LLM rewrites differently)

The `anchorCopy` mechanism is the primary defense for keystone themes — pin the keystone copy and let the LLM only fill in non-anchored themes.
