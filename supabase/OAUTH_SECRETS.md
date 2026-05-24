# OAuth secrets for Connections

Add these in [Supabase Dashboard → Edge Functions → Secrets](https://supabase.com/dashboard/project/utofnywijqsozjqmkhcn/settings/functions).

**Redirect URL** (same for every provider):

```
https://utofnywijqsozjqmkhcn.supabase.co/functions/v1/oauth-callback
```

## Slack

1. Create an app at https://api.slack.com/apps
2. OAuth & Permissions → Redirect URLs → add the URL above
3. Scopes: `channels:read`, `chat:write`, `users:read`, `team:read`
4. Secrets:
   - `OAUTH_SLACK_CLIENT_ID` = Client ID
   - `OAUTH_SLACK_CLIENT_SECRET` = Client Secret

## Google Calendar

1. Google Cloud Console → APIs & Services → Credentials → OAuth client
2. Authorized redirect URI = URL above
3. Secrets:
   - `OAUTH_GOOGLE_CLIENT_ID`
   - `OAUTH_GOOGLE_CLIENT_SECRET`

## GitHub

1. GitHub → Settings → Developer settings → OAuth Apps
2. Authorization callback URL = URL above
3. Secrets:
   - `OAUTH_GITHUB_CLIENT_ID`
   - `OAUTH_GITHUB_CLIENT_SECRET`

After saving secrets, redeploy is not required; retry Connect in the dashboard.
