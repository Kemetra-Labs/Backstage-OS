# Project skills

Vendored, unmodified copies of two design skills. Both are Apache-2.0; licences sit next to each skill.

| Skill | Use it for in this project |
|---|---|
| `frontend-design` | Visual composition and aesthetic direction: palette, type, layout concept, avoiding templated defaults. |
| `impeccable` | Layout, typesetting, critique, audit, polish (also adapt, clarify, harden, distill, animate). |

## Use in Claude Code
Open the repo in Claude Code; project skills load automatically. Invoke `/frontend-design`, or `/impeccable critique|audit|polish|layout|typeset <target>`. Ask for a plan first, since the prototype's rules in `CLAUDE.md` still win (English plus Arabic/RTL, unknown is never Healthy, demo data only).

Do not run `scripts/impeccable`: it is not vendored (it downloads a binary). Impeccable's "Launcher unavailable" path applies.

## Pinned sources
- frontend-design: anthropics/skills @ e4bb5d960d87126ff3b3a8af1a104b7db67560ba
- impeccable: pbakaus/impeccable @ d41d9860b0094dcb68030657da63461212835aaa (v4.9.2)

Details and omitted files: see each skill's `SOURCE.md`. To update, re-fetch from the pinned repos and bump the SHAs.
