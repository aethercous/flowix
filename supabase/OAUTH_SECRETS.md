# OAuth secrets for Connections

Add these in [Supabase Dashboard → Edge Functions → Secrets](https://supabase.com/dashboard/project/utofnywijqsozjqmkhcn/settings/functions).

**Browserbase** (required for agents to browse with connected accounts):

- `BROWSERBASE_API_KEY`
- `BROWSERBASE_PROJECT_ID`

**Redirect URL** (same for every provider):

```
https://utofnywijqsozjqmkhcn.supabase.co/functions/v1/oauth-callback
```

## Slack

1. Create an app at https://api.slack.com/apps
2. OAuth & Permissions → Redirect URLs → add the URL above
3. Bot scopes: `channels:read`, `chat:write`, `users:read`, `team:read` (user scopes are requested automatically for Browserbase)
4. Secrets:
   - `OAUTH_SLACK_CLIENT_ID` = Client ID
   - `OAUTH_SLACK_CLIENT_SECRET` = Client Secret

## Google Workspace (Connections)

Connections reuse the **same** Google OAuth client as Supabase Auth sign-in. No separate redirect URI.

1. In Google Cloud → OAuth consent screen, add scopes when you are ready for agents:
   - Gmail API (readonly + send)
   - Google Drive API (readonly)
   - Google Docs API (readonly)
   - Google Calendar API (readonly + events)
2. Enable those APIs under APIs & Services → Library.
3. Users connect from **Dashboard → Connections → Google Workspace**.

Optional edge secrets (same Client ID/secret as Auth — refreshes tokens for agents):

- `OAUTH_GOOGLE_CLIENT_ID`
- `OAUTH_GOOGLE_CLIENT_SECRET`

## GitHub

1. GitHub → Settings → Developer settings → OAuth Apps
2. Authorization callback URL = URL above
3. Secrets:
   - `OAUTH_GITHUB_CLIENT_ID`
   - `OAUTH_GITHUB_CLIENT_SECRET`

## Discord

- `OAUTH_DISCORD_CLIENT_ID`
- `OAUTH_DISCORD_CLIENT_SECRET`

## Notion

Uses Basic auth on token exchange. Secrets:

- `OAUTH_NOTION_CLIENT_ID`
- `OAUTH_NOTION_CLIENT_SECRET`

## Microsoft Teams

- `OAUTH_MICROSOFT_CLIENT_ID`
- `OAUTH_MICROSOFT_CLIENT_SECRET`

After saving secrets, redeploy edge functions (`supabase functions deploy`) so callback and Browserbase auth changes take effect. Retry **Connect** in the dashboard. For full web-app login on some sites, use **Browser sign-in** on a connected card.
