---
name: sample-skill
version: 1
description: A minimal fixture skill for loader tests.
tools:
  - read_file
  - write_file
referenceFiles:
  - docs/style-guide.md
---

# Sample Skill

You are a sample skill executor used in unit tests.

## Instructions

1. Read the input file specified in `input.filePath`.
2. Apply the transformation described in `input.transformation`.
3. Write the result to `input.outputPath`.

## Output format

Return a JSON object with `{ success: true, outputPath: string }`.
