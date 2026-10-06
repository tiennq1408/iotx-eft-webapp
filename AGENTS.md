<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# IoTX project rules

- Read `docs/IOTX-INTEGRATION.md` before changing authentication, devices, automation, notifications, sharing, timers, or data access.
- This Next.js app is an end-user client. It talks only to IBS through `/v1`; never call Keycloak, ThingsBoard, PKI, databases, `admin/*`, or `internal/*` directly.
- Keep mock/localStorage and real IoTX transport behind separate modules. Do not put API credentials, Mydocu credentials, admin keys, tokens, or secrets in source.
- Use `GET /bootstrap` for initial authenticated data. Access tokens live 300 seconds; refresh once after a 401, then clear the session if refresh also fails.
- Send a unique `Idempotency-Key` for every real-device RPC. Treat `404 {"message":"not_found"}` as intentionally ambiguous and do not reveal inferred resource existence.
- Render device controls from product capabilities. Unknown renderers and missing products must fall back to a usable generic UI, never a blank screen.
- SSE `/stream` has no replay. Reconnect with backoff, then refetch devices before continuing.
- New automation rules default to shadow mode. Respect server quotas and per-device sharing permissions.
- UI changes must preserve 44px touch targets, no horizontal overflow, responsive phone/desktop layouts, and WCAG contrast.
- Before handing off, run `npm run lint` and `npm run build`.
