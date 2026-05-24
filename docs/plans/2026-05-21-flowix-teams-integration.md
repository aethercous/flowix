# flowix Teams Integration Plan

> **Goal:** Separate Teams client (browser + Mac/Windows) where teammates join via dashboard-generated invite codes, with minute-level expiry and owner controls to revoke codes or disable agents.

**Architecture:** Reuse existing `access_codes` + `teams-auth` + `generate-teams-code` pipeline (not legacy `team_access_codes`). Add `manage-teams-code` for revoke/agent kill-switch. Electron desktop wraps `teams-app/` with the same Flowix design tokens.

**Tech stack:** Vanilla HTML/JS, Supabase Postgres + Edge Functions (Deno), Electron 33 + electron-builder.

---

## What already existed

| Piece | Status |
|-------|--------|
| `access_codes` + `code_access_logs` | Live, hashed `FLOWIX-*` codes |
| `generate-teams-code` / `teams-auth` | Deployed edge functions |
| `teams-app/` web UI | Invite login + `agent-invoke` chat |
| Dashboard Teams section | Generated codes (days only, localStorage list) |
| `team_access_codes` | Legacy — **not** used by auth |

## What was added

1. **DB:** `agents.teams_enabled` — instant block for all codes for that agent.
2. **`manage-teams-code`:** revoke, activate, set_expires, set_agent_teams_enabled, revoke_all_for_agent.
3. **`generate-teams-code`:** `expires_at` / `expires_in_minutes`, optional label in metadata.
4. **`teams-auth`:** Rejects when `teams_enabled = false`.
5. **Dashboard:** datetime-local expiry, max uses, DB-backed code list, revoke, agent toggles, one-time code reveal.
6. **`flowix-teams-desktop/`:** Electron app + build scripts for Windows/macOS.
7. **`teams-app/download.html`:** Download / browser entry page.

## Deploy checklist

- [ ] `supabase functions deploy generate-teams-code teams-auth manage-teams-code`
- [ ] Migration `20260521150000_teams_sharing_controls.sql` on all environments
- [ ] `cd flowix-teams-desktop && npm install && npm run build:win` / `build:mac`
- [ ] Host installer artifacts or link from dashboard

## Security notes

- Plaintext codes are shown **once** at generation; DB stores SHA-256 hash only.
- Teammates receive `agentKey` in session — treat invite codes like passwords.
- RLS on `access_codes` limits reads to agent owners.
