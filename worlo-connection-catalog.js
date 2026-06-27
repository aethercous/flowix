/**
 * worlo integration catalog — browse & search all supported connections.
 */
(function (global) {
  function entry(id, label, category, opts) {
    opts = opts || {};
    const status = opts.status || 'coming_soon';
    return {
      id: id,
      label: label,
      category: category,
      desc: opts.desc || ('Connect ' + label + ' so your agents can read and act on data you authorize.'),
      icon: opts.icon || label.charAt(0),
      color: opts.color || '#5c5c6a',
      keywords: opts.keywords || [],
      status: status,
      priority: opts.priority || null,
      oauthProvider: opts.oauthProvider != null ? opts.oauthProvider : (status === 'oauth' ? id : null),
    };
  }

  const WEB_COMM_DESC =
    'Most teams already use the browser app. Worlo connects via OAuth/API where available, or Browserbase browser automation for secure web workflows.';

  const CONNECTIONS = [
    entry('teams', 'Microsoft Teams', 'Communication', {
      status: 'oauth',
      oauthProvider: 'teams',
      priority: 'enterprise',
      color: '#6264A7',
      icon: 'T',
      desc: 'Read and assist in Teams channels and chats. OAuth for Microsoft Graph plus browser automation for Teams web workflows.',
      keywords: ['microsoft', 'teams', 'outlook', 'office', 'enterprise'],
    }),
    entry('microsoft_365', 'Microsoft 365', 'Productivity', {
      color: '#D83B01',
      icon: 'M',
      desc: 'Outlook, Word, Excel, SharePoint, and other Microsoft 365 apps.',
      keywords: ['microsoft', 'office', 'outlook', 'word', 'excel', 'sharepoint', 'enterprise'],
    }),
    entry('google_workspace', 'Google Workspace', 'Communication', {
      status: 'oauth',
      oauthProvider: 'google',
      priority: 'enterprise',
      color: '#4285F4',
      icon: 'G',
      desc: 'Gmail, Drive, Docs, and Calendar via your Google account. Connect once to use across agents.',
      keywords: ['google', 'gmail', 'drive', 'docs', 'sheets', 'workspace', 'enterprise'],
    }),
    entry('slack', 'Slack', 'Communication', {
      status: 'oauth',
      priority: 'enterprise',
      color: '#4A154B',
      icon: 'S',
      desc: 'Search channels and DMs, post updates, and respond to mentions. OAuth API access plus browser automation for the Slack web app.',
      keywords: ['slack', 'slack technologies', 'chat', 'messaging', 'channels', 'enterprise'],
    }),
    entry('zoom', 'Zoom', 'Communication', {
      priority: 'enterprise',
      status: 'browser',
      color: '#2D8CFF',
      icon: 'Z',
      desc: WEB_COMM_DESC + ' Schedule meetings, join calls, and manage Zoom web workflows with your agents.',
      keywords: ['zoom', 'zoom video communications', 'meetings', 'video', 'webinar', 'enterprise'],
    }),
    entry('github', 'GitHub', 'Developer Tools', {
      status: 'oauth',
      color: '#181717',
      icon: 'G',
      desc: 'Analyze code, manage issues, and review pull requests.',
      keywords: ['github', 'git', 'repos', 'pull requests', 'code collaboration'],
    }),
    entry('jira', 'Jira', 'Project Management', {
      status: 'browser',
      color: '#0052CC',
      icon: 'J',
      desc: 'Track issues, sprints, and project work in Atlassian Jira via secure browser automation.',
      keywords: ['atlassian', 'jira', 'issues', 'sprints', 'project management'],
    }),
    entry('confluence', 'Confluence', 'Project Management', {
      color: '#172B4D',
      icon: 'C',
      desc: 'Read and update team wikis and documentation in Atlassian Confluence.',
      keywords: ['atlassian', 'confluence', 'wiki', 'docs', 'knowledge base'],
    }),
    entry('trello', 'Trello', 'Project Management', {
      color: '#0079BF',
      icon: 'T',
      desc: 'Manage boards, cards, and kanban workflows in Atlassian Trello.',
      keywords: ['atlassian', 'trello', 'boards', 'cards', 'kanban'],
    }),
    entry('salesforce', 'Salesforce', 'Sales & CRM', {
      status: 'browser',
      color: '#00A1E0',
      icon: 'S',
      desc: 'Sales pipelines, accounts, and customer management in Salesforce via secure browser automation.',
      keywords: ['salesforce', 'crm', 'leads', 'opportunities', 'sales', 'customer management'],
    }),
    entry('servicenow', 'ServiceNow', 'Enterprise & ERP', {
      color: '#81B5A1',
      icon: 'S',
      desc: 'IT service management and enterprise workflows in ServiceNow.',
      keywords: ['servicenow', 'itsm', 'workflow', 'enterprise', 'it'],
    }),
    entry('aws', 'AWS', 'Cloud & Infrastructure', {
      color: '#FF9900',
      icon: 'A',
      desc: 'Manage Amazon Web Services cloud infrastructure and resources.',
      keywords: ['aws', 'amazon web services', 'cloud', 'infrastructure'],
    }),
    entry('notion', 'Notion', 'Productivity', {
      status: 'oauth',
      color: '#000000',
      icon: 'N',
      desc: 'Read and update Notion pages from your workspace.',
      keywords: ['notion', 'notion labs', 'wiki', 'docs', 'database', 'workspace'],
    }),
    entry('hubspot', 'HubSpot', 'Sales & CRM', {
      status: 'browser',
      color: '#FF7A59',
      icon: 'H',
      desc: 'Sales, marketing, and CRM workflows in HubSpot via secure browser automation.',
      keywords: ['hubspot', 'crm', 'marketing', 'sales'],
    }),
    entry('dropbox', 'Dropbox', 'Files & Storage', {
      status: 'browser',
      color: '#0061FF',
      icon: 'D',
      desc: 'File sharing and cloud storage in Dropbox via secure browser automation.',
      keywords: ['dropbox', 'files', 'cloud storage', 'sharing'],
    }),
    entry('figma', 'Figma', 'Design & Creative', {
      color: '#F24E1E',
      icon: 'F',
      desc: 'UI/UX design files, prototypes, and collaboration in Figma.',
      keywords: ['figma', 'design', 'ui', 'ux', 'prototypes'],
    }),
    entry('stripe', 'Stripe', 'Finance & Payments', {
      color: '#635BFF',
      icon: 'S',
      desc: 'Payments, billing, and subscriptions in the Stripe dashboard.',
      keywords: ['stripe', 'payments', 'billing', 'subscriptions'],
    }),
    entry('okta', 'Okta', 'Security & Identity', {
      color: '#007DC1',
      icon: 'O',
      desc: 'Single sign-on, identity, and access management with Okta.',
      keywords: ['okta', 'sso', 'identity', 'login', 'security'],
    }),
  ];

  const byId = {};
  CONNECTIONS.forEach(function (c) {
    byId[c.id] = c;
  });

  const CATEGORIES = [];
  CONNECTIONS.forEach(function (c) {
    if (CATEGORIES.indexOf(c.category) === -1) CATEGORIES.push(c.category);
  });
  CATEGORIES.sort();

  function normalizeQuery(q) {
    return String(q || '').trim().toLowerCase();
  }

  function connectionSearchText(c) {
    return [
      c.label,
      c.desc,
      c.category,
      c.id,
      c.oauthProvider || '',
      (c.keywords || []).join(' '),
    ].join(' ').toLowerCase();
  }

  function compareConnections(a, b) {
    const pa = a.priority === 'enterprise' ? 0 : 1;
    const pb = b.priority === 'enterprise' ? 0 : 1;
    if (pa !== pb) return pa - pb;
    if (a.category === 'Communication' && b.category !== 'Communication') return -1;
    if (b.category === 'Communication' && a.category !== 'Communication') return 1;
    return a.label.localeCompare(b.label);
  }

  function searchConnections(query, options) {
    options = options || {};
    const q = normalizeQuery(query);
    let list = CONNECTIONS.slice();
    if (options.status) {
      list = list.filter(function (c) { return c.status === options.status; });
    }
    if (options.category) {
      list = list.filter(function (c) { return c.category === options.category; });
    }
    if (options.priority) {
      list = list.filter(function (c) { return c.priority === options.priority; });
    }
    if (q) {
      list = list.filter(function (c) {
        return connectionSearchText(c).indexOf(q) !== -1;
      });
    }
    list.sort(compareConnections);
    return list;
  }

  function getEnterpriseCommunicationApps() {
    return CONNECTIONS.filter(function (c) {
      return c.priority === 'enterprise' && c.category === 'Communication';
    }).sort(compareConnections);
  }

  function getOAuthApps() {
    return CONNECTIONS.filter(function (c) { return c.status === 'oauth'; }).sort(compareConnections);
  }

  function getBrowserApps() {
    return CONNECTIONS.filter(function (c) { return c.status === 'browser'; }).sort(compareConnections);
  }

  /** Primary connections page: live OAuth + browser automation apps. */
  function getConnectionsPageApps() {
    return getOAuthApps().concat(getBrowserApps());
  }

  function getCatalogBrowseApps() {
    return CONNECTIONS.filter(function (c) {
      return c.status !== 'oauth' && c.status !== 'browser';
    }).sort(compareConnections);
  }

  function getById(id) {
    return byId[id] || null;
  }

  function getLabelForProvider(providerId) {
    const direct = byId[providerId];
    if (direct) return direct.label;
    const match = CONNECTIONS.find(function (c) {
      return c.oauthProvider === providerId;
    });
    return match ? match.label : providerId;
  }

  global.WorloConnectionCatalog = {
    CONNECTIONS: CONNECTIONS,
    CATEGORIES: CATEGORIES,
    searchConnections: searchConnections,
    getOAuthApps: getOAuthApps,
    getBrowserApps: getBrowserApps,
    getConnectionsPageApps: getConnectionsPageApps,
    getCatalogBrowseApps: getCatalogBrowseApps,
    getById: getById,
    getLabelForProvider: getLabelForProvider,
    getEnterpriseCommunicationApps: getEnterpriseCommunicationApps,
    compareConnections: compareConnections,
  };
})(typeof window !== 'undefined' ? window : globalThis);
