# AGENTS.md

`crabyard` changes should stay focused, data-safe, and aligned with the existing
repo workflows.

## Rules

- Do not commit credentials, live config, generated build output, private app
  data, or local cache/state files.
- Keep package and release workflow changes narrow and reviewable.
- Update docs when command flags, package surfaces, or setup behavior change.
- Prefer existing tooling and local patterns before adding dependencies.

## Checks

Run the smallest relevant gate first, then the repo's full check before handoff
when runtime behavior changed. For setup-only changes, use:

```bash
git diff --check
```
