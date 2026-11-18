# Source: impeccable

- Upstream: https://github.com/pbakaus/impeccable (built Claude variant: .claude/skills/impeccable)
- Commit SHA (HEAD): d41d9860b0094dcb68030657da63461212835aaa
- Date fetched: 2026-11-17
- Skill version: 4.9.2
- Licence: Apache-2.0 (LICENSE, copyright 2025 Paul Bakaus); NOTICE.md carries third-party notices.
- Files copied (unmodified): SKILL.md, LICENSE, NOTICE.md, reference/adapt.md reference/animate.md reference/audit.md reference/bolder.md reference/clarify.md reference/colorize.md reference/component-review.md reference/craft-floor.md reference/craft.md reference/critique-rubric.md reference/critique.md reference/delight.md reference/distill.md reference/document.md reference/extract.md reference/harden.md reference/init.md reference/layout.md reference/mode-operate.md reference/mode-persuade.md reference/mode-read.md reference/new-work-comp.md reference/new-work-world.md reference/new-work.md reference/onboard.md reference/operate.md reference/optimize.md reference/overdrive.md reference/polish.md reference/quieter.md reference/region-map.md reference/routing.md reference/shape.md reference/typeset.md 
- Deliberately left out:
  - scripts/ (launcher binary downloader, live-browser JS, engine checksums): executables and code that makes network calls.
  - hooks, settings.json, agents/, plugin/ packaging.
  - reference/ for live, live-setup, generate, hooks, doctor, foundations, degraded/ (depend on the scripts or browser injection).
  - Native-platform references (ios, android, *.native.md): this repo is a web prototype.
- Caveat: SKILL.md and several references tell the agent to run scripts/impeccable (Setup step 1). That launcher is NOT vendored and must NOT be fetched or run. Use the "Launcher unavailable" path in SKILL.md: read PRODUCT.md and DESIGN.md directly, if present, and continue.
