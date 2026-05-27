# Manual additions review

Refresh: `2026-05-27T07-05-28Z-human-reviewed-delta`

## Pending LinkedIn post

- URL: `https://www.linkedin.com/posts/samiahmed3_sami-ahmed-portfolio-share-7465024848935952385-UCJb/`
- Native ID: `urn:li:share:7465024848935952385`
- Submitted: 2026-05-27 during preview review
- Current candidate status: not present in `archive.candidate.json` or `public.candidate.json`
- Existing related row: Sami Ahmed comment `linkedin_5xec4p` on Louisa Ong's post, comment id `7465034595181309953`, already included as a non-root comment/context row.

Review status: pending content capture.

Why not added yet:
- Direct LinkedIn page access redirects to sign-up in the in-app browser, so the post body/media cannot be verified from the URL alone.
- Apify LinkedIn fetch is currently blocked by monthly usage hard limit exceeded.
- The URL slug alone (`sami-ahmed-portfolio-share`) is not enough event evidence to add it to the candidate.

Required before inclusion:
- Capture the post text, author, posted date, metrics, and media.
- Confirm a direct AIE Singapore / AI Engineer / side-event / traceable multiplier anchor.
- If relevant, add as a parent row only if the activity itself is substantive event evidence; otherwise keep as context or leave out.
