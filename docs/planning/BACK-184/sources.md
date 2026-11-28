# BACK-184 — Official sources on Claude Artifacts (retrieved 2026-11-28)

All pages fetched live on 2026-11-28 (Firecrawl, `maxAge: 0`). Quotes are short; paraphrase otherwise.
Status key: **V** = stated in an official Anthropic source (verified as a claim, not tested by us);
**T** = tested by us in this ticket (see `benchmark.md`); **U** = unknown / not stated.

## Sources

| # | Source | Owner | Date signal |
|---|---|---|---|
| S1 | [Install an artifact as an app](https://support.claude.com/en/articles/18516354-install-an-artifact-as-an-app) | Anthropic Help Center | Beta, rollout from 2026-11-24 |
| S2 | [What are artifacts and how do I use them?](https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them) | Anthropic Help Center | Mentions dates up to 2026-11-20 |
| S3 | [Artifacts — Claude Code Docs](https://code.claude.com/docs/en/artifacts) | Anthropic docs | Mentions Claude Code v2.1.281 |
| S4 | [Release notes](https://support.claude.com/en/articles/12138966-release-notes) | Anthropic Help Center | 2026-11-24, 2026-11-12, 2026-09-16 entries |
| S5 | [Share artifacts](https://support.claude.com/en/articles/9547008-share-artifacts) | Anthropic Help Center | current |
| S6 | [Get started with Claude Data](https://support.claude.com/en/articles/17454700-get-started-with-claude-data) | Anthropic Help Center | current |
| S7 | [Plans & pricing](https://claude.com/pricing) | Anthropic | current |

Secondary press (not relied on): datanorth.ai, testingcatalog.com, alphasignal.ai. They match S1 and add nothing official.

## Facts by topic

### Runtime and platform
- **V** Installable apps: beta on Free, Pro, Max, Ultra, Team, Enterprise; Claude for Mac or Windows ≥ 6.28899.0; not on Linux, web or mobile (S1).
- **V** "To open an app, you need to be online and signed in to Claude Desktop." The app is the same artifact; editor changes flow through (S1).
- **V** An artifact is "one self-contained page with no backend"; for a hosted tool with a backend, "deploy it on your own infrastructure instead" (S3).
- **V** Strict CSP: scripts only from five CDNs; `fetch`/XHR/WebSocket only to the page's own origin and Google Fonts; connector calls go through claude.ai. "It can't authenticate viewers itself." Max rendered size 16 MiB (S3).
- **V** Artifacts that call Claude run on Anthropic's infrastructure; usage counts against each viewer's plan (S2).

### Connectors (MCP)
- **V** Pro and above: artifacts read from and write to apps connected to Claude and custom remote-MCP connectors (S2, S3).
- **V** Calls use the **viewer's** account by default; each viewer approves first; the page never sees credentials; actions with side effects run as the viewer (S3).
- **V** Exception: Claude Data "live sharing" (beta) shows org viewers results from the editor's connection, limited to the exact queries (S5, S6).
- **V** Local MCP servers (e.g. `.mcp.json`) can feed a page at build time only; the published page cannot call them (S3).
- **V** Responses cached in the viewer's browser; page can refresh on load, interval or control (S3).
- **V** Org owners have an "Enable artifact connectors" toggle; per-tool "Needs approval" policies apply (S2, S3).
- **V/U** Claude Data "doesn't refresh on a schedule", but **Refresh data** re-queries on a set interval when someone opens a dashboard that is due (S6). The Data type's own guide says a routine (scheduled task) can keep an attached file current. Installed apps with a tray icon keep running after their window closes (S1). None of these is documented as server-side ingestion into history, but a scheduled Claude routine writing into an artifact's store is a plausible Claude-native ledger (untested).

### Permissions (installed app, OS level)
- **V** Per-permission prompts: notifications, keyboard shortcuts, float over windows, menu bar/tray, full computer access (S1).
- **V** An "Allow" covers one version; any update asks again. "Anthropic doesn't review apps before you install them." (S1)
- **V** Team: on by default, full access off until admin enables; Enterprise: off until owner enables (S1).

### Persistence
- **V** Store data (Pro+): personal or shared storage; default up to 100 MB and 25,000 documents per artifact; uploads up to 20 MB each, 1 GB total (S2).
- **V** "Whoever builds an artifact decides which data uses personal storage and which uses shared." (S2)
- **U** No documented schema, transactions, row-level access policy, retention per record, or export API for artifact storage.

### Distribution and sharing
- **V** Artifacts start private. Pro/Max/Ultra: link sharing, invite by email (beta). Team/Enterprise: org or people; Enterprise: groups (S5).
- **V** Most "anyone with the link" artifacts open without a Claude account, but connector calls don't run for signed-out or out-of-org viewers (S3, S5).
- **V** Enterprise: retention policy, Compliance API activity feed for publish/share/delete (S3).
- **U** No marketplace or paid distribution channel for third-party artifacts is documented.

### Portability
- **V** Template artifacts export (Docs → Word/PDF/MD; Slides → PPTX/PDF; Design → zip/PDF/HTML) (S2).
- **V** Legacy artifacts: view/copy/download code (S2). **Publishing from Claude Code** requires a claude.ai account and the Anthropic API (not Bedrock/Vertex/Foundry), and no CMEK/HIPAA/ZDR for the org; otherwise Claude writes a local HTML file instead (S3). Installed apps: not for HIPAA-ready orgs; ZDR orgs can install but apps aren't covered by ZDR (S1).
- **U** Export of artifact storage data and of connector configuration is not documented.

### Limits and exclusions
- **V** Not for HIPAA-ready orgs; installed apps not covered by ZDR; template artifacts (Docs, Slides, Sheets, and by S2's list also Data), legacy and Cowork live artifacts can't be installed (S1, S2).
- **V** Building an app and every request it makes to Claude count toward plan usage limits (S1, S6).

### Pricing (S7, list prices on 2026-11-28)
- Free $0; Pro $20/mo ($17/mo annual); Max $100/mo; Ultra $200/mo; Team standard $25/seat/mo ($20 annual), premium $125 ($100 annual); Enterprise $20/seat/mo + usage, 20-seat minimum.
- Connectors and storage in artifacts need Pro or above (S2). So the realistic floor for a connector-backed dashboard is **$17–20 per user per month**, already paid by anyone who "already has Claude".

## What this means for the brief (claims only, testing in `benchmark.md`)
1. A connector dashboard with per-chart freshness (Claude Data) is an official, first-party feature. "Dashboard + freshness label" is not a differentiator.
2. Artifacts are viewer-scoped pages with no backend of their own and no viewer authentication. History is possible through the artifact store (100 MB / 25k documents) and, untested, a scheduled routine writing to it. The gap to a server ledger is narrower than "no backend" suggests.
3. Governance is the platform's (per-viewer connector approval, org toggles, Enterprise audit of publish/share). Per-evidence access control and audit inside the page are not documented.
