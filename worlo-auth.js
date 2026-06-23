/**
 * Shared Worlo auth — Supabase sign in/up modals and redirects.
 */
(function (global) {
  const SUPABASE_URL = 'https://utofnywijqsozjqmkhcn.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_NFpInIt2anAJxn2slHZIuQ_BsEw4g1n';
  const DASHBOARD = 'dashboard.html';
  const LANDING = '/';

  let sb = null;
  let redirectAfterAuth = DASHBOARD;
  let stayOnLanding = false;

  function getClient() {
    if (!sb && global.supabase) {
      sb = global.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: {
          flowType: 'pkce',
          detectSessionInUrl: true,
          persistSession: true,
          autoRefreshToken: true
        }
      });
    }
    return sb;
  }

  function completeAuthSuccess(session) {
    hideModals();
    if (stayOnLanding) {
      refreshAuthUi(session);
      toast('Signed in with Google', 'success');
    } else {
      navigate(redirectAfterAuth);
    }
  }

  function toast(msg, type) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const el = document.createElement('div');
    el.className = 'toast' + (type ? ' ' + type : '');
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(function () { el.remove(); }, 4000);
  }

  function navigate(url) {
    document.body.classList.add('fx-page-exit');
    setTimeout(function () {
      window.location.href = url;
    }, 220);
  }

  function showSignIn() {
    var signin = document.getElementById('signin-modal');
    var signup = document.getElementById('signup-modal');
    if (signin) signin.classList.add('active');
    if (signup) signup.classList.remove('active');
    document.body.classList.add('fx-modal-open');
  }

  function showSignUp() {
    var signin = document.getElementById('signin-modal');
    var signup = document.getElementById('signup-modal');
    if (signup) signup.classList.add('active');
    if (signin) signin.classList.remove('active');
    document.body.classList.add('fx-modal-open');
  }

  function hideModals() {
    var signin = document.getElementById('signin-modal');
    var signup = document.getElementById('signup-modal');
    if (signin) signin.classList.remove('active');
    if (signup) signup.classList.remove('active');
    document.body.classList.remove('fx-modal-open');
  }

  function setLoading(btn, loading) {
    if (!btn) return;
    btn.disabled = loading;
    btn.classList.toggle('fx-btn-loading', loading);
    var label = btn.querySelector('.fx-btn-google-label');
    if (label) {
      if (loading) label.dataset.fxLabel = label.textContent;
      label.textContent = loading ? 'Please wait…' : (label.dataset.fxLabel || label.textContent);
      return;
    }
    if (loading) btn.dataset.fxLabel = btn.textContent;
    btn.textContent = loading ? 'Please wait…' : (btn.dataset.fxLabel || btn.textContent);
  }

  function friendlyAuthError(message) {
    if (!message) return 'Sign-in failed. Please try again.';
    if (/provider is not enabled/i.test(message) || /Unsupported provider/i.test(message)) {
      return 'Google sign-in is not enabled for this project yet. Enable Google under Supabase → Authentication → Providers.';
    }
    if (/access_denied|verification process/i.test(message)) {
      return 'Google blocked sign-in. In Google Cloud → OAuth consent screen, add your email under Test users, or Publish app with only email/profile scopes (no Calendar).';
    }
    return message;
  }

  function setGoogleLoading(loading) {
    document.querySelectorAll('[data-auth="google"]').forEach(function (btn) {
      setLoading(btn, loading);
    });
  }

  function getAuthRedirectUrl() {
    var url = new URL(window.location.href);
    url.searchParams.delete('code');
    url.searchParams.delete('error');
    url.searchParams.delete('error_description');
    var path = url.pathname;
    if (path === '/neura_ui.html' || path.endsWith('/neura_ui.html')) {
      path = '/';
    }
    return url.origin + path + url.search;
  }

  function cleanAuthUrl() {
    var url = new URL(window.location.href);
    var hadAuthParams = url.searchParams.has('code') ||
      url.searchParams.has('error') ||
      (url.hash && url.hash.indexOf('access_token') !== -1);
    url.searchParams.delete('code');
    url.searchParams.delete('error');
    url.searchParams.delete('error_description');
    if (url.hash && url.hash.indexOf('access_token') !== -1) {
      url.hash = '';
    }
    if (hadAuthParams) {
      window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    }
  }

  function termsAccepted() {
    var cb = document.getElementById('signup-accept-terms');
    return !cb || cb.checked;
  }

  async function handleGoogleAuth() {
    var client = getClient();
    if (!client) {
      toast('Authentication is not available', 'error');
      return;
    }

    var signupModal = document.getElementById('signup-modal');
    if (signupModal && signupModal.classList.contains('active') && !termsAccepted()) {
      toast('Please accept the Terms of Service and Privacy Policy', 'error');
      return;
    }

    setGoogleLoading(true);
    try {
      var result = await client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: getAuthRedirectUrl()
        }
      });
      if (result.error) {
        toast(friendlyAuthError(result.error.message), 'error');
        setGoogleLoading(false);
        return;
      }
      if (result.data && result.data.url) {
        window.location.assign(result.data.url);
        return;
      }
      toast('Google sign-in could not be started', 'error');
    } catch (e) {
      toast('Google sign-in failed. Please try again.', 'error');
    } finally {
      setGoogleLoading(false);
    }
  }

  async function waitForSession(client, attempts, delayMs) {
    for (var i = 0; i < attempts; i++) {
      var res = await client.auth.getSession();
      if (res.data && res.data.session) return res.data.session;
      if (i < attempts - 1) {
        await new Promise(function (resolve) { setTimeout(resolve, delayMs); });
      }
    }
    return null;
  }

  async function finishOAuthReturn(client) {
    var session = await waitForSession(client, 6, 100);
    cleanAuthUrl();
    if (session) {
      completeAuthSuccess(session);
      return true;
    }
    return false;
  }

  async function handleOAuthReturn() {
    var client = getClient();
    if (!client) return false;

    var params = new URLSearchParams(window.location.search);
    if (params.get('error')) {
      toast(params.get('error_description') || params.get('error') || 'Sign-in was cancelled', 'error');
      cleanAuthUrl();
      return false;
    }

    var code = params.get('code');
    if (code) {
      try {
        // detectSessionInUrl may already have exchanged the code.
        var existing = await waitForSession(client, 4, 75);
        if (existing) {
          cleanAuthUrl();
          completeAuthSuccess(existing);
          return true;
        }

        var exchanged = await client.auth.exchangeCodeForSession(code);
        if (exchanged.data && exchanged.data.session) {
          cleanAuthUrl();
          completeAuthSuccess(exchanged.data.session);
          return true;
        }
        if (exchanged.error) {
          return await finishOAuthReturn(client);
        }

        cleanAuthUrl();
        return false;
      } catch (e) {
        return await finishOAuthReturn(client);
      }
    }

    if (window.location.hash && window.location.hash.indexOf('access_token') !== -1) {
      try {
        return await finishOAuthReturn(client);
      } catch (e) {
        cleanAuthUrl();
        return false;
      }
    }

    return false;
  }

  async function handleSignIn() {
    var emailEl = document.getElementById('signin-email');
    var passEl = document.getElementById('signin-password');
    var btn = document.getElementById('btn-signin-submit');
    var email = (emailEl && emailEl.value || '').trim();
    var password = (passEl && passEl.value || '').trim();

    if (!email || !password) {
      toast('Please fill in all fields', 'error');
      return;
    }

    setLoading(btn, true);
    try {
      var client = getClient();
      var result = await client.auth.signInWithPassword({ email: email, password: password });
      if (result.error) {
        toast(result.error.message, 'error');
      } else {
        hideModals();
        if (stayOnLanding) {
          refreshAuthUi(result.data.session);
          toast('Signed in', 'success');
        } else {
          navigate(redirectAfterAuth);
        }
      }
    } catch (e) {
      toast('Sign in failed. Please try again.', 'error');
    } finally {
      setLoading(btn, false);
    }
  }

  async function handleSignUp() {
    var emailEl = document.getElementById('signup-email');
    var passEl = document.getElementById('signup-password');
    var btn = document.getElementById('btn-signup-submit');
    var email = (emailEl && emailEl.value || '').trim();
    var password = (passEl && passEl.value || '').trim();

    if (!email || !password) {
      toast('Please fill in all fields', 'error');
      return;
    }
    if (password.length < 6) {
      toast('Password must be at least 6 characters', 'error');
      return;
    }
    if (!termsAccepted()) {
      toast('Please accept the Terms of Service and Privacy Policy', 'error');
      return;
    }

    setLoading(btn, true);
    try {
      var client = getClient();
      var result = await client.auth.signUp({
        email: email,
        password: password,
        options: { emailRedirectTo: window.location.origin + '/' + DASHBOARD }
      });
      if (result.error) {
        toast(result.error.message, 'error');
      } else if (result.data && result.data.session) {
        hideModals();
        if (stayOnLanding) {
          refreshAuthUi(result.data.session);
          toast('Account ready', 'success');
        } else {
          navigate(redirectAfterAuth);
        }
      } else {
        toast('Account created. Check your email to confirm, then sign in.', 'success');
        showSignIn();
      }
    } catch (e) {
      toast('Sign up failed. Please try again.', 'error');
    } finally {
      setLoading(btn, false);
    }
  }

  async function checkSession(redirectIfAuthed) {
    var client = getClient();
    if (!client) return null;
    var sessionRes = await client.auth.getSession();
    var session = sessionRes.data && sessionRes.data.session;
    if (session && redirectIfAuthed) {
      navigate(redirectIfAuthed);
    }
    return session;
  }

  async function handleSignOut() {
    var client = getClient();
    if (client) await client.auth.signOut();
    refreshAuthUi(null);
    toast('Signed out', 'success');
  }

  function refreshAuthUi(session) {
    var signedIn = !!(session && session.user);
    document.querySelectorAll('[data-auth-guest]').forEach(function (el) {
      el.style.display = signedIn ? 'none' : '';
      el.hidden = signedIn;
    });
    document.querySelectorAll('[data-auth-user]').forEach(function (el) {
      el.style.display = signedIn ? '' : 'none';
      el.hidden = !signedIn;
    });
    var emailEl = document.getElementById('fx-nav-user-email');
    if (emailEl && signedIn) {
      emailEl.textContent = session.user.email || 'Signed in';
    }
  }

  function bindSignOut() {
    document.querySelectorAll('[data-auth="signout"]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault();
        handleSignOut();
      });
    });
  }

  function bindModalHandlers() {
    var pairs = [
      ['btn-signin', showSignIn],
      ['btn-signup', showSignUp],
      ['btn-hero-signup', showSignUp],
      ['btn-cta-signup', showSignUp],
      ['toggle-signup-from-signin', showSignUp],
      ['toggle-signin-from-signup', showSignIn]
    ];

    pairs.forEach(function (pair) {
      var el = document.getElementById(pair[0]);
      if (el) {
        el.addEventListener('click', function (e) {
          e.preventDefault();
          pair[1]();
        });
      }
    });

    document.querySelectorAll('[data-auth="signin"]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault();
        showSignIn();
      });
    });

    document.querySelectorAll('[data-auth="signup"]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault();
        showSignUp();
      });
    });

    document.querySelectorAll('[data-auth="dashboard"]').forEach(function (el) {
      el.addEventListener('click', async function (e) {
        e.preventDefault();
        var session = await checkSession(false);
        if (session) {
          navigate(DASHBOARD);
        } else {
          showSignUp();
        }
      });
    });

    var signinSubmit = document.getElementById('btn-signin-submit');
    var signupSubmit = document.getElementById('btn-signup-submit');
    if (signinSubmit) signinSubmit.addEventListener('click', handleSignIn);
    if (signupSubmit) signupSubmit.addEventListener('click', handleSignUp);

    document.querySelectorAll('[data-auth="google"]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault();
        handleGoogleAuth();
      });
    });

    document.querySelectorAll('.modal-overlay').forEach(function (modal) {
      modal.addEventListener('click', function (e) {
        if (e.target === modal) hideModals();
      });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') hideModals();
    });

    ['signin-email', 'signin-password'].forEach(function (id, i, arr) {
      var el = document.getElementById(id);
      if (el) {
        el.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') handleSignIn();
        });
      }
    });

    ['signup-email', 'signup-password'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) {
        el.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') handleSignUp();
        });
      }
    });
  }

  function openFromQuery() {
    var params = new URLSearchParams(window.location.search);
    if (!params.get('signup') && !params.get('signin')) return;
    var client = getClient();
    if (!client) return;
    client.auth.getSession().then(function (res) {
      if (res.data && res.data.session) return;
      if (params.get('signup') === '1') showSignUp();
      else if (params.get('signin') === '1') showSignIn();
    });
  }

  function bindSmoothLinks() {
    document.querySelectorAll('a.fx-action[href]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        if (a.hasAttribute('data-auth')) return;
        var href = a.getAttribute('href');
        if (!href || href.charAt(0) === '#') return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        navigate(href);
      });
    });
  }

  function init(options) {
    options = options || {};
    redirectAfterAuth = options.redirectAfterAuth || DASHBOARD;
    stayOnLanding = !!options.stayOnLanding;

    if (!global.supabase) {
      console.warn('Supabase JS not loaded');
      return;
    }

    bindModalHandlers();
    bindSignOut();
    bindSmoothLinks();
    openFromQuery();

    var client = getClient();
    if (client) {
      handleOAuthReturn().then(function () {
        return client.auth.getSession();
      }).then(function (res) {
        refreshAuthUi(res.data && res.data.session);
        if (options.redirectIfAuthed && res.data && res.data.session) {
          navigate(redirectAfterAuth);
        }
      });
      client.auth.onAuthStateChange(function (event, session) {
        refreshAuthUi(session);
        if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session) {
          var params = new URLSearchParams(window.location.search);
          if (params.has('code') || (window.location.hash && window.location.hash.indexOf('access_token') !== -1)) {
            cleanAuthUrl();
          }
        }
      });
    }
  }

  async function requireAuth(orRedirect) {
    orRedirect = orRedirect || LANDING + '?signin=1';
    var session = await checkSession(false);
    if (!session) {
      navigate(orRedirect);
      return null;
    }
    return session;
  }

  global.WorloAuth = {
    init: init,
    showSignIn: showSignIn,
    showSignUp: showSignUp,
    hideModals: hideModals,
    requireAuth: requireAuth,
    refreshAuthUi: refreshAuthUi,
    handleSignOut: handleSignOut,
    handleGoogleAuth: handleGoogleAuth,
    getClient: getClient,
    navigate: navigate,
    toast: toast,
    SUPABASE_URL: SUPABASE_URL,
    SUPABASE_KEY: SUPABASE_KEY
  };
})(window);
