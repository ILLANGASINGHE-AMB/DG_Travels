/* ============================================================
   DG Travels — site content + admin authentication
   ------------------------------------------------------------
   Loaded on every page view. In the default "User View Mode" all it
   does is:

     1. fetch /api/config for the Supabase URL + anon key
     2. read the published content (settings, tours, vehicles, sections)
     3. paint it over the copy that ships inside index.html
     4. hide any section the owner has switched off

   Everything is progressive. No Supabase configured, offline, request
   blocked — the page keeps the static copy it was authored with, and
   the Log In button quietly stays hidden. Nothing here can leave the
   visitor with a blank page.

   The heavyweight editing UI lives in admin.js and is only downloaded
   once an admin has actually signed in.
   ============================================================ */

(function () {
  'use strict';

  var SESSION_KEY = 'dg.session';
  var ASSET_BUCKET = 'site-assets';

  /* ---------------------------------------------------------
     Tiny event bus so admin.js can react without polling
     --------------------------------------------------------- */
  var listeners = {};

  function on(name, fn) {
    (listeners[name] || (listeners[name] = [])).push(fn);
  }

  function emit(name, payload) {
    (listeners[name] || []).forEach(function (fn) {
      try { fn(payload); } catch (err) { console.error('[cms] listener failed:', err); }
    });
    // Mirrored onto the document so the page's own script can react
    // without caring whether this file loaded first.
    try {
      document.dispatchEvent(new CustomEvent('dg:' + name, { detail: payload }));
    } catch (err) { /* very old browser — the internal bus still fired */ }
  }

  /* ---------------------------------------------------------
     State
     --------------------------------------------------------- */
  var cfg = { url: '', anonKey: '' };
  var session = null;      // { access_token, refresh_token, expires_at, user }
  var isAdmin = false;
  var adminUiLoaded = false;

  var content = {
    settings: {},          // key -> value
    tours: [],
    vehicles: [],
    sections: {}           // key -> { label, visible, sort_order }
  };

  /* ---------------------------------------------------------
     Helpers
     --------------------------------------------------------- */
  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function configured() {
    return Boolean(cfg.url && cfg.anonKey);
  }

  function readStoredSession() {
    try {
      var raw = window.localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  function storeSession(next) {
    session = next;
    try {
      if (next) window.localStorage.setItem(SESSION_KEY, JSON.stringify(next));
      else window.localStorage.removeItem(SESSION_KEY);
    } catch (err) {
      /* private browsing — the session just won't survive a reload */
    }
  }

  /* ---------------------------------------------------------
     Supabase Auth (GoTrue REST — no SDK, no npm install)
     --------------------------------------------------------- */
  function authFetch(path, options) {
    options = options || {};
    var headers = Object.assign({
      apikey: cfg.anonKey,
      'Content-Type': 'application/json'
    }, options.headers || {});

    return fetch(cfg.url + '/auth/v1' + path, Object.assign({}, options, { headers: headers }))
      .then(function (res) {
        return res.text().then(function (text) {
          var body = null;
          try { body = text ? JSON.parse(text) : null; } catch (err) { body = null; }
          if (!res.ok) {
            var message = (body && (body.error_description || body.msg || body.message))
              || 'Request failed (' + res.status + ')';
            var error = new Error(message);
            error.status = res.status;
            throw error;
          }
          return body;
        });
      });
  }

  function signIn(email, password) {
    return authFetch('/token?grant_type=password', {
      method: 'POST',
      body: JSON.stringify({ email: email, password: password })
    }).then(function (data) {
      storeSession(data);
      return checkAdmin();
    }).then(function (admin) {
      // A valid Supabase account that is not on the admin list gets no
      // editing powers. Sign it straight back out rather than leaving a
      // half-privileged session lying around.
      if (!admin) {
        return signOut().then(function () {
          throw new Error('This account is not an administrator of this site.');
        });
      }
      emit('auth', { session: session, isAdmin: true });
      return session;
    });
  }

  function signOut() {
    var token = session && session.access_token;
    storeSession(null);
    isAdmin = false;
    document.documentElement.classList.remove('dg-admin');
    refreshAuthButtons();
    emit('auth', { session: null, isAdmin: false });

    if (!token) return Promise.resolve();
    return authFetch('/logout', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token }
    }).catch(function () { /* the local session is already gone */ });
  }

  function sendPasswordReset(email) {
    return authFetch('/recover', {
      method: 'POST',
      body: JSON.stringify({ email: email })
    });
  }

  /**
   * Swap an expiring access token for a fresh one. Supabase tokens last
   * an hour; refresh a minute early so a long editing session never
   * fails a save halfway through.
   */
  function refreshSession() {
    if (!session || !session.refresh_token) return Promise.resolve(null);

    return authFetch('/token?grant_type=refresh_token', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: session.refresh_token })
    }).then(function (data) {
      storeSession(data);
      return data;
    }).catch(function () {
      // The refresh token is spent or revoked — drop back to visitor mode
      // rather than leaving dead editing controls on screen.
      storeSession(null);
      isAdmin = false;
      document.documentElement.classList.remove('dg-admin');
      refreshAuthButtons();
      emit('auth', { session: null, isAdmin: false });
      return null;
    });
  }

  function validSession() {
    if (!session) return Promise.resolve(null);
    var expiresAt = Number(session.expires_at || 0);           // seconds
    var soon = Math.floor(Date.now() / 1000) + 60;
    if (expiresAt && expiresAt > soon) return Promise.resolve(session);
    return refreshSession();
  }

  function checkAdmin() {
    return validSession().then(function (live) {
      if (!live) { isAdmin = false; return false; }
      return rest('/rpc/is_admin', { method: 'POST', body: JSON.stringify({}) })
        .then(function (result) {
          isAdmin = result === true;
          return isAdmin;
        })
        .catch(function () { isAdmin = false; return false; });
    });
  }

  /* ---------------------------------------------------------
     Supabase REST (PostgREST)
     --------------------------------------------------------- */
  function rest(path, options) {
    options = options || {};
    var headers = Object.assign({
      apikey: cfg.anonKey,
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + ((session && session.access_token) || cfg.anonKey)
    }, options.headers || {});

    return fetch(cfg.url + '/rest/v1' + path, Object.assign({}, options, { headers: headers }))
      .then(function (res) {
        return res.text().then(function (text) {
          var body = null;
          try { body = text ? JSON.parse(text) : null; } catch (err) { body = text; }
          if (!res.ok) {
            var message = (body && (body.message || body.error)) || 'Request failed (' + res.status + ')';
            var error = new Error(message);
            error.status = res.status;
            error.details = body && body.details;
            throw error;
          }
          return body;
        });
      });
  }

  /** Every write goes through here so the token is always fresh first. */
  function authedRest(path, options) {
    return validSession().then(function (live) {
      if (!live) throw new Error('Your session has expired. Please log in again.');
      return rest(path, options);
    });
  }

  function saveSetting(key, value) {
    return authedRest('/site_settings', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({ key: key, value: value })
    }).then(function (rows) {
      content.settings[key] = value;
      applySettings();
      return rows;
    });
  }

  function saveRow(table, row) {
    var isNew = !row.id;
    var path = isNew ? '/' + table : '/' + table + '?id=eq.' + encodeURIComponent(row.id);
    var payload = Object.assign({}, row);
    delete payload.id;   // the id addresses the row; it is never a field to write

    return authedRest(path, {
      method: isNew ? 'POST' : 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(payload)
    });
  }

  function deleteRow(table, id) {
    return authedRest('/' + table + '?id=eq.' + encodeURIComponent(id), { method: 'DELETE' });
  }

  function setSectionVisible(key, visible) {
    return authedRest('/site_sections?key=eq.' + encodeURIComponent(key), {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ visible: visible })
    }).then(function (rows) {
      if (content.sections[key]) content.sections[key].visible = visible;
      applySections();
      return rows;
    });
  }

  /* ---------------------------------------------------------
     Storage — logo / photo uploads
     --------------------------------------------------------- */
  function uploadImage(file, folder) {
    return validSession().then(function (live) {
      if (!live) throw new Error('Your session has expired. Please log in again.');

      var safeName = String(file.name || 'image')
        .toLowerCase()
        .replace(/[^a-z0-9.]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(-60);
      var path = (folder || 'uploads') + '/' + Date.now() + '-' + safeName;

      return fetch(cfg.url + '/storage/v1/object/' + ASSET_BUCKET + '/' + path, {
        method: 'POST',
        headers: {
          apikey: cfg.anonKey,
          Authorization: 'Bearer ' + live.access_token,
          'Content-Type': file.type || 'application/octet-stream',
          'x-upsert': 'true'
        },
        body: file
      }).then(function (res) {
        if (!res.ok) {
          return res.text().then(function (text) {
            throw new Error('Upload failed (' + res.status + '). ' + text.slice(0, 160));
          });
        }
        return cfg.url + '/storage/v1/object/public/' + ASSET_BUCKET + '/' + path;
      });
    });
  }

  /* ---------------------------------------------------------
     Load the published content
     --------------------------------------------------------- */
  function loadContent() {
    if (!configured()) return Promise.resolve(content);

    return Promise.all([
      rest('/site_settings?select=key,value').catch(function () { return null; }),
      rest('/site_sections?select=key,label,visible,sort_order&order=sort_order').catch(function () { return null; }),
      rest('/tours?select=*&order=sort_order,created_at').catch(function () { return null; }),
      rest('/vehicles?select=*&order=sort_order,created_at').catch(function () { return null; })
    ]).then(function (results) {
      var settings = results[0], sections = results[1], tours = results[2], vehicles = results[3];

      if (Array.isArray(settings)) {
        content.settings = {};
        settings.forEach(function (row) {
          if (row.value != null && row.value !== '') content.settings[row.key] = row.value;
        });
      }
      if (Array.isArray(sections)) {
        content.sections = {};
        sections.forEach(function (row) { content.sections[row.key] = row; });
      }
      if (Array.isArray(tours)) content.tours = tours;
      if (Array.isArray(vehicles)) content.vehicles = vehicles;

      return content;
    });
  }

  /* ---------------------------------------------------------
     Painting the content onto the page
     --------------------------------------------------------- */
  function applySettings() {
    var s = content.settings;

    document.querySelectorAll('[data-cms-text]').forEach(function (el) {
      var value = s[el.getAttribute('data-cms-text')];
      if (value != null) el.textContent = value;
    });

    document.querySelectorAll('[data-cms-src]').forEach(function (el) {
      var value = s[el.getAttribute('data-cms-src')];
      if (value) el.setAttribute('src', value);
    });

    // Phone links: the display text may be formatted ("+94 77 826 1901"),
    // the href must not be.
    var phone = s['contact.phone'];
    if (phone) {
      document.querySelectorAll('[data-cms-phone]').forEach(function (el) {
        el.setAttribute('href', 'tel:' + phone.replace(/[^\d+]/g, ''));
      });
    }

    // WhatsApp links keep whatever ?text= message they were authored
    // with; only the number changes.
    var wa = s['contact.whatsapp'];
    if (wa) {
      var digits = wa.replace(/\D/g, '');
      document.querySelectorAll('[data-cms-whatsapp]').forEach(function (el) {
        var href = el.getAttribute('href') || '';
        var query = href.indexOf('?') > -1 ? href.slice(href.indexOf('?')) : '';
        el.setAttribute('href', 'https://wa.me/' + digits + query);
      });
    }

    emit('settings-applied', content.settings);
  }

  function applySections() {
    Object.keys(content.sections).forEach(function (key) {
      var visible = content.sections[key].visible !== false;

      document.querySelectorAll('[data-section="' + key + '"]').forEach(function (el) {
        el.classList.toggle('dg-section-off', !visible);
      });
      // Nav and drawer links must not point at something that is gone.
      document.querySelectorAll('[data-section-link="' + key + '"]').forEach(function (el) {
        el.classList.toggle('dg-section-off', !visible);
      });
    });

    emit('sections-applied', content.sections);
  }

  function renderTours() {
    var grid = document.getElementById('tourGrid');
    if (!grid || !content.tours.length) return;

    var waNumber = (content.settings['contact.whatsapp'] || '94778261901').replace(/\D/g, '');

    grid.innerHTML = content.tours.map(function (tour) {
      var items = Array.isArray(tour.items) ? tour.items : [];
      var message = tour.whatsapp_text || ("Hi, I'm interested in the " + tour.title + ' tour.');

      return '' +
        '<div class="pkg-card' + (tour.visible === false ? ' dg-row-hidden' : '') + '" data-tour-id="' + escapeHtml(tour.id) + '">' +
          '<div class="pkg-header">' +
            (tour.tag ? '<span class="pkg-tag">' + escapeHtml(tour.tag) + '</span>' : '') +
            '<div class="pkg-title">' + escapeHtml(tour.title) + '</div>' +
          '</div>' +
          '<div class="pkg-body">' +
            (tour.image_url
              ? '<img class="pkg-image" src="' + escapeHtml(tour.image_url) + '" alt="' + escapeHtml(tour.title) + '" loading="lazy">'
              : '') +
            '<ul class="pkg-list">' +
              items.map(function (item) { return '<li>' + escapeHtml(item) + '</li>'; }).join('') +
            '</ul>' +
            '<div class="pkg-footer">' +
              '<span class="pkg-price"><i class="fa-solid fa-route"></i> ' +
                escapeHtml(tour.footer_note || 'Flexible Itinerary') + '</span>' +
              '<a href="https://wa.me/' + waNumber + '?text=' + encodeURIComponent(message) + '" ' +
                 'target="_blank" class="btn btn-sm btn-outline">Inquire on WhatsApp</a>' +
            '</div>' +
          '</div>' +
        '</div>';
    }).join('');

    emit('tours-rendered', content.tours);
  }

  function renderVehicles() {
    var grid = document.getElementById('fleetGrid');
    if (!grid || !content.vehicles.length) return;

    var previous = grid.querySelector('.vehicle-card.selected');
    var previousName = previous ? previous.getAttribute('data-vehicle') : '';

    grid.innerHTML = content.vehicles.map(function (vehicle) {
      var selected = vehicle.name === previousName;
      return '' +
        '<div class="vehicle-card' + (selected ? ' selected' : '') + (vehicle.visible === false ? ' dg-row-hidden' : '') + '" ' +
             'data-vehicle="' + escapeHtml(vehicle.name) + '" data-vehicle-id="' + escapeHtml(vehicle.id) + '" ' +
             'role="radio" aria-checked="' + (selected ? 'true' : 'false') + '" tabindex="0">' +
          (vehicle.image_url
            ? '<img class="vehicle-photo" src="' + escapeHtml(vehicle.image_url) + '" alt="' + escapeHtml(vehicle.name) + '" loading="lazy">'
            : '<div class="vehicle-icon"><i class="' + escapeHtml(vehicle.icon || 'fa-solid fa-car-side') + '"></i></div>') +
          (vehicle.badge ? '<span class="vehicle-badge-type">' + escapeHtml(vehicle.badge) + '</span>' : '') +
          '<div class="vehicle-title">' + escapeHtml(vehicle.name) + '</div>' +
          '<div class="vehicle-specs">' +
            escapeHtml(vehicle.specs_primary || '') +
            (vehicle.specs_secondary ? '<br>' + escapeHtml(vehicle.specs_secondary) : '') +
          '</div>' +
        '</div>';
    }).join('');

    emit('vehicles-rendered', content.vehicles);
  }

  function applyAll() {
    applySettings();
    applySections();
    renderTours();
    renderVehicles();
  }

  /* ---------------------------------------------------------
     Log In / Log Out button + modal
     --------------------------------------------------------- */
  function refreshAuthButtons() {
    document.querySelectorAll('[data-login-btn]').forEach(function (btn) {
      btn.hidden = !configured();
      var label = btn.querySelector('[data-login-label]');
      if (label) label.textContent = isAdmin ? 'Admin' : 'Log In';
    });
  }

  function openLoginModal() {
    var modal = document.getElementById('loginModal');
    if (!modal) return;
    modal.classList.add('active');
    if (window.dgLockBodyScroll) window.dgLockBodyScroll();
    else document.body.style.overflow = 'hidden';
    var email = document.getElementById('loginEmail');
    if (email) setTimeout(function () { email.focus(); }, 60);
  }

  function closeLoginModal() {
    var modal = document.getElementById('loginModal');
    if (!modal || !modal.classList.contains('active')) return;
    modal.classList.remove('active');
    if (window.dgUnlockBodyScroll) window.dgUnlockBodyScroll();
    else document.body.style.overflow = '';
    setLoginError('');
  }

  function setLoginError(message, kind) {
    var box = document.getElementById('loginError');
    if (!box) return;
    box.textContent = message || '';
    box.className = 'login-error' + (message ? ' show' : '') + (kind === 'ok' ? ' ok' : '');
  }

  function wireLoginUi() {
    document.querySelectorAll('[data-login-btn]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (isAdmin) {
          // Already signed in: the button becomes a way back to the panel.
          emit('open-admin');
        } else {
          openLoginModal();
        }
      });
    });

    var modal = document.getElementById('loginModal');
    if (modal) {
      modal.addEventListener('click', function (e) {
        if (e.target === modal) closeLoginModal();
      });
    }
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeLoginModal();
    });

    var closeBtn = document.getElementById('closeLoginModalBtn');
    if (closeBtn) closeBtn.addEventListener('click', closeLoginModal);

    var form = document.getElementById('loginForm');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();

        var email = (document.getElementById('loginEmail').value || '').trim();
        var password = document.getElementById('loginPassword').value || '';
        var submit = document.getElementById('loginSubmitBtn');

        if (!email || !password) {
          setLoginError('Enter your email and password.');
          return;
        }

        submit.disabled = true;
        submit.classList.add('loading');
        setLoginError('');

        signIn(email, password)
          .then(function () {
            closeLoginModal();
            form.reset();
            return enterAdminMode();
          })
          .catch(function (err) {
            var message = err && err.message ? err.message : 'Could not sign in.';
            if (/invalid login/i.test(message)) message = 'That email and password do not match.';
            setLoginError(message);
          })
          .then(function () {
            submit.disabled = false;
            submit.classList.remove('loading');
          });
      });
    }

    var forgot = document.getElementById('loginForgotBtn');
    if (forgot) {
      forgot.addEventListener('click', function () {
        var email = (document.getElementById('loginEmail').value || '').trim();
        if (!email) { setLoginError('Enter your email address first.'); return; }
        sendPasswordReset(email)
          .then(function () { setLoginError('Password reset link sent to ' + email + '.', 'ok'); })
          .catch(function () { setLoginError('Could not send the reset email.'); });
      });
    }
  }

  /* ---------------------------------------------------------
     Admin mode — pulls in the editor only when it is needed
     --------------------------------------------------------- */
  function loadAdminUi() {
    if (adminUiLoaded) return Promise.resolve();
    adminUiLoaded = true;

    return new Promise(function (resolve, reject) {
      var css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'assets/admin.css';
      document.head.appendChild(css);

      var script = document.createElement('script');
      script.src = 'assets/admin.js';
      script.onload = resolve;
      script.onerror = function () {
        adminUiLoaded = false;
        reject(new Error('Could not load the admin panel.'));
      };
      document.body.appendChild(script);
    });
  }

  function enterAdminMode() {
    if (!isAdmin) return Promise.resolve();
    document.documentElement.classList.add('dg-admin');
    refreshAuthButtons();
    return loadAdminUi().then(function () {
      emit('admin-ready', { session: session });
    }).catch(function (err) {
      console.error('[cms]', err);
    });
  }

  /* ---------------------------------------------------------
     Boot
     --------------------------------------------------------- */
  function boot() {
    wireLoginUi();
    refreshAuthButtons();

    return fetch('/api/config', { headers: { Accept: 'application/json' } })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        cfg.url = (data && data.supabaseUrl) || '';
        cfg.anonKey = (data && data.supabaseAnonKey) || '';
        if (!configured()) return null;

        session = readStoredSession();
        refreshAuthButtons();

        return loadContent()
          .then(function () {
            applyAll();
            return session ? checkAdmin() : false;
          })
          .then(function (admin) {
            refreshAuthButtons();
            if (admin) return enterAdminMode();
            return null;
          });
      })
      .catch(function (err) {
        // The site is fully usable without any of this.
        console.warn('[cms] running on built-in content:', err && err.message);
      })
      .then(function () {
        emit('ready', content);
      });
  }

  /* ---------------------------------------------------------
     Public surface (admin.js talks to the site through this)
     --------------------------------------------------------- */
  window.DGCMS = {
    content: content,
    get session() { return session; },
    get isAdmin() { return isAdmin; },
    get configured() { return configured(); },

    on: on,
    emit: emit,
    escapeHtml: escapeHtml,

    signIn: signIn,
    signOut: signOut,
    sendPasswordReset: sendPasswordReset,

    loadContent: loadContent,
    saveSetting: saveSetting,
    saveRow: saveRow,
    deleteRow: deleteRow,
    setSectionVisible: setSectionVisible,
    uploadImage: uploadImage,

    applyAll: applyAll,
    applySettings: applySettings,
    applySections: applySections,
    renderTours: renderTours,
    renderVehicles: renderVehicles,

    openLoginModal: openLoginModal,
    closeLoginModal: closeLoginModal
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
