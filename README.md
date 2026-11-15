# Backstage-OS · Kemetra Mission Control (prototype)

Internal review prototype of Kemetra Labs' Unified Mission Control: portfolio, investigation, decisions and agent
visibility for authorized Kemetra staff (Owner, Technical, Non-Technical personas).

**Everything shown is demo data.** No backend, no real GitHub/Jira/Sentry/Datadog/Port access, no AI calls, no
authentication, and no customer or tenant data. Nothing in the UI is live production telemetry.

Product name is "BackStage / Mission Control". A future brand is not decided.

## Run locally

It is plain HTML/CSS/JS, so there is no build step and no package manager. Serve the folder with any static server:

```bash
python -m http.server 8765 --bind 127.0.0.1
```

Then open <http://127.0.0.1:8765/>. Fonts load from Google Fonts (the only external request).

## Using it

- Top bar: project filter, persona switch (Owner / Technical / Non-technical), source-state popover, EN / عربي.
- Source-state popover: simulate **Normal**, **Stale** (9 h old) or **Unavailable**, and **Reset demo**.
  Unknown and unavailable data are never shown as healthy.
- `Ctrl K` (or `Cmd K`) opens search.
- English is the working language. Arabic translations and RTL layout are kept and switchable.
- Review hook: `?s={"persona":"tech","tab":{"inv":"evidence"}}` seeds state for screenshots.

## Structure

```
index.html        shell; loads css/app.css and the scripts below, in order
css/app.css       the single stylesheet
js/data.js        demo data: projects, risks, decisions, evidence, investigations
js/data2.js       demo data: customers, branches, richer investigation fields
js/core.js        state (S), helpers, icons, charts, reset
js/shell.js       navigation, top bar, drawers, command palette, event wiring
js/home.js ... js/network.js    screens
js/war.js, v3.js, v4.js, v5.js  later passes that override earlier definitions
js/boot.js        restore preferences, first render
```

### Load order matters

Later scripts deliberately **override** earlier definitions by reassigning the same global names
(for example `mapSVG`, `warGraph`, `overviewTab`, `projectCard` and `SCREENS.home`/`SCREENS.investigation`). The
active definition is the last one in `index.html` order, so check `v3.js` to `v5.js` and `war.js` before editing an
earlier file. Do not reorder the `<script>` tags.

## Scope

Prototype only. Out of scope: backend or control plane, source-system adapters (MCP/REST/webhooks), AI provider
calls, agent execution, authentication and permissions, deployment.
