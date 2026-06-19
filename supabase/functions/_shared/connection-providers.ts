/**
 * Maps OAuth provider IDs to the hostnames an agent might visit for them, and
 * declares how to inject the user's stored OAuth access token when the agent
 * navigates to that host in Browserbase.
 *
 * - `cookies` are written into the Browserbase session for the listed domain
 *   so the browser is authenticated before any navigation occurs.
 * - `headers` are added to outbound requests on that domain via CDP, so REST
 *   endpoints (e.g. Slack Web API) work too.
 *
 * Persistent cookies for sites without a programmatic auth path (LinkedIn,
 * etc.) are handled via Browserbase Contexts instead — see
 * `browserbase-contexts.ts`.
 */
import { OAuthProviderId } from "./oauth-providers.ts";

export interface ProviderCookieRule {
  /** Cookie name to set in the browser. */
  name: string;
  /** Domain the cookie is scoped to (sent to Browserbase). */
  domain: string;
  /** When true, prepend "Bearer " to the access token value. */
  asBearer?: boolean;
  /** Optional path (defaults to "/"). */
  path?: string;
  /** Send only over HTTPS (defaults to true). */
  secure?: boolean;
}

export interface ProviderHeaderRule {
  name: string;
  /** When true, the value is rendered as `Bearer <token>`. */
  asBearer?: boolean;
  /** Fixed header value (e.g. Notion-Version) instead of the OAuth access token. */
  staticValue?: string;
}

export interface BrowserProvider {
  /** Matches `user_connections.provider`. */
  id: OAuthProviderId | "linkedin";
  /** Domain suffixes the agent might visit for this provider. */
  hosts: string[];
  /** Cookies to seed into the session so it appears logged in. */
  cookies?: ProviderCookieRule[];
  /** Headers to set via CDP setExtraHTTPHeaders for matching hosts. */
  headers?: ProviderHeaderRule[];
  /**
   * If true we persist a Browserbase Context for this user_connection so a
   * one-time interactive login is remembered across sessions.
   */
  usesContext?: boolean;
}

/** Default URL to open when seeding a persistent Browserbase context via interactive login. */
export const PROVIDER_LOGIN_URLS: Record<string, string> = {
  slack: "https://app.slack.com",
  google: "https://accounts.google.com",
  github: "https://github.com/login",
  notion: "https://www.notion.so",
  discord: "https://discord.com/login",
  teams: "https://teams.microsoft.com",
  linkedin: "https://www.linkedin.com/login",
  zoom: "https://zoom.us/signin",
};

export function getProviderLoginUrl(providerId: string): string | null {
  return PROVIDER_LOGIN_URLS[providerId] ?? null;
}

export const BROWSER_PROVIDERS: BrowserProvider[] = [
  {
    id: "slack",
    hosts: ["slack.com", "app.slack.com", "slack-edge.com"],
    headers: [{ name: "Authorization", asBearer: true }],
    usesContext: true,
  },
  {
    id: "google",
    hosts: [
      "google.com",
      "accounts.google.com",
      "calendar.google.com",
      "mail.google.com",
      "drive.google.com",
      "docs.google.com",
      "googleapis.com",
    ],
    headers: [{ name: "Authorization", asBearer: true }],
    usesContext: true,
  },
  {
    id: "github",
    hosts: ["github.com", "api.github.com", "raw.githubusercontent.com"],
    headers: [{ name: "Authorization", asBearer: true }],
    usesContext: true,
  },
  {
    id: "notion",
    hosts: ["notion.so", "notion.com", "api.notion.com"],
    headers: [
      { name: "Authorization", asBearer: true },
      { name: "Notion-Version", staticValue: "2022-06-28" },
    ],
    usesContext: true,
  },
  {
    id: "discord",
    hosts: ["discord.com", "discordapp.com"],
    headers: [{ name: "Authorization", asBearer: true }],
    usesContext: true,
  },
  {
    id: "teams",
    hosts: [
      "teams.microsoft.com",
      "teams.live.com",
      "login.microsoftonline.com",
      "graph.microsoft.com",
    ],
    headers: [{ name: "Authorization", asBearer: true }],
    usesContext: true,
  },
  {
    id: "linkedin",
    hosts: ["linkedin.com", "www.linkedin.com"],
    usesContext: true,
  },
  {
    id: "zoom",
    hosts: ["zoom.us", "zoom.com"],
    usesContext: true,
  },
];

/** Lower-cases and strips port/protocol. */
function normalizeHost(host: string): string {
  return host.toLowerCase().split(":")[0];
}

/** Returns the matching provider for a hostname, if any. */
export function findProviderForHost(host: string): BrowserProvider | null {
  const h = normalizeHost(host);
  for (const provider of BROWSER_PROVIDERS) {
    for (const candidate of provider.hosts) {
      const c = normalizeHost(candidate);
      if (h === c || h.endsWith(`.${c}`)) return provider;
    }
  }
  return null;
}

/** Returns the provider definition for an OAuth provider id. */
export function getBrowserProvider(id: string): BrowserProvider | null {
  return BROWSER_PROVIDERS.find((p) => p.id === id) ?? null;
}

/** Extract a hostname from a URL string, lenient with bare hostnames. */
export function hostFromUrl(url: string): string | null {
  try {
    const u = url.includes("://") ? url : `https://${url}`;
    return new URL(u).hostname.toLowerCase();
  } catch {
    return null;
  }
}
