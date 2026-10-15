# OpenClaw site administration

This integration is separate from the public lobby assistant and the personal OpenClaw gateway on port `18789`. Source changes and local configuration alone do not activate production administration. Deployment, server secret configuration and authenticated end-to-end verification are separate steps.

## Boundaries

The dedicated `qurabia-admin` profile runs its own loopback gateway on `19789`, workspace and tool allowlist. Its native plugin in `tools/openclaw-admin-plugin` makes outbound HTTPS requests to Qurabia. Vercel does not connect to the local gateway; no public tunnel or inbound port is needed. Keep the personal profile, credentials, plugins and workspace separate. Agent identity alone does not isolate access.

Only site status, aggregate question statistics, and proposals to change a question to `DRAFT` or `ARCHIVED` are in scope. The connector cannot publish, delete, manage accounts, execute commands, read arbitrary files, call arbitrary URLs or approve its own proposals. Do not grant shell, browser, filesystem, generic HTTP or personal-profile tools to this agent. Do not add the administrative plugin or credential to the public support assistant.

The exact optional tool allowlist is `qurabia_site_status`, `qurabia_question_stats`, and `qurabia_propose_question_status`. They send validated requests to `POST /api/integrations/openclaw`. The proposal tool accepts only `questionId`, `nextStatus` and `reason`; the plugin creates a request ID itself. The plugin registers tools only for agent `qurabia-admin`.

The service credential authorizes reading and proposing only. Store it on the server and in the dedicated local profile; never in browser code, Git, chat, screenshots or logs. The personal gateway token is not used by this integration.

The dedicated profile uses `ollama/gemma4:31b-cloud` through the existing local Ollama daemon. Its capabilities were checked through `/api/show`; the inherited Kimi cloud model returned a plan restriction. No subscription or personal model configuration is changed. Cloud availability and account limits are enforced by Ollama.

## Server configuration and release

1. Review and deploy the integration using the existing Qurabia release process. No database migration is required: proposals and outcomes use existing `AuditLog` records.
2. Configure `QURABIA_OPENCLAW_ENABLED=true` and a new high-entropy `QURABIA_OPENCLAW_SERVICE_TOKEN` in the deployment environment. The local plugin's `credentialsFile` setting points to a separately protected JSON file containing only `{ "token": "<same dedicated service token>" }`. Use a generated token between 32 and 256 characters. Keep this file outside the repository with access restricted to the Windows account. The plugin destination is fixed to `https://qurabia.com`.
3. Confirm the existing shared Upstash rate limiter is configured. Missing distributed rate-limit infrastructure must fail closed; do not substitute a process-local limit in production.
4. Install only the native administrative plugin into the isolated profile, apply its exact tool allowlist and enable provider authentication for that profile. Do not copy the personal profile's credentials or enable unrelated tools.
5. Start and inspect the dedicated gateway, for example `openclaw --profile qurabia-admin gateway --port 19789`. Keep port `18789` and the personal profile unchanged.
6. Verify deployed API boundaries and the authenticated OWNER approval page at `/admin/openclaw`. Configure and verify credentials locally without displaying their values. A healthy local gateway does not prove the deployed API or the model/provider can execute tools.

To disable new connector requests, set `QURABIA_OPENCLAW_ENABLED=false` using the normal environment release process and stop the dedicated gateway. Rotate the dedicated service token if compromised; leave other credentials untouched.

## Human approval

The OWNER opens `/admin/openclaw` in their own browser session. The page checks current account status and session version using the existing authentication system; the API independently repeats authorization. A bearer service credential cannot approve changes.

`GET /api/admin/openclaw` lists proposals without changing any question. The page displays the exact question and proposal IDs, optional question prompt, original status, requested status, version, edit timestamp, creation time and reason. All model-supplied text is rendered as escaped React text.

Each approval requires the OWNER to select the acknowledgement for that specific proposal and click **الموافقة وتنفيذ التغيير**. The browser sends only `{id, decision: "approve"}` to `POST /api/admin/openclaw`; the server uses the stored proposal rather than accepting substitute arguments. Rejection sends `{id, decision: "reject"}` and does not change the question. The page reloads and clears acknowledgement after either decision; entering or refreshing the page never approves or executes a proposal.

Approval and execution occur together in the server transaction. Proposals expire after 15 minutes. Stale questions, replayed decisions and questions linked to quizzes are rejected, because existing administrative operations may have additional quiz/session effects. There is no automatic approval, delayed arbitrary execution or permanent approval grant. The OWNER must review a newly generated proposal when the question changes or a request expires. The API requires a valid same-origin request and a current OWNER session for every decision.

## Verification

Run the targeted tests with the repository's installed Vitest runtime (no dependency installation required):

```powershell
# From apps/web
node .\node_modules\vitest\vitest.mjs run 'src/app/admin/(console)/openclaw/approval-panel.test.tsx' 'src/app/admin/(console)/openclaw/page.test.tsx'
```

The UI checks cover read-only entry, escaped proposal text, explicit acknowledgement, exact stored-proposal approval payload, rejection, safe errors and the OWNER page gate. Run the integration's API/protocol tests as well, including service-token rejection on the approval route, current OWNER identity, same-origin validation, expiry, replay, unchanged-question binding, linked-quiz rejection, transactional execution and disabled/rate-limit behavior.

After deployment, verify status and aggregate reads through the dedicated plugin. Test malformed and unauthenticated requests without modifying content. Test human rejection first. A live approval changes a question and therefore requires the OWNER's explicit decision for the displayed exact proposal; do not create a production mutation merely to demonstrate setup. Report separately: source validation, local profile readiness, deployment, authenticated read-tool success, and any actual approved mutation.
