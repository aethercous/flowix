/**
 * flowix integration catalog — browse & search all supported connections.
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
    'Most teams already use the browser app. Flowix connects via OAuth/API where available, or Browserbase browser automation for secure web workflows.';

  const CONNECTIONS = [
    entry('slack', 'Slack Web App', 'Communication', {
      status: 'oauth',
      priority: 'enterprise',
      color: '#4A154B',
      icon: 'S',
      desc: 'Search channels and DMs, post updates, and respond to mentions. OAuth API access plus browser automation for the Slack web app.',
      keywords: ['slack', 'web app', 'chat', 'messaging', 'channels', 'enterprise'],
    }),
    entry('teams', 'Microsoft Teams Web', 'Communication', {
      status: 'oauth',
      oauthProvider: 'teams',
      priority: 'enterprise',
      color: '#6264A7',
      icon: 'T',
      desc: 'Read and assist in Teams channels and chats. OAuth for Microsoft Graph plus browser automation for Teams web workflows.',
      keywords: ['microsoft', 'teams', 'web app', 'chat', 'channels', 'enterprise'],
    }),
    entry('google_workspace', 'Google Workspace', 'Communication', {
      status: 'oauth',
      oauthProvider: 'google',
      priority: 'enterprise',
      color: '#4285F4',
      icon: 'G',
      desc: 'Gmail, Drive, Docs, and Calendar via your Google account. Connect once to use across agents.',
      keywords: ['gmail', 'docs', 'sheets', 'admin', 'workspace', 'enterprise', 'google'],
    }),
    entry('google_chat', 'Google Chat', 'Communication', {
      priority: 'enterprise',
      color: '#00AC47',
      icon: 'G',
      desc: WEB_COMM_DESC + ' Spaces, direct messages, and room history via Google Chat web or API.',
      keywords: ['google chat', 'spaces', 'dm', 'workspace', 'hangouts', 'enterprise', 'google'],
    }),
    entry('discord', 'Discord Web', 'Communication', {
      status: 'oauth',
      oauthProvider: 'discord',
      priority: 'enterprise',
      color: '#5865F2',
      icon: 'D',
      desc: 'Moderate servers, read channels, and answer questions. OAuth plus Discord web app automation.',
      keywords: ['discord', 'web', 'community', 'servers', 'enterprise'],
    }),
    entry('zoom', 'Zoom Web App', 'Communication', {
      priority: 'enterprise',
      status: 'browser',
      color: '#2D8CFF',
      icon: 'Z',
      desc: WEB_COMM_DESC + ' Schedule meetings, join calls, and manage Zoom web workflows with your agents.',
      keywords: ['zoom', 'web app', 'meetings', 'video', 'webinar', 'enterprise'],
    }),
    entry('webex', 'Webex App', 'Communication', {
      color: '#00BCF2',
      icon: 'W',
      desc: WEB_COMM_DESC + ' Cisco Webex meetings, messaging, and calling in the browser.',
      keywords: ['webex', 'cisco', 'meetings', 'video', 'app'],
    }),
    entry('mattermost', 'Mattermost', 'Communication', {
      color: '#0058CC',
      icon: 'M',
      desc: WEB_COMM_DESC + ' Self-hosted team messaging and channels in the Mattermost web client.',
      keywords: ['mattermost', 'open source', 'chat', 'channels'],
    }),
    entry('rocketchat', 'Rocket.Chat', 'Communication', {
      color: '#F5455C',
      icon: 'R',
      desc: WEB_COMM_DESC + ' Team chat, omnichannel inbox, and Rocket.Chat web workflows.',
      keywords: ['rocket chat', 'rocketchat', 'messaging', 'omnichannel'],
    }),
    entry('workplace', 'Workplace from Meta', 'Communication', {
      color: '#0082FB',
      icon: 'W',
      desc: WEB_COMM_DESC + ' Company feed, groups, and chat on Workplace from Meta.',
      keywords: ['workplace', 'meta', 'facebook', 'enterprise social'],
    }),
    entry('microsoft_365', 'Microsoft 365', 'Productivity', {
      color: '#D83B01',
      icon: 'M',
      keywords: ['office', 'outlook', 'word', 'excel', 'sharepoint'],
    }),
    entry('notion', 'Notion', 'Productivity', {
      status: 'oauth',
      color: '#000000',
      icon: 'N',
      desc: 'Read and update Notion pages from your knowledge base.',
      keywords: ['wiki', 'docs', 'database'],
    }),
    entry('asana', 'Asana', 'Project Management', { color: '#F06A6A', icon: 'A', keywords: ['tasks', 'projects'] }),
    entry('trello', 'Trello', 'Project Management', { color: '#0079BF', icon: 'T', keywords: ['boards', 'cards', 'kanban'] }),
    entry('monday', 'Monday.com', 'Project Management', { color: '#FF3D57', icon: 'M', keywords: ['work os', 'boards'] }),
    entry('clickup', 'ClickUp', 'Project Management', { color: '#7B68EE', icon: 'C', keywords: ['tasks', 'docs'] }),
    entry('jira', 'Jira', 'Project Management', { color: '#0052CC', icon: 'J', keywords: ['atlassian', 'issues', 'sprints'] }),
    entry('confluence', 'Confluence', 'Project Management', { color: '#172B4D', icon: 'C', keywords: ['atlassian', 'wiki'] }),
    entry('dropbox', 'Dropbox Web', 'Files & Storage', { color: '#0061FF', icon: 'D', keywords: ['files', 'cloud storage'] }),
    entry('box', 'Box', 'Files & Storage', { color: '#0061D5', icon: 'B', keywords: ['enterprise', 'files'] }),
    entry('onedrive', 'OneDrive', 'Files & Storage', { color: '#0078D4', icon: 'O', keywords: ['microsoft', 'files'] }),
    entry('google_drive', 'Google Drive', 'Files & Storage', {
      color: '#4285F4',
      icon: 'G',
      keywords: ['files', 'google', 'storage'],
    }),
    entry('google', 'Google Calendar', 'Productivity', {
      status: 'oauth',
      oauthProvider: 'google',
      color: '#4285F4',
      icon: 'G',
      desc: 'Check availability, schedule meetings, and manage your calendar.',
      keywords: ['calendar', 'meetings', 'events'],
    }),
    entry('airtable', 'Airtable', 'Productivity', { color: '#18BFFF', icon: 'A', keywords: ['spreadsheet', 'database'] }),
    entry('miro', 'Miro', 'Design & Creative', { color: '#FFD02F', icon: 'M', keywords: ['whiteboard', 'collaboration'] }),
    entry('figma', 'Figma', 'Design & Creative', { color: '#F24E1E', icon: 'F', keywords: ['design', 'ui', 'prototypes'] }),
    entry('canva', 'Canva', 'Design & Creative', { color: '#00C4CC', icon: 'C', keywords: ['graphics', 'templates'] }),
    entry('loom', 'Loom', 'Design & Creative', { color: '#625DF5', icon: 'L', keywords: ['video', 'async'] }),
    entry('hubspot', 'HubSpot', 'Sales & CRM', { color: '#FF7A59', icon: 'H', keywords: ['crm', 'marketing', 'sales'] }),
    entry('salesforce', 'Salesforce', 'Sales & CRM', { color: '#00A1E0', icon: 'S', keywords: ['crm', 'leads', 'opportunities'] }),
    entry('zendesk', 'Zendesk', 'Support & CX', { color: '#03363D', icon: 'Z', keywords: ['tickets', 'help desk'] }),
    entry('intercom', 'Intercom', 'Support & CX', { color: '#286EFA', icon: 'I', keywords: ['chat', 'support', 'messenger'] }),
    entry('freshdesk', 'Freshdesk', 'Support & CX', { color: '#25C16F', icon: 'F', keywords: ['tickets', 'support'] }),
    entry('stripe', 'Stripe Dashboard', 'Finance & Payments', { color: '#635BFF', icon: 'S', keywords: ['payments', 'billing', 'subscriptions'] }),
    entry('paypal', 'PayPal Business', 'Finance & Payments', { color: '#003087', icon: 'P', keywords: ['payments', 'invoices'] }),
    entry('quickbooks', 'QuickBooks Online', 'Finance & Payments', { color: '#2CA01C', icon: 'Q', keywords: ['accounting', 'books'] }),
    entry('xero', 'Xero', 'Finance & Payments', { color: '#13B5EA', icon: 'X', keywords: ['accounting', 'invoicing'] }),
    entry('expensify', 'Expensify', 'Finance & Payments', { color: '#1FA055', icon: 'E', keywords: ['expenses', 'receipts'] }),
    entry('docusign', 'DocuSign', 'Finance & Payments', { color: '#FFCC22', icon: 'D', keywords: ['esign', 'contracts'] }),
    entry('adobe_sign', 'Adobe Acrobat Sign', 'Finance & Payments', { color: '#EB1000', icon: 'A', keywords: ['esign', 'pdf'] }),
    entry('calendly', 'Calendly', 'Productivity', { color: '#006BFF', icon: 'C', keywords: ['scheduling', 'meetings'] }),
    entry('typeform', 'Typeform', 'Productivity', { color: '#262627', icon: 'T', keywords: ['forms', 'surveys'] }),
    entry('surveymonkey', 'SurveyMonkey', 'Productivity', { color: '#00BF6F', icon: 'S', keywords: ['surveys', 'feedback'] }),
    entry('zapier', 'Zapier', 'Automation', { color: '#FF4A00', icon: 'Z', keywords: ['zaps', 'workflow', 'integrations'] }),
    entry('make', 'Make', 'Automation', { color: '#6D00CC', icon: 'M', keywords: ['integromat', 'scenarios', 'automation'] }),
    entry('github', 'GitHub', 'Developer Tools', {
      status: 'oauth',
      color: '#181717',
      icon: 'G',
      desc: 'Analyze code, manage issues, and review pull requests.',
      keywords: ['git', 'repos', 'pull requests'],
    }),
    entry('gitlab', 'GitLab', 'Developer Tools', { color: '#FC6D26', icon: 'G', keywords: ['git', 'ci', 'devops'] }),
    entry('bitbucket', 'Bitbucket', 'Developer Tools', { color: '#2684FF', icon: 'B', keywords: ['git', 'atlassian'] }),
    entry('linear', 'Linear', 'Developer Tools', { color: '#5E6AD2', icon: 'L', keywords: ['issues', 'sprints'] }),
    entry('basecamp', 'Basecamp', 'Project Management', { color: '#1D2D35', icon: 'B', keywords: ['projects', 'messages'] }),
    entry('wrike', 'Wrike', 'Project Management', { color: '#00875A', icon: 'W', keywords: ['projects', 'tasks'] }),
    entry('smartsheet', 'Smartsheet', 'Project Management', { color: '#0073E6', icon: 'S', keywords: ['sheets', 'projects'] }),
    entry('teamwork', 'Teamwork', 'Project Management', { color: '#6F47FF', icon: 'T', keywords: ['projects', 'tasks'] }),
    entry('workday', 'Workday', 'HR & Payroll', { color: '#0875E1', icon: 'W', keywords: ['hr', 'enterprise'] }),
    entry('bamboohr', 'BambooHR', 'HR & Payroll', { color: '#73C41D', icon: 'B', keywords: ['hr', 'people'] }),
    entry('gusto', 'Gusto', 'HR & Payroll', { color: '#F45D48', icon: 'G', keywords: ['payroll', 'benefits'] }),
    entry('rippling', 'Rippling', 'HR & Payroll', { color: '#FFC600', icon: 'R', keywords: ['hr', 'it', 'payroll'] }),
    entry('adp', 'ADP Workforce Now', 'HR & Payroll', { color: '#D0271D', icon: 'A', keywords: ['payroll', 'hr'] }),
    entry('okta', 'Okta', 'Security & Identity', { color: '#007DC1', icon: 'O', keywords: ['sso', 'identity'] }),
    entry('auth0', 'Auth0', 'Security & Identity', { color: '#EB5424', icon: 'A', keywords: ['auth', 'login'] }),
    entry('onepassword', '1Password', 'Security & Identity', { color: '#0572EC', icon: '1', keywords: ['passwords', 'vault'] }),
    entry('lastpass', 'LastPass', 'Security & Identity', { color: '#D32D27', icon: 'L', keywords: ['passwords'] }),
    entry('cloudflare', 'Cloudflare Dashboard', 'Cloud & Infrastructure', { color: '#F38020', icon: 'C', keywords: ['dns', 'cdn', 'security'] }),
    entry('aws', 'AWS Console', 'Cloud & Infrastructure', { color: '#FF9900', icon: 'A', keywords: ['amazon', 'cloud'] }),
    entry('gcp', 'Google Cloud Console', 'Cloud & Infrastructure', { color: '#4285F4', icon: 'G', keywords: ['google cloud', 'gcp'] }),
    entry('azure', 'Microsoft Azure Portal', 'Cloud & Infrastructure', { color: '#0078D4', icon: 'A', keywords: ['microsoft', 'cloud'] }),
    entry('vercel', 'Vercel', 'Cloud & Infrastructure', { color: '#000000', icon: 'V', keywords: ['deploy', 'hosting', 'nextjs'] }),
    entry('netlify', 'Netlify', 'Cloud & Infrastructure', { color: '#00C7B7', icon: 'N', keywords: ['deploy', 'jamstack'] }),
    entry('heroku', 'Heroku', 'Cloud & Infrastructure', { color: '#430098', icon: 'H', keywords: ['paas', 'dyno'] }),
    entry('digitalocean', 'DigitalOcean', 'Cloud & Infrastructure', { color: '#0080FF', icon: 'D', keywords: ['droplets', 'vps'] }),
    entry('supabase', 'Supabase', 'Cloud & Infrastructure', { color: '#3ECF8E', icon: 'S', keywords: ['database', 'postgres', 'auth'] }),
    entry('firebase', 'Firebase Console', 'Cloud & Infrastructure', { color: '#FFCA28', icon: 'F', keywords: ['google', 'mobile', 'firestore'] }),
    entry('postman', 'Postman Web', 'Developer Tools', { color: '#FF6C37', icon: 'P', keywords: ['api', 'collections'] }),
    entry('tableau', 'Tableau Cloud', 'Analytics & BI', { color: '#E97627', icon: 'T', keywords: ['bi', 'dashboards'] }),
    entry('powerbi', 'Power BI Service', 'Analytics & BI', { color: '#F2C811', icon: 'P', keywords: ['microsoft', 'reports'] }),
    entry('looker', 'Looker Studio', 'Analytics & BI', { color: '#4285F4', icon: 'L', keywords: ['google', 'dashboards'] }),
    entry('mixpanel', 'Mixpanel', 'Analytics & BI', { color: '#7856FF', icon: 'M', keywords: ['product analytics', 'events'] }),
    entry('amplitude', 'Amplitude', 'Analytics & BI', { color: '#1F77B4', icon: 'A', keywords: ['product analytics'] }),
    entry('hotjar', 'Hotjar', 'Analytics & BI', { color: '#FF3C00', icon: 'H', keywords: ['heatmaps', 'recordings'] }),
    entry('mailchimp', 'Mailchimp', 'Marketing', { color: '#FFE01B', icon: 'M', keywords: ['email', 'campaigns'] }),
    entry('klaviyo', 'Klaviyo', 'Marketing', { color: '#212322', icon: 'K', keywords: ['email', 'sms', 'ecommerce'] }),
    entry('brevo', 'Brevo', 'Marketing', { color: '#0B996E', icon: 'B', keywords: ['sendinblue', 'email', 'crm'] }),
    entry('apollo', 'Apollo.io', 'Marketing', { color: '#3B49DF', icon: 'A', keywords: ['sales intelligence', 'outbound'] }),
    entry('linkedin', 'LinkedIn', 'Marketing', {
      status: 'browser',
      color: '#0A66C2',
      icon: 'in',
      desc: 'Browse feed, post updates, and reply via Browserbase (per agent).',
      keywords: ['social', 'networking', 'recruiting'],
    }),
    entry('indeed', 'Indeed Employer', 'Recruiting', { color: '#2164F3', icon: 'I', keywords: ['jobs', 'hiring'] }),
    entry('glassdoor', 'Glassdoor for Employers', 'Recruiting', { color: '#0CAA41', icon: 'G', keywords: ['reviews', 'employer brand'] }),
    entry('greenhouse', 'Greenhouse', 'Recruiting', { color: '#24A47F', icon: 'G', keywords: ['ats', 'hiring'] }),
    entry('lever', 'Lever', 'Recruiting', { color: '#533FE3', icon: 'L', keywords: ['ats', 'recruiting'] }),
    entry('shopify', 'Shopify Admin', 'E-commerce & Web', { color: '#96BF48', icon: 'S', keywords: ['store', 'orders'] }),
    entry('woocommerce', 'WooCommerce', 'E-commerce & Web', { color: '#96588A', icon: 'W', keywords: ['wordpress', 'store'] }),
    entry('webflow', 'Webflow', 'E-commerce & Web', { color: '#146EF5', icon: 'W', keywords: ['cms', 'design'] }),
    entry('framer', 'Framer', 'E-commerce & Web', { color: '#0055FF', icon: 'F', keywords: ['sites', 'design'] }),
    entry('wordpress', 'WordPress.com', 'E-commerce & Web', { color: '#21759B', icon: 'W', keywords: ['blog', 'cms'] }),
    entry('squarespace', 'Squarespace', 'E-commerce & Web', { color: '#000000', icon: 'S', keywords: ['website', 'builder'] }),
    entry('wix', 'Wix', 'E-commerce & Web', { color: '#0C6EFC', icon: 'W', keywords: ['website', 'builder'] }),
    entry('skype', 'Skype Web', 'Communication', { color: '#00AFF0', icon: 'S', keywords: ['calls', 'chat'] }),
    entry('evernote', 'Evernote Web', 'Productivity', { color: '#00A82D', icon: 'E', keywords: ['notes', 'notebooks'] }),
    entry('coda', 'Coda', 'Productivity', { color: '#F46A54', icon: 'C', keywords: ['docs', 'automation'] }),
    entry('monday_crm', 'Monday CRM', 'Sales & CRM', { color: '#FF3D57', icon: 'M', keywords: ['crm', 'monday'] }),
    entry('netsuite', 'Oracle NetSuite', 'Enterprise & ERP', { color: '#BF3533', icon: 'N', keywords: ['erp', 'oracle'] }),
    entry('sap_successfactors', 'SAP SuccessFactors', 'Enterprise & ERP', { color: '#0FAAFF', icon: 'S', keywords: ['hr', 'sap'] }),
    entry('servicenow', 'ServiceNow', 'Enterprise & ERP', { color: '#81B5A1', icon: 'S', keywords: ['itsm', 'workflow'] }),
    entry('openai', 'OpenAI Platform', 'AI Platforms', { color: '#10A37F', icon: 'O', keywords: ['gpt', 'api', 'models'] }),
    entry('claude', 'Claude.ai', 'AI Platforms', { color: '#D97757', icon: 'C', keywords: ['anthropic', 'ai', 'chat'] }),
    entry('perplexity', 'Perplexity AI', 'AI Platforms', { color: '#20808D', icon: 'P', keywords: ['search', 'ai', 'answers'] }),
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

  global.FlowixConnectionCatalog = {
    CONNECTIONS: CONNECTIONS,
    CATEGORIES: CATEGORIES,
    searchConnections: searchConnections,
    getOAuthApps: getOAuthApps,
    getBrowserApps: getBrowserApps,
    getConnectionsPageApps: getConnectionsPageApps,
    getCatalogBrowseApps: getCatalogBrowseApps,
    getById: getById,
    getEnterpriseCommunicationApps: getEnterpriseCommunicationApps,
    compareConnections: compareConnections,
  };
})(typeof window !== 'undefined' ? window : globalThis);
