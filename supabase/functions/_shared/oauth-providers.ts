export type OAuthProviderId =
  | "slack"
  | "google"
  | "discord"
  | "github"
  | "notion"
  | "teams";

export interface OAuthProviderConfig {
  id: OAuthProviderId;
  label: string;
  authUrl: string;
  tokenUrl: string;
  scopes: string[];
  clientIdEnv: string;
  clientSecretEnv: string;
  extraAuthParams?: Record<string, string>;
}

export const OAUTH_PROVIDERS: Record<OAuthProviderId, OAuthProviderConfig> = {
  slack: {
    id: "slack",
    label: "Slack",
    authUrl: "https://slack.com/oauth/v2/authorize",
    tokenUrl: "https://slack.com/api/oauth.v2.access",
    scopes: ["channels:read", "chat:write", "users:read", "team:read"],
    clientIdEnv: "OAUTH_SLACK_CLIENT_ID",
    clientSecretEnv: "OAUTH_SLACK_CLIENT_SECRET",
    extraAuthParams: { user_scope: "" },
  },
  google: {
    id: "google",
    label: "Google Calendar",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: [
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/calendar.events",
      "openid",
      "email",
      "profile",
    ],
    clientIdEnv: "OAUTH_GOOGLE_CLIENT_ID",
    clientSecretEnv: "OAUTH_GOOGLE_CLIENT_SECRET",
    extraAuthParams: { access_type: "offline", prompt: "consent" },
  },
  discord: {
    id: "discord",
    label: "Discord",
    authUrl: "https://discord.com/api/oauth2/authorize",
    tokenUrl: "https://discord.com/api/oauth2/token",
    scopes: ["identify", "guilds", "bot"],
    clientIdEnv: "OAUTH_DISCORD_CLIENT_ID",
    clientSecretEnv: "OAUTH_DISCORD_CLIENT_SECRET",
    extraAuthParams: { permissions: "2048" },
  },
  github: {
    id: "github",
    label: "GitHub",
    authUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    scopes: ["read:user", "repo", "read:org"],
    clientIdEnv: "OAUTH_GITHUB_CLIENT_ID",
    clientSecretEnv: "OAUTH_GITHUB_CLIENT_SECRET",
  },
  notion: {
    id: "notion",
    label: "Notion",
    authUrl: "https://api.notion.com/v1/oauth/authorize",
    tokenUrl: "https://api.notion.com/v1/oauth/token",
    scopes: [],
    clientIdEnv: "OAUTH_NOTION_CLIENT_ID",
    clientSecretEnv: "OAUTH_NOTION_CLIENT_SECRET",
    extraAuthParams: { owner: "user" },
  },
  teams: {
    id: "teams",
    label: "Microsoft Teams",
    authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scopes: ["openid", "profile", "offline_access", "User.Read", "Channel.ReadBasic.All", "Chat.ReadWrite"],
    clientIdEnv: "OAUTH_MICROSOFT_CLIENT_ID",
    clientSecretEnv: "OAUTH_MICROSOFT_CLIENT_SECRET",
  },
};

export function getProvider(id: string): OAuthProviderConfig | null {
  if (id in OAUTH_PROVIDERS) {
    return OAUTH_PROVIDERS[id as OAuthProviderId];
  }
  return null;
}

export function getCallbackUrl(supabaseUrl: string): string {
  return `${supabaseUrl}/functions/v1/oauth-callback`;
}
