/**
 * Shared OAuth connections helpers for flowix dashboard & connections pages.
 */
(function (global) {
  const SUPABASE_URL = 'https://utofnywijqsozjqmkhcn.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_NFpInIt2anAJxn2slHZIuQ_BsEw4g1n';

  const OAUTH_APPS = [
    { id: 'slack', label: 'Slack', icon: 'S', color: '#4A154B', desc: 'Read messages, post updates, and respond to mentions in your Slack workspace.' },
    { id: 'google', label: 'Google Calendar', icon: 'G', color: '#4285F4', desc: 'Check availability, schedule meetings, and manage your calendar.' },
    { id: 'discord', label: 'Discord', icon: 'D', color: '#5865F2', desc: 'Connect to Discord servers to moderate chats and answer questions.' },
    { id: 'github', label: 'GitHub', icon: 'G', color: '#181717', desc: 'Analyze code, manage issues, and review pull requests.' },
    { id: 'notion', label: 'Notion', icon: 'N', color: '#000', desc: 'Read and update Notion pages from your knowledge base.' },
    { id: 'teams', label: 'Microsoft Teams', icon: 'T', color: '#6264A7', desc: 'Assist your organization in Teams channels and chats.' },
  ];

  const BROWSER_APPS = [
    { id: 'linkedin', label: 'LinkedIn', icon: 'in', color: '#0A66C2', desc: 'Browse feed, post updates, and reply via Browserbase (per agent).' },
  ];

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
    const { data: { session } } = await sb.auth.getSession();
    if (!session) throw new Error('Please sign in again');

    const { data, error } = await sb.functions.invoke('oauth-start', {
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: {
        provider,
        agentId: options.agentId,
        returnUrl: options.returnUrl || 'dashboard.html#connections',
      },
    });

    if (error) {
      let msg = error.message || 'Failed to start OAuth';
      if (error.context && typeof error.context.json === 'function') {
        try {
          const body = await error.context.json();
          if (body?.error) msg = body.error;
        } catch (_) { /* ignore */ }
      }
      throw new Error(msg);
    }
    if (data?.ok === false || data?.error) {
      throw new Error(data.error || 'OAuth is not configured for this provider');
    }
    if (!data?.url) throw new Error('No OAuth URL returned');
    window.location.href = data.url;
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
    const linkedIds = new Set(oauthRows.map((r) => r.user_connection_id).filter(Boolean));

    for (const row of toRemove) {
      await sb.from('agent_connections').delete().eq('id', row.id);
    }

    if (selectedUserConnectionIds.length) {
      const { data: userConns } = await sb
        .from('user_connections')
        .select('id, provider')
        .eq('user_id', userId)
        .in('id', selectedUserConnectionIds);

      for (const uc of userConns || []) {
        if (linkedIds.has(uc.id)) continue;
        await sb.from('agent_connections').upsert({
          user_id: userId,
          agent_id: agentId,
          app_name: uc.provider,
          user_connection_id: uc.id,
        }, { onConflict: 'agent_id,app_name' });
      }
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

  global.FlowixConnections = {
    SUPABASE_URL,
    SUPABASE_KEY,
    OAUTH_APPS,
    BROWSER_APPS,
    createClient,
    loadUserConnections,
    loadAgentConnections,
    startOAuth,
    disconnectOAuth,
    saveAgentConnectionLinks,
    parseOAuthCallbackParams,
    clearOAuthCallbackParams,
  };
})(typeof window !== 'undefined' ? window : globalThis);
