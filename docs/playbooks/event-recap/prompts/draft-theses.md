# Prompt: draft-theses

Generates 1-3 candidate thesis statements for an event recap, given metadata + stakeholder roster. Used at step 2 of the playbook.

## When to use
- After scope + stakeholder identification (steps 0-1), before frontier derivation (step 3)
- When the analyst wants the agent to propose candidate framings rather than commit upfront

## Input contract

```json
{
  "event": {
    "name": "AI Engineer Summit Singapore 2026",
    "dates": "2026-MM-DD to 2026-MM-DD",
    "venue": "Capitol Kempinski + Pullman",
    "city": "Singapore",
    "contextHint": "AI engineering summit; Vivian Balakrishnan keynote; OpenAI Codex booth; LlamaIndex workshops; Road to AIE side events"
  },
  "stakeholders": {
    "speakers": [{ "name": "Vivian Balakrishnan", "role": "keynote", "company": "Foreign Affairs Singapore" }, ...],
    "sponsors": ["OpenAI", "Google DeepMind", "Cursor", "Vercel", "Cerebras", ...],
    "brands": ["Codex", "NanoClaw", "Raspberry Pi", "LlamaIndex", "Reachy"],
    "highlights": ["Vivian keynote", "Codex booth", "Reachy rap battle", "Road to AIE hackathon"],
    "participants": ["65labs", "scholarship students", "AI Tinkerers crowd"]
  },
  "priorEvents": ["AIE 2025 recap notes if returning event"]
}
```

## Instructions

You are drafting 1-3 candidate theses for an event recap. Each thesis is one sentence that names a framing of "what AIE 2026 was". The theses will be played against the corpus once gathered; weak theses get dropped, strong ones get balanced into a final synthesis.

Constraints:
- **1-3 theses, never more**. More than 3 burns analyst cycles without value.
- **Each thesis names a different framing** — keynote-driven vs scene-driven vs craft-driven, or similar. Don't draft three variations of the same framing.
- **Each thesis is one sentence**, present-tense or past-tense (match the recap voice).
- **Each thesis names specific actors/brands/highlights** — generic "AIE 2026 was great" is rejected.
- **Each thesis is falsifiable** — the corpus could clearly support or refute it.

Diversity heuristic — when drafting multiple, span at least 2 of these framings:
- **Keynote / highlight-driven** — "X's keynote was the story"
- **Scene / participant-driven** — "Event Y was Z claiming the builder hub designation"
- **Craft / output-driven** — "Event Y was workshops + tool W taking center stage"
- **Sponsor / ecosystem-driven** — "Event Y was the partner room and what the booths surfaced"
- **Tension-driven** — "Event Y was the debate over Q"

## Output contract

```json
{
  "candidates": [
    {
      "id": "T1",
      "framing": "keynote-driven",
      "statement": "Vivian Balakrishnan's builder keynote was AIE 2026 — the Foreign Minister demonstrating personal-AI workflows became the story that travelled.",
      "angles_emphasized": ["speakers", "highlights"],
      "angles_background": ["sponsors", "brands", "participants"],
      "likely_evidence_anchors": ["briefed on", "NanoClaw", "Raspberry Pi", "second brain", "Vivian"]
    },
    {
      "id": "T2",
      "framing": "scene-driven",
      "statement": "...",
      ...
    },
    {
      "id": "T3",
      "framing": "craft-driven",
      "statement": "...",
      ...
    }
  ],
  "rationale": "<one short paragraph explaining why these three framings span the event's likely narrative space>"
}
```

## Example output for AIE 2026

```json
{
  "candidates": [
    {
      "id": "T1",
      "framing": "keynote-driven",
      "statement": "Vivian Balakrishnan's builder keynote was AIE 2026 — the Foreign Minister demonstrating personal-AI workflows became the story that travelled.",
      "angles_emphasized": ["speakers", "highlights"],
      "angles_background": ["sponsors", "brands", "participants"],
      "likely_evidence_anchors": ["briefed on", "NanoClaw", "Raspberry Pi", "second brain", "Vivian"]
    },
    {
      "id": "T2",
      "framing": "scene-driven",
      "statement": "AIE 2026 was Singapore claiming the AI builder hub designation — local ownership, 65labs, students in the room, regional energy.",
      "angles_emphasized": ["participants", "sponsors"],
      "angles_background": ["highlights"],
      "likely_evidence_anchors": ["65labs", "student tickets", "Sherry Jiang", "Agrim Singh", "Singapore scene", "regional builders"]
    },
    {
      "id": "T3",
      "framing": "craft-driven",
      "statement": "AIE 2026 was workshops and agentic engineering — LlamaIndex sessions, Codex hack night, x402, leadership-track software factories.",
      "angles_emphasized": ["brands", "speakers"],
      "angles_background": ["highlights"],
      "likely_evidence_anchors": ["agentic workflow", "LlamaIndex", "x402", "Codex hack night", "software factories", "workshops"]
    }
  ],
  "rationale": "Three framings span the corpus's likely narrative space: T1 captures viral-keynote engagement, T2 captures local-scene legitimacy framing, T3 captures the craft-and-tools daily work. None alone is likely to fit (see thesis-rubric.md); the landed synthesis will probably weave at least two."
}
```

## Notes for HITL mode

- Surface candidates to the analyst at **juncture A** before frontier derivation
- Analyst should review whether (a) the diversity is real (different framings, not paraphrases), (b) each is falsifiable against the corpus, (c) the angles_emphasized/background split is honest
- Reject candidates that read as sponsor PR, hindsight bias, or pure sentiment
