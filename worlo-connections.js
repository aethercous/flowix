/**
 * Shared OAuth connections helpers for worlo dashboard & connections pages.
 */
(function (global) {
  const SUPABASE_URL = 'https://utofnywijqsozjqmkhcn.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_NFpInIt2anAJxn2slHZIuQ_BsEw4g1n';

  const catalog = global.WorloConnectionCatalog;
  const OAUTH_APPS = catalog
    ? catalog.getOAuthApps().map(function (c) {
        return {
          id: c.oauthProvider || c.id,
          label: c.label,
          icon: c.icon,
          color: c.color,
          desc: c.desc,
          catalogId: c.id,
        };
      })
    : [
        { id: 'slack', label: 'Slack', icon: 'S', color: '#4A154B', desc: 'Slack workspace.' },
        { id: 'google', label: 'Google Calendar', icon: 'G', color: '#4285F4', desc: 'Google Calendar.' },
      ];

  const BROWSER_APPS = catalog
    ? catalog.getBrowserApps().map(function (c) {
        return { id: c.id, label: c.label, icon: c.icon, color: c.color, desc: c.desc };
      })
    : [{ id: 'linkedin', label: 'LinkedIn', icon: 'in', color: '#0A66C2', desc: 'LinkedIn via browser.' }];

  /** Same Google OAuth app as Supabase Auth sign-in — requested when user clicks Connect. */
  const GOOGLE_WORKSPACE_SCOPES = [
    'openid',
    'email',
    'profile',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/drive.readonly',
    'https://www.googleapis.com/auth/documents.readonly',
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/calendar.events',
  ].join(' ');

  function googleConnectReturnUrl(returnUrl) {
    const base = returnUrl || 'dashboard.html?connect=google#connections';
    if (base.indexOf('connect=google') !== -1) return base;
    const hashIdx = base.indexOf('#');
    const beforeHash = hashIdx >= 0 ? base.slice(0, hashIdx) : base;
    const hash = hashIdx >= 0 ? base.slice(hashIdx) : '#connections';
    const joiner = beforeHash.indexOf('?') >= 0 ? '&' : '?';
    return beforeHash + joiner + 'connect=google' + hash;
  }

  async function linkGoogleFromSession(sb) {
    const sessionRes = await sb.auth.getSession();
    const session = sessionRes?.data?.session;
    if (!session) return { ok: false, error: 'Please sign in again' };

    const linkRes = await sb.functions.invoke('oauth-link-from-session', {
      headers: { Authorization: 'Bearer ' + session.access_token },
      body: { provider: 'google' },
    });

    if (linkRes.error) {
      let msg = linkRes.error.message || 'Failed to link Google account';
      if (linkRes.error.context && typeof linkRes.error.context.json === 'function') {
        try {
          const body = await linkRes.error.context.json();
          if (body?.error) msg = body.error;
        } catch (_e) { /* ignore */ }
      }
      return { ok: false, error: msg, needsConsent: false };
    }

    const data = linkRes.data || {};
    if (data.ok) return { ok: true, provider: 'google', connectionId: data.connectionId };
    return {
      ok: false,
      error: data.error || 'Could not link Google Workspace',
      needsConsent: !!data.needsConsent,
    };
  }

  async function startGoogleWorkspaceOAuth(sb, options) {
    const cfg = global.WORLO_CONFIG;
    if (cfg && typeof cfg.startBrandedGoogleAuth === 'function') {
      const branded = await cfg.startBrandedGoogleAuth({
        mode: 'connect',
        supabaseClient: sb,
        returnUrl: options.returnUrl || 'dashboard.html#connections',
      });
      if (branded?.url) {
        window.location.assign(branded.url);
        return { redirecting: true, provider: 'google' };
      }
    }

    const returnUrl = googleConnectReturnUrl(options.returnUrl);
    const redirectTo = new URL(returnUrl, window.location.origin).href;
    const { data, error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectTo,
        scopes: GOOGLE_WORKSPACE_SCOPES,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });
    if (error) throw new Error(error.message || 'Failed to start Google authorization');
    if (!data?.url) throw new Error('No Google authorization URL returned');
    window.location.assign(data.url);
    return { redirecting: true, provider: 'google' };
  }

  function createClient() {
    return global.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  }

  async function loadUserConnections(sb, userId) {
    const { data, error } = await sb
      .from('user_connections')
      .select('id, provider, account_label, external_account_id, connected_at, metadata')
      .eq('user_id', userId)
      .order('connected_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async function loadAgentConnections(sb, userId, agentId) {
    const { data, error } = await sb
      .from('agent_connections')
      .select('id, app_name, user_connection_id, session_id, connected_at')
      .eq('user_id', userId)
      .eq('agent_id', agentId);
    if (error) throw error;
    return data || [];
  }

  async function startOAuth(sb, provider, options = {}) {
    console.info('[WorloConnections] startOAuth →', provider, options);

    const sessionRes = await sb.auth.getSession();
    const session = sessionRes?.data?.session;
    if (!session) {
      console.warn('[WorloConnections] startOAuth: no session', sessionRes);
      throw new Error('Please sign in again');
    }

    if (provider === 'google') {
      const linked = await linkGoogleFromSession(sb);
      if (linked.ok) {
        return { linked: true, provider: 'google', connectionId: linked.connectionId };
      }
      console.info('[WorloConnections] google session link:', linked.error || 'needs consent');
      return startGoogleWorkspaceOAuth(sb, options);
    }

    let invokeResult;
    try {
      invokeResult = await sb.functions.invoke('oauth-start', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: {
          provider,
          agentId: options.agentId,
          returnUrl: options.returnUrl || 'dashboard.html#connections',
        },
      });
    } catch (networkErr) {
      console.error('[WorloConnections] oauth-start network/fetch failed', networkErr);
      throw new Error(networkErr?.message || 'Could not reach the connection service. Check your network and try again.');
    }

    const { data, error } = invokeResult || {};
    console.info('[WorloConnections] oauth-start response', { data, error });

    if (error) {
      let msg = error.message || 'Failed to start OAuth';
      if (error.context && typeof error.context.json === 'function') {
        try {
          const body = await error.context.json();
          if (body?.error) msg = body.error;
          console.warn('[WorloConnections] oauth-start error body', body);
        } catch (parseErr) {
          console.warn('[WorloConnections] oauth-start error body parse failed', parseErr);
        }
      }
      throw new Error(msg);
    }
    if (data?.ok === false || data?.error) {
      throw new Error(data.error || 'This integration is not available right now.');
    }
    if (!data?.url) throw new Error('No OAuth URL returned by oauth-start');

    console.info('[WorloConnections] redirecting to OAuth provider', data.url);
    window.location.assign(data.url);
  }

  let configStatusCache = null;
  async function loadOAuthConfigStatus(sb, { force = false } = {}) {
    if (configStatusCache && !force) return configStatusCache;
    try {
      const { data, error } = await sb.functions.invoke('oauth-config-status', {
        method: 'GET',
      });
      if (error) {
        console.warn('[WorloConnections] oauth-config-status error', error);
        return null;
      }
      configStatusCache = data || null;
      return configStatusCache;
    } catch (e) {
      console.warn('[WorloConnections] oauth-config-status threw', e);
      return null;
    }
  }

  async function openBrowserLogin(sb, provider) {
    const sessionRes = await sb.auth.getSession();
    const session = sessionRes?.data?.session;
    if (!session) throw new Error('Please sign in again');

    const { data, error } = await sb.functions.invoke('connection-browser-login', {
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: { provider },
    });
    if (error) throw new Error(error.message || 'Failed to open browser login');
    if (data?.error) throw new Error(data.error);

    const url = data?.debugUrl || data?.connectUrl;
    if (!url) throw new Error('No browser login URL returned');
    window.open(url, '_blank', 'noopener,noreferrer');
    return data;
  }

  async function disconnectOAuth(sb, provider) {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) throw new Error('Please sign in again');

    const { data, error } = await sb.functions.invoke('oauth-disconnect', {
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: { provider },
    });
    if (error) throw new Error(error.message || 'Failed to disconnect');
    if (data?.error) throw new Error(data.error);
    return data;
  }

  async function saveAgentConnectionLinks(sb, userId, agentId, selectedUserConnectionIds) {
    const { data: existing } = await sb
      .from('agent_connections')
      .select('id, app_name, user_connection_id')
      .eq('user_id', userId)
      .eq('agent_id', agentId);

    const oauthRows = (existing || []).filter((r) => r.user_connection_id);
    const toRemove = oauthRows.filter((r) => !selectedUserConnectionIds.includes(r.user_connection_id));

    for (const row of toRemove) {
      await sb.from('agent_connections').delete().eq('id', row.id);
    }

    if (!selectedUserConnectionIds.length) return;

    const { data: userConns, error } = await sb
      .from('user_connections')
      .select('id, provider')
      .eq('user_id', userId)
      .in('id', selectedUserConnectionIds);

    if (error) throw error;

    for (const uc of userConns || []) {
      await sb.from('agent_connections').upsert({
        user_id: userId,
        agent_id: agentId,
        app_name: uc.provider,
        user_connection_id: uc.id,
      }, { onConflict: 'agent_id,app_name' });
    }
  }

  function parseOAuthCallbackParams() {
    const search = new URLSearchParams(window.location.search);
    if (search.get('oauth')) {
      return {
        oauth: search.get('oauth'),
        provider: search.get('provider'),
        message: search.get('message'),
      };
    }
    const hash = window.location.hash || '';
    const q = hash.indexOf('?');
    if (q >= 0) {
      const hashParams = new URLSearchParams(hash.slice(q + 1));
      return {
        oauth: hashParams.get('oauth'),
        provider: hashParams.get('provider'),
        message: hashParams.get('message'),
      };
    }
    return { oauth: null, provider: null, message: null };
  }

  function clearOAuthCallbackParams() {
    const url = new URL(window.location.href);
    url.searchParams.delete('oauth');
    url.searchParams.delete('provider');
    url.searchParams.delete('message');
    if (url.hash.includes('?')) {
      url.hash = url.hash.slice(0, url.hash.indexOf('?')) || '#connections';
    }
    const path = url.pathname + url.search + (url.hash || '#connections');
    window.history.replaceState({}, '', path);
  }

  function searchCatalog(query, options) {
    if (catalog) return catalog.searchConnections(query, options);
    return OAUTH_APPS;
  }

  function getCatalogLabel(providerId) {
    if (catalog) return catalog.getLabelForProvider(providerId);
    const app = OAUTH_APPS.find(function (a) { return a.id === providerId; });
    return app ? app.label : providerId;
  }

  global.WorloConnections = {
    SUPABASE_URL,
    SUPABASE_KEY,
    OAUTH_APPS,
    BROWSER_APPS,
    GOOGLE_WORKSPACE_SCOPES,
    searchCatalog,
    getCatalogLabel,
    createClient,
    loadUserConnections,
    loadAgentConnections,
    loadOAuthConfigStatus,
    linkGoogleFromSession,
    startOAuth,
    openBrowserLogin,
    disconnectOAuth,
    saveAgentConnectionLinks,
    parseOAuthCallbackParams,
    clearOAuthCallbackParams,
  };
})(typeof window !== 'undefined' ? window : globalThis);
