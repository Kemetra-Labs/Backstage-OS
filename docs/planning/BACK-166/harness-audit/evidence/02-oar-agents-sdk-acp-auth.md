# DSH 841f76d (dsh-v0.2.3-alpha.3): external agents, subagents, SDK, ACP, auth

Base B = https://github.com/deepseek-ai/deepseek-harness/blob/841f76d3c51966375ebed9b25512ebce4ac02079/
Labels: SOURCE (code) / DOC (README/note) / INFERENCE. The clone has no node_modules, so the OAR library (@botiverse/oar 0.67.0) and pi-ai are NOT inspectable; only DSH's patch to OAR is.

## 0. Three distinct native-agent paths (do not conflate)
| Path | Package | How native agent runs | Status |
|---|---|---|---|
| OAR (experimental) | packages/experimental/subagent-oar + tool-subagent-oar | embedded third-party lib @botiverse/oar 0.67.0 (Apache-2.0) spawns the user's INSTALLED claude/codex CLI | experimental, opt-in profile patch |
| Fixed Claude provider | packages/subagent/subagent-claude-code | official @anthropic-ai/claude-agent-sdk 0.3.263 query(); bundled platform CLI payload, no host CLI fallback | product bundle |
| Fixed Codex provider | packages/subagent/subagent-codex | node + @openai/codex 0.153.4 bin `app-server --stdio` (JSON-RPC); bundled payload, no host CLI | product bundle |
Also: subagent-acp (ACP client to child `dsh --profile acp`), subagent-dsh-sdk (child DSH over SDK stdio), tool-subagent-control.

## 1. OAR
- Expansion of "OAR": NOT stated anywhere in the repo. Only "@botiverse/oar" (Apache-2.0). Do not claim an expansion. [SOURCE] B THIRD_PARTY_NOTICES.md#L46
- Pin: devDependency "@botiverse/oar": "0.67.0", engines node >=24 (B pnpm-lock.yaml#L23006-L23008; B packages/experimental/subagent-oar/package.json). Bundled into the provider by tsdown alwaysBundle (B packages/experimental/subagent-oar/tsdown.config.ts#L11). Patched by B patches/@botiverse__oar@0.67.0.patch (163 lines).
- Launch mechanics (evidenced only via DSH's patch comments and tests; OAR source absent):
  - Claude: OAR "drives claude in print mode over stream-json" (managed args --print/-p/--input-format rejected), assigns `--session-id` (`--resume` on resume), and by default adds `--dangerously-skip-permissions` ("YOLO by default (repo policy, 2026-08-24)"). [SOURCE patch] B patches/@botiverse__oar@0.67.0.patch#L9-L24. DSH's patch lets the user pass `--permission-mode`, and then suppresses the bypass flag.
  - Codex: `codex app-server` JSON-RPC over stdio (initialize with clientInfo name "oar", experimentalApi true, thread start/resume). [SOURCE patch] #L34-L58. README: "OAR sets Codex approval policy to `never`" [DOC] B packages/experimental/subagent-oar/README.md#L105.
  - Full exact argv (e.g. whether `--output-format stream-json` literal, other flags) lives inside OAR: INFERENCE only.
  - Recommended recipe: Claude `--permission-mode dontAsk --permission-prompts none`; Codex `-c sandbox_mode="workspace-write"` [DOC B packages/experimental/subagent-oar/README.md#L22-L38; B snapshots/session/product-subagent-oar/cordis.yml#L1-L21]. `--permission-prompts none` needs a CLI that supports it (README#L161).
  - Native version pins: NONE for OAR. It probes the installed binary per delegation (`runtime.installation`, B packages/experimental/subagent-oar/src/run.ts#L299-L313). Payload schemas are OAR-internal.
- What DSH receives (SOURCE B packages/experimental/subagent-oar/src/run.ts#L225-L231): session.events filtered to root-agent `text_delta`; all else dropped.
  (a) intermediate events/progress: NOT surfaced. README "no progress stream" [DOC#L164]; code consumes only text_delta. CONFIRMED.
  (b) token usage/cost: NOT surfaced (no usage handling in run.ts). CONFIRMED by absence.
  (c) approvals forwarded to DSH UI: NO. README#L161: "OAR records unexpected Codex approval or user-input requests without answering them. If the runtime waits, cancel the task or configure timeoutMs." Hang risk. CONFIRMED (no interaction channel in run.ts).
  (d) cancellation: AbortSignal -> session.abort() + session.dispose(); optional timeoutMs (excludes startup). Cannot cancel during startup; late session is disposed [SOURCE run.ts#L203-L223, L330-L333; DOC#L162]. Process-tree kill is OAR's (env OAR_KILL_GRACE_MS seen in B packages/experimental/subagent-oar/tests/startup-cleanup.e2e.ts#L180): INFERENCE that it escalates signals.
  (e) resume: not exposed (NO_START_CAPABILITIES, B .../src/index.ts#L432; DOC#L164), though OAR itself has options.resume (patch#L24).
  (f) result: text only. Last non-empty root message id wins, else concatenated deltas [SOURCE run.ts#L195-L200]; stop reasons completed/aborted/error from TurnOutcome [run.ts#L166-L181]. This is the agent's own prose, NOT verified execution.
  (g) independently verifiable outcome: NONE. No diff, exit code, files changed, test capture. DSH never inspects the workspace after the run. README#L164: "Native changes made before cancellation remain in place."
- README limitation statements all CONFIRMED vs code, including "DSH does not apply its subprocess sandbox or managed descendant cleanup to those processes" (B README.md#L163): run.ts never calls ctx.subprocess.
- Default permissions: if Claude launchArgs omit --permission-mode, OAR default = bypass (`--dangerously-skip-permissions`) [DOC README#L89; SOURCE patch#L21-L23]. Codex with no sandbox arg: native config decides (INFERENCE).
- Process ownership: OAR spawns directly. Startup failure awaits process exit (patch#L47,#L56,#L67). No DSH-managed descendant cleanup.
- Env: scrubbed parent env (drops names matching /KEY|PASSWORD|SECRET|TOKEN/i and all DSH_*), expressed as overlay [SOURCE B packages/experimental/subagent-oar/src/environment.ts#L5-L16; B packages/subprocess/subprocess/src/index.ts#L47-L84]. Native account files under HOME stay reachable. Logs keep only stage/category; native cause kept on Error.cause and may contain secrets [DOC#L107].
- Tool: B packages/experimental/tool-subagent-oar/src/index.ts#L29-L103 (`subagent_oar`; requires a one-shot provider; delivery 'parent').

## 1b. Fixed providers (not OAR), verified
### Claude (subagent-claude-code)
- "@anthropic-ai/claude-agent-sdk": "0.3.263" [SOURCE B packages/subagent/subagent-claude-code/package.json#L51]; license "SEE LICENSE IN README.md" [B THIRD_PARTY_NOTICES.md#L42]. CLI arrives as SDK optional platform packages `@anthropic-ai/claude-agent-sdk-<platform>-<arch>`; README: never falls back to host `claude` [DOC B packages/subagent/subagent-claude-code/README.md#L12,#L60-L62]. CONFIRMS discussion #10265. win32-x64/arm64 packages listed [B .../tests/subagent-claude-code.spec.ts#L73-L74]. Payload ~92 MB packed [DOC Dev Note].
- SDK `query()` with persistSession:false; disallowedTools AskUserQuestion (+ExitPlanMode in plan); permissionMode default dontAsk; canUseTool always denies unless bypassPermissions (allowDangerouslySkipPermissions); onElicitation decline; onUserDialog cancelled [SOURCE B .../src/run.ts#L316-L376]. CONFIRMS coordinator's claim.
- settingSources omitted, so host user/project/local settings apply [DOC README#L58].
- Output: whole SDKMessage stream consumed; only `result` (strict success) and `system/permission_denied` used; assistant/tool/usage messages discarded [SOURCE run.ts#L236-L261]. [DOC README#L10].
- Process: SDK custom spawn routed to DSH subprocess seam (Linux systemd scope; Windows kill-on-close Job; mac/other process-group/taskkill fallback) [SOURCE B .../src/process.ts#L46-L61; DOC B packages/subprocess/subprocess-local/README.md#L86]. Cancel: AbortController + query.close() + terminate + waitForExit [run.ts#L270-L306].
- Env `{...scrubbedParentEnv(), ...spec.env}` [run.ts#L329].
### Codex (subagent-codex)
- "@openai/codex": "0.153.4" [SOURCE B packages/subagent/subagent-codex/package.json#L54]; argv `[node, codexBin, 'app-server', '--stdio']`, independent of PATH [SOURCE B packages/subagent/subagent-codex/src/run.ts#L136]; protocol baseline 0.153.4 (wire.ts header, README#L171).
- thread/start `ephemeral:true`, verified [B .../src/wire.ts#L292-L299]. Modes: `never` (default; approvalPolicy never; sandbox NOT set so native config governs) / `approve-for-me` (on-request, auto_review, workspace-write) / `dangerously-bypass-approvals-and-sandbox` [wire.ts#L32-L43; DOC README#L45].
- Approvals: command/file requestApproval auto cancel|decline; permissions, user-input, elicitation declined; unknown server requests fail closed [wire.ts#L577-L626; DOC README#L172]. Not forwarded to DSH UI or session events. CONFIRMED.
- Intermediate items: only `item/completed` agentMessage (final_answer/partial_answer/unphased; commentary ignored), declined command/file items (-> failure facts) and `turn/completed` are read; everything else discarded [wire.ts#L649-L695]. Usage not collected (only usageLimitExceeded classification, wire.ts#L126). DOC README#L173. So the Codex path DISCARDS item events, usage and approvals.
- Cancel: `turn/interrupt` best effort + managed process termination [wire.ts#L383].
- Auth native; bundle "does not create an account, log in" [DOC README#L169].

## 2. hooks-claude-code / hooks-codex / hook-protocol / claude-code-mods
- REVERSE direction. DSH executes a user's Claude-Code/Codex-format hooks.json command hooks during DSH's OWN agent runs, attached to DSH extension points (agent/created, agent/pre-step, tools/pre-execute, tools/post-execute, agent/turn-stopping, subagent/start|end) and run via ctx.shell [SOURCE B packages/experimental/hooks-claude-code/src/index.ts#L212-L305; B packages/experimental/hook-protocol/src/runner.ts#L2-L9]. NO ingestion of events from a native Claude Code/Codex process into DSH sessions (no listener/socket/HTTP receiver in these packages).
- Events: Claude bridge supports SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, Stop, SubagentStart/Stop; 23 of 30 Claude events unsupported (PermissionRequest, Notification, SessionEnd, ...) [DOC B packages/experimental/hooks-claude-code/README.md#L175]. Codex bridge: 5 of 10 unsupported incl. PermissionRequest, SubagentStart/Stop [DOC hooks-codex README#L171]. Only command hooks run [DOC hook-protocol README#L12].
- claude-code-mods: runs Claude Code mods (register(on, options)) as DSH plugins; alpha interface-compat demo [DOC B packages/experimental/claude-code-mods/README.md#L12]. Not an ingest path.
- Implication: no reusable DSH code for observing a user-run native agent via hooks.

## 3. Teams and subagents
- packages/subagent/subagent: activation manager + providers registry; local continuable children vs external one-shot providers (claude-code, codex, acp, dsh-sdk, oar). Parent gets child name, then completion notice with final text; terminal result retained in parent log [DOC provider READMEs].
- packages/team/agent-team: durable shared task board over a subagent tree; compare-and-set task ownership; advisory write scopes; one process; shared checkout; no worktree/merge/lock; no automatic owner release; notices reach live local members only; maxTasks 256; default mode off [DOC B packages/team/agent-team/README.md#L10,#L195-L202]. Model: lead + members, subagent messaging inbox + task board.
- tool-subagent-control: list/send_message/interrupt_agent/wait; only ancestors can interrupt descendants; external/one-shot targets cannot receive messages [DOC B packages/subagent/tool-subagent-control/README.md#L201-L203].
- External native agents are leaf one-shot children, not team members.

## 4. SDK and ACP
- SDK client: spawns same-version `dsh --profile sdk` subprocess, speaks stdio JSON-RPC. NOT a client to a long-running remote server, NOT an in-process runtime [SOURCE B packages/sdk/client/src/index.ts#L1-L12]. Exports DeepSeekHarness, HarnessSession, HarnessClient, validatedSessionEvent, error classes, RunOptions/RunResult/HarnessNotification etc. Server methods initialize, session/prompt, session/query, session/resume; notifications session.event / session.status [B packages/sdk/server/src/server.ts#L228,#L249,#L629-L655]. No cancel method on the wire [DOC sdk/server README#L235; client README#L192]. Exposes DSH sessions only.
- ACP: DSH is an ACP AGENT (server) via `dsh --profile acp`; @agentclientprotocol/sdk 1.4.0, standard ACP v1; caps: mcp http, prompt image (optional; no audio/embeddedContext), session close/list/resume [SOURCE B packages/acp/acp/src/index.ts#L184-L189; B packages/acp/acp/package.json#L35]. No session/load, fork, terminals, fs, elicitation [DOC README#L179]. subagent-acp is the ACP CLIENT; permission requests auto allow|reject by config; only agent_message_chunk collected [DOC B packages/subagent/subagent-acp/README.md#L161-L162].
- Neither SDK nor ACP observes a user-initiated native Claude/Codex run.

## 5. Authentication
- Native paths: use the installed/bundled CLI's own auth; no DSH code reads ~/.claude or ~/.codex (grep found none). CLAUDE_CODE_OAUTH_TOKEN, ANTHROPIC_AUTH_TOKEN etc. are stripped from child env by the TOKEN/KEY pattern (list in B packages/experimental/subagent-oar/tests/permission-mode.e2e.ts#L64-L69); the CLI reads its own login from HOME.
- FIRST-PARTY subscription OAuth DOES exist: packages/llm/llm-pi-ai offers pi-ai OAuth login via the authorization seam; the grant is stored at `llm-pi-ai/<provider id>` in the credential store and refreshed by DSH under a cross-process lock [DOC B packages/llm/llm-pi-ai/README.md#L130]. README#L327: "Codex is sign-in-able through the authorization flow's OAuth grant"; `openai-codex` base URL https://chatgpt.com/backend-api [SOURCE B packages/llm/llm-pi-ai/src/provider-data.generated.ts#L34]; Anthropic env list includes ANTHROPIC_OAUTH_TOKEN [same file#L12]. DSH declines "Sign in with ChatGPT" for the `openai` route [B packages/llm/llm-pi-ai/src/login.ts#L23-L29]. Whether Anthropic subscription OAuth is offered depends on pi-ai (uninspectable): INFERENCE. Kawalys should not copy this pattern.
- BYOK storage: plaintext YAML `<DSH_HOME or ~/.dsh>/.credentials.yaml`, owner-only perms on POSIX (refuses group/other readable), check SKIPPED on Windows, no encryption, OS keychain provider deferred, same-UID agent tool processes can read it [DOC B packages/credentials/credentials-local/README.md#L12,#L115,#L199,#L211]. Precedence: stored file > launch env > project .env > home .env.
- Leakage: children get scrubbed env, but explicit env overlays re-add keys; Claude stderr `inherit`, Codex stderr forwarded to host stderr; OAR errors keep secret-bearing causes in Error.cause.

## 6. Tests
- OAR: subagent-oar.spec.ts (scripted runtime via @botiverse/oar/testing, ~35 cases: env scrub, cancel, timeout, last-message selection, dispose failures) [B packages/experimental/subagent-oar/tests/subagent-oar.spec.ts]; native.e2e.ts REAL codex/claude with user's native auth, opt-in DSH_OAR_E2E=1, asserts a file and answer text [B .../tests/native.e2e.ts#L15]; permission-mode.e2e.ts real Claude binary vs loopback fake Messages API, opt-in DSH_OAR_NATIVE_PERMISSIONS=1 (dontAsk/plan deny, acceptEdits allows) [B .../tests/permission-mode.e2e.ts#L71]; startup-cleanup.e2e.ts fake codex shell script, POSIX only [#L215]; packed-artifact.e2e.ts skipped on win32 [#L17]. Default CI exercises scripted runtime only.
- Fixed Claude: real-product.spec.ts runs the real bundled CLI keyless against a loopback fixture; real-deepseek.e2e.ts needs DEEPSEEK_API_KEY. Fixed Codex: real-product.spec.ts and cleanup spec with responses fixture; real-deepseek.e2e.ts. Both have win32 branches.
- hooks: bridge/config/coverage specs on mocked DSH agent. SDK: fake-runtime. ACP: in-process harness. Team: packages/team/agent-team/tests.
- Boundary: no test asserts diff/git state/test results; assertions are on fixture files or answer text.

## 7. Windows
- Fixed providers: win32 payload packages and Windows Job (kill-on-close) managed range [DOC subprocess-local README#L28,#L86].
- OAR: no DSH-managed Job; README never claims Windows; startup-cleanup and packed-artifact tests skip win32; only environment.e2e has a win32 .cmd probe fixture. UNVERIFIED by DSH tests. Node >=24 required.
