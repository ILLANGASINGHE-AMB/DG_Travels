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

  /* ---------------------------------------------------------
     Quotation bills — admin-only, never read by a visitor.
     The reference number and the issue timestamp are filled in by
     the database, so the row that comes back is the record of truth.
     --------------------------------------------------------- */
  function createQuotation(payload) {
    return authedRest('/quotations', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(payload)
    }).then(function (rows) {
      return (rows && rows[0]) || null;
    });
  }

  /**
   * Newest first, a page at a time. `term` searches the columns that sit
   * on the row itself; the route lives inside the trips array, which
   * PostgREST cannot match with a plain ilike.
   */
  function listQuotations(options) {
    options = options || {};
    var limit = options.limit || 25;
    var path = '/quotations?select=*&order=issued_at.desc' +
      '&limit=' + encodeURIComponent(limit) +
      '&offset=' + encodeURIComponent(options.offset || 0);

    var term = String(options.term || '').trim();
    if (term) {
      // Commas, parentheses and dots separate the parts of a PostgREST
      // filter, so a search for "REF-001, Galle" must not carry them in.
      var safe = term.replace(/[(),.*"\\]/g, ' ').trim();
      if (safe) {
        path += '&or=(' + [
          'ref_no', 'customer_name', 'customer_phone', 'customer_email', 'vehicle_type'
        ].map(function (col) {
          return col + '.ilike.*' + encodeURIComponent(safe) + '*';
        }).join(',') + ')';
      }
    }

    return authedRest(path);
  }

  function deleteQuotation(id) {
    return deleteRow('quotations', id);
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

  /**
   * Removes a file this site uploaded into `folder`. Anything else — a
   * link to another site, an image shipped with the repo — is left alone,
   * and a failure only leaves an unused file behind, so it never throws.
   */
  function deleteStoredImage(url, folder) {
    var base = cfg.url + '/storage/v1/object/public/' + ASSET_BUCKET + '/';
    url = String(url || '');
    if (!folder || url.indexOf(base + folder + '/') !== 0) return Promise.resolve();
    var path = url.slice(base.length);

    return validSession().then(function (live) {
      if (!live) return null;
      return fetch(cfg.url + '/storage/v1/object/' + ASSET_BUCKET + '/' + path, {
        method: 'DELETE',
        headers: { apikey: cfg.anonKey, Authorization: 'Bearer ' + live.access_token }
      });
    }).catch(function (err) {
      console.warn('[cms] could not remove ' + path + ':', err && err.message);
    });
  }

  /* ---------------------------------------------------------
     Gallery — the newest photos first, a page at a time.
     Kept out of loadContent on purpose: the section opens on four
     photos and only asks for more when a visitor wants them, so a
     gallery of hundreds costs a first visit nothing extra.
     --------------------------------------------------------- */
  var GALLERY_FIRST_PAGE = 4;
  var GALLERY_PAGE = 8;
  var GALLERY_FOLDER = 'gallery';

  var gallery = {
    photos: [],
    albums: [],
    activeAlbum: 'all',  // 'all' or album.id / album.title
    hasMore: false,
    loading: false,
    failed: false,       // the first page could not be read
    moreFailed: false,   // a "View more" could not be read
    index: -1            // the photo open in the viewer
  };

  function listGalleryAlbums(authed) {
    var path = '/gallery_albums?select=id,title,description,sort_order,created_at&order=sort_order.asc,created_at.asc';
    return (authed ? authedRest : rest)(path).catch(function (err) {
      console.warn('[cms] albums table not found or unavailable:', err && err.message);
      return [];
    });
  }

  function saveGalleryAlbum(album) {
    return saveRow('gallery_albums', album);
  }

  function deleteGalleryAlbum(albumId) {
    return deleteRow('gallery_albums', albumId);
  }

  function listGallery(offset, limit, authed) {
    var path = '/gallery_photos?select=id,image_url,caption,photo_date,album_id,album_title,created_at' +
      '&order=photo_date.desc,created_at.desc' +
      '&limit=' + encodeURIComponent(limit) +
      '&offset=' + encodeURIComponent(offset || 0);
    return (authed ? authedRest : rest)(path).catch(function (err) {
      // Fallback in case album columns have not been added yet
      if (err && String(err.message || '').indexOf('album') !== -1) {
        return (authed ? authedRest : rest)(
          '/gallery_photos?select=id,image_url,caption,photo_date,created_at' +
          '&order=photo_date.desc,created_at.desc' +
          '&limit=' + encodeURIComponent(limit) +
          '&offset=' + encodeURIComponent(offset || 0)
        );
      }
      throw err;
    });
  }

  /** One row more than asked for answers "is there more?" in the same request. */
  function fetchGalleryPage(offset, count) {
    return listGallery(offset, count + 1).then(function (rows) {
      rows = Array.isArray(rows) ? rows : [];
      return { rows: rows.slice(0, count), more: rows.length > count };
    });
  }

  function loadGallery() {
    if (!configured()) return Promise.resolve(gallery.photos);

    // Reload as many as are already on screen, so saving an edit does not
    // collapse a gallery that had been expanded.
    var count = Math.max(GALLERY_FIRST_PAGE, gallery.photos.length);
    gallery.loading = true;
    renderGallery();

    return Promise.all([
      fetchGalleryPage(0, count),
      listGalleryAlbums()
    ])
      .then(function (results) {
        var page = results[0];
        var albums = results[1];
        gallery.photos = page.rows;
        gallery.albums = Array.isArray(albums) ? albums : [];
        gallery.hasMore = page.more;
        gallery.failed = false;
      })
      .catch(function (err) {
        console.warn('[cms] gallery unavailable:', err && err.message);
        gallery.photos = [];
        gallery.albums = [];
        gallery.hasMore = false;
        gallery.failed = true;
      })
      .then(function () {
        gallery.loading = false;
        gallery.moreFailed = false;
        renderGallery();
        return gallery.photos;
      });
  }

  function loadMoreGallery() {
    if (gallery.loading || !gallery.hasMore) return Promise.resolve(gallery.photos);

    gallery.loading = true;
    renderGalleryMore();

    return fetchGalleryPage(gallery.photos.length, GALLERY_PAGE)
      .then(function (page) {
        // A photo added since the last page shifts every offset by one;
        // skip anything already on screen rather than showing it twice.
        var seen = {};
        gallery.photos.forEach(function (p) { seen[p.id] = true; });
        gallery.photos = gallery.photos.concat(page.rows.filter(function (p) { return !seen[p.id]; }));
        gallery.hasMore = page.more;
        gallery.moreFailed = false;
      })
      .catch(function (err) {
        console.warn('[cms] more gallery photos unavailable:', err && err.message);
        gallery.moreFailed = true;   // the button stays, and becomes a retry
      })
      .then(function () {
        gallery.loading = false;
        renderGallery();
        return gallery.photos;
      });
  }

  /** "2026-09-15" → "15 Sep 2026" */
  function photoDate(value) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
    if (!m) return '';
    // Built from its parts: new Date('2026-09-15') is UTC midnight, which
    // anywhere west of Greenwich is still the 14th.
    var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function setActiveAlbum(albumId) {
    gallery.activeAlbum = albumId || 'all';
    renderGallery();
  }

  function renderGalleryAlbumsNav() {
    var nav = document.getElementById('galleryAlbumNav');
    if (!nav) return;

    // Build merged album list (from gallery.albums + fallback from photo titles)
    var albums = (gallery.albums || []).slice();
    var knownTitles = {};
    albums.forEach(function (a) { knownTitles[a.title] = true; });
    gallery.photos.forEach(function (p) {
      if (p.album_title && !knownTitles[p.album_title]) {
        knownTitles[p.album_title] = true;
        albums.push({ id: p.album_title, title: p.album_title });
      }
    });

    // Only keep albums that have photos currently loaded
    var activeAlbums = albums.filter(function (album) {
      return gallery.photos.some(function (p) {
        return p.album_id === album.id || p.album_title === album.title;
      });
    });

    if (activeAlbums.length === 0) {
      nav.innerHTML = '';
      nav.style.display = 'none';
      return;
    }

    nav.style.display = 'flex';
    var html =
      '<div class="gallery-albums-menu-wrap" id="galleryAlbumsMenuWrap">' +
        '<button type="button" class="gallery-albums-btn" id="galleryAlbumsBtn" aria-expanded="false" aria-haspopup="true">' +
          '<i class="fa-regular fa-folder-open"></i>' +
          '<span>Albums</span>' +
          '<span class="gallery-albums-btn-count">' + activeAlbums.length + '</span>' +
          '<i class="fa-solid fa-chevron-down albums-chevron"></i>' +
        '</button>' +
        '<div class="gallery-albums-dropdown" id="galleryAlbumsDropdown" hidden>' +
          '<div class="gallery-albums-dropdown-head">' +
            '<span><i class="fa-solid fa-layer-group"></i> Current Albums</span>' +
            '<span class="dropdown-badge">' + activeAlbums.length + (activeAlbums.length === 1 ? ' album' : ' albums') + '</span>' +
          '</div>' +
          '<div class="gallery-albums-dropdown-list">';

    activeAlbums.forEach(function (album, i) {
      var count = gallery.photos.filter(function (p) {
        return p.album_id === album.id || p.album_title === album.title;
      }).length;
      var anchorId = 'album-group-' + i;

      html +=
        '<button type="button" class="gallery-albums-dropdown-item" data-album-anchor="' + anchorId + '">' +
          '<span class="item-icon"><i class="fa-regular fa-folder"></i></span>' +
          '<div class="item-info">' +
            '<span class="item-name">' + escapeHtml(album.title) + '</span>' +
            '<span class="item-meta">' + count + (count === 1 ? ' photo' : ' photos') + '</span>' +
          '</div>' +
          '<i class="fa-solid fa-arrow-down-long item-arrow"></i>' +
        '</button>';
    });

    html += '</div></div></div>';
    nav.innerHTML = html;

    var btn = document.getElementById('galleryAlbumsBtn');
    var dropdown = document.getElementById('galleryAlbumsDropdown');

    if (btn && dropdown) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var isOpen = !dropdown.hidden;
        dropdown.hidden = isOpen;
        btn.setAttribute('aria-expanded', String(!isOpen));
      });

      dropdown.querySelectorAll('[data-album-anchor]').forEach(function (item) {
        item.addEventListener('click', function (e) {
          e.stopPropagation();
          dropdown.hidden = true;
          btn.setAttribute('aria-expanded', 'false');

          var targetId = this.getAttribute('data-album-anchor');
          var target = document.getElementById(targetId);
          if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            target.classList.remove('album-highlight');
            void target.offsetWidth;
            target.classList.add('album-highlight');
            setTimeout(function () {
              target.classList.remove('album-highlight');
            }, 1600);
          }
        });
      });
    }
  }

  function getFilteredPhotos() {
    return gallery.photos;
  }

  function renderGallery() {
    renderGalleryAlbumsNav();

    var grid = document.getElementById('galleryGrid');
    if (!grid) return;

    var photos = gallery.photos;

    // Build merged album list
    var albums = (gallery.albums || []).slice();
    var knownTitles = {};
    albums.forEach(function (a) { knownTitles[a.title] = true; });
    photos.forEach(function (p) {
      if (p.album_title && !knownTitles[p.album_title]) {
        knownTitles[p.album_title] = true;
        albums.push({ id: p.album_title, title: p.album_title });
      }
    });

    var html = '';

    if (albums.length > 0) {
      var albumIndex = 0;
      // Render photos grouped by album
      albums.forEach(function (album) {
        var albumPhotos = photos.filter(function (p) {
          return p.album_id === album.id || p.album_title === album.title;
        });
        if (albumPhotos.length === 0) return;

        var anchorId = 'album-group-' + albumIndex;
        albumIndex++;

        html += '<div class="gallery-album-group" id="' + anchorId + '">' +
          '<div class="gallery-album-heading">' +
            '<span class="gallery-album-heading-icon"><i class="fa-regular fa-folder-open"></i></span>' +
            '<h3>' + escapeHtml(album.title) + '</h3>' +
            '<span class="gallery-album-heading-line"></span>' +
          '</div>' +
          '<div class="gallery-grid">';

        albumPhotos.forEach(function (photo) {
          var date = photoDate(photo.photo_date);
          var idx = gallery.photos.indexOf(photo);
          html +=
            '<figure class="gallery-item">' +
              '<button type="button" class="gallery-thumb" data-gallery-index="' + idx + '" ' +
                      'aria-label="View photo: ' + escapeHtml(photo.caption) + '">' +
                '<img src="' + escapeHtml(photo.image_url) + '" alt="' + escapeHtml(photo.caption) + '" ' +
                     'loading="lazy" decoding="async">' +
              '</button>' +
              '<figcaption>' +
                '<span class="gallery-caption">' + escapeHtml(photo.caption) + '</span>' +
                (date
                  ? '<time class="gallery-date" datetime="' + escapeHtml(photo.photo_date) + '">' +
                      '<i class="fa-regular fa-calendar" aria-hidden="true"></i> ' + escapeHtml(date) + '</time>'
                  : '') +
              '</figcaption>' +
            '</figure>';
        });

        html += '</div></div>'; // close gallery-grid + gallery-album-group
      });

      // Photos with no album — show at bottom without heading
      var unassigned = photos.filter(function (p) { return !p.album_title && !p.album_id; });
      if (unassigned.length > 0) {
        html += '<div class="gallery-album-group"><div class="gallery-grid">';
        unassigned.forEach(function (photo) {
          var date = photoDate(photo.photo_date);
          var idx = gallery.photos.indexOf(photo);
          html +=
            '<figure class="gallery-item">' +
              '<button type="button" class="gallery-thumb" data-gallery-index="' + idx + '" ' +
                      'aria-label="View photo: ' + escapeHtml(photo.caption) + '">' +
                '<img src="' + escapeHtml(photo.image_url) + '" alt="' + escapeHtml(photo.caption) + '" ' +
                     'loading="lazy" decoding="async">' +
              '</button>' +
              '<figcaption>' +
                '<span class="gallery-caption">' + escapeHtml(photo.caption) + '</span>' +
                (date
                  ? '<time class="gallery-date" datetime="' + escapeHtml(photo.photo_date) + '">' +
                      '<i class="fa-regular fa-calendar" aria-hidden="true"></i> ' + escapeHtml(date) + '</time>'
                  : '') +
              '</figcaption>' +
            '</figure>';
        });
        html += '</div></div>';
      }
    } else {
      // No albums — flat grid
      html += '<div class="gallery-grid">';
      photos.forEach(function (photo, i) {
        var date = photoDate(photo.photo_date);
        html +=
          '<figure class="gallery-item">' +
            '<button type="button" class="gallery-thumb" data-gallery-index="' + i + '" ' +
                    'aria-label="View photo: ' + escapeHtml(photo.caption) + '">' +
              '<img src="' + escapeHtml(photo.image_url) + '" alt="' + escapeHtml(photo.caption) + '" ' +
                   'loading="lazy" decoding="async">' +
            '</button>' +
            '<figcaption>' +
              '<span class="gallery-caption">' + escapeHtml(photo.caption) + '</span>' +
              (date
                ? '<time class="gallery-date" datetime="' + escapeHtml(photo.photo_date) + '">' +
                    '<i class="fa-regular fa-calendar" aria-hidden="true"></i> ' + escapeHtml(date) + '</time>'
                : '') +
            '</figcaption>' +
          '</figure>';
      });
      html += '</div>';
    }

    grid.innerHTML = html;

    // State message for empty gallery
    var state = document.getElementById('galleryState');
    if (state) {
      state.hidden = photos.length > 0;
      if (!photos.length) {
        state.innerHTML = gallery.loading
          ? '<i class="fa-solid fa-circle-notch fa-spin"></i><p>Loading photos\u2026</p>'
          : gallery.failed
            ? '<i class="fa-regular fa-images"></i>' +
              '<p class="state-visitor">New photos from our tours and transfers are on their way. Check back soon.</p>' +
              '<p class="state-owner">The gallery could not be loaded. If you have not yet, run ' +
              '<code>supabase/gallery-albums-schema.sql</code> in Supabase.</p>'
            : '<i class="fa-regular fa-images"></i>' +
              '<p class="state-visitor">New photos from our tours and transfers are on their way. Check back soon.</p>' +
              '<p class="state-owner">No photos yet. Add the first one from <strong>Editor \u2192 Gallery</strong>.</p>';
      }
    }

    renderGalleryMore();
    emit('gallery-rendered', photos);
  }

  function renderGalleryMore() {
    var wrap = document.getElementById('galleryMoreWrap');
    var btn = document.getElementById('galleryMoreBtn');
    if (!wrap || !btn) return;

    wrap.hidden = !gallery.hasMore;
    btn.disabled = gallery.loading;
    btn.innerHTML = gallery.loading
      ? '<i class="fa-solid fa-circle-notch fa-spin"></i> Loading\u2026'
      : gallery.moreFailed
        ? '<i class="fa-solid fa-rotate-right"></i> Could not load \u2014 try again'
        : '<i class="fa-regular fa-images"></i> View more photos';
  }

  /* ---- The full-size viewer ---- */
  function showGalleryPhoto(index) {
    var photo = gallery.photos[index];
    var modal = document.getElementById('galleryModal');
    if (!photo || !modal) return;

    var total = gallery.photos.length;
    gallery.index = index;

    var img = document.getElementById('galleryViewerImg');
    img.src = photo.image_url;
    img.alt = photo.caption || '';
    document.getElementById('galleryViewerCaption').textContent = photo.caption || '';

    var albumEl = document.getElementById('galleryViewerAlbum');
    if (albumEl) {
      albumEl.textContent = photo.album_title || '';
      albumEl.style.display = photo.album_title ? 'inline-flex' : 'none';
    }

    var date = document.getElementById('galleryViewerDate');
    date.textContent = photoDate(photo.photo_date);
    date.setAttribute('datetime', photo.photo_date || '');

    document.getElementById('galleryViewerCount').textContent =
      total > 1 ? (index + 1) + ' / ' + total : '';
    modal.classList.toggle('single', total < 2 && !gallery.hasMore);
  }

  function openGalleryViewer(index) {
    var modal = document.getElementById('galleryModal');
    if (!modal || !gallery.photos[index]) return;

    showGalleryPhoto(index);
    if (!modal.classList.contains('active')) {
      modal.classList.add('active');
      if (window.dgLockBodyScroll) window.dgLockBodyScroll();
      else document.body.style.overflow = 'hidden';
    }

    var close = document.getElementById('galleryCloseBtn');
    if (close) close.focus({ preventScroll: true });
  }

  function closeGalleryViewer() {
    var modal = document.getElementById('galleryModal');
    if (!modal || !modal.classList.contains('active')) return;

    modal.classList.remove('active');
    if (window.dgUnlockBodyScroll) window.dgUnlockBodyScroll();
    else document.body.style.overflow = '';

    // Back to the photo that was last on screen, which after paging through
    // the viewer may not be the one that opened it.
    var thumb = document.querySelector('[data-gallery-index="' + gallery.index + '"]');
    if (thumb) thumb.focus({ preventScroll: true });
  }

  function stepGallery(dir) {
    var total = gallery.photos.length;
    if (!total || gallery.loading) return;
    var next = gallery.index + dir;

    // Past the last photo loaded so far: fetch the next page before
    // wrapping round to the first.
    if (next >= total && gallery.hasMore) {
      loadMoreGallery().then(function () {
        showGalleryPhoto(gallery.photos[next] ? next : 0);
      });
      return;
    }
    showGalleryPhoto((next + total) % total);
  }

  function wireGalleryUi() {
    var grid = document.getElementById('galleryGrid');
    var modal = document.getElementById('galleryModal');
    if (!grid || !modal) return;

    grid.addEventListener('click', function (e) {
      var thumb = e.target.closest('[data-gallery-index]');
      if (thumb) openGalleryViewer(Number(thumb.getAttribute('data-gallery-index')));
    });

    var more = document.getElementById('galleryMoreBtn');
    if (more) more.addEventListener('click', loadMoreGallery);

    document.getElementById('galleryCloseBtn').addEventListener('click', closeGalleryViewer);
    document.getElementById('galleryPrevBtn').addEventListener('click', function () { stepGallery(-1); });
    document.getElementById('galleryNextBtn').addEventListener('click', function () { stepGallery(1); });

    modal.addEventListener('click', function (e) {
      if (e.target === modal || e.target.classList.contains('gallery-viewer')) closeGalleryViewer();
    });

    document.addEventListener('keydown', function (e) {
      if (!modal.classList.contains('active')) return;
      if (e.key === 'Escape') closeGalleryViewer();
      else if (e.key === 'ArrowLeft') { e.preventDefault(); stepGallery(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); stepGallery(1); }
    });

    // Close albums dropdown on click outside or Escape
    document.addEventListener('click', function (e) {
      var dropdown = document.getElementById('galleryAlbumsDropdown');
      var wrap = document.getElementById('galleryAlbumsMenuWrap');
      var btn = document.getElementById('galleryAlbumsBtn');
      if (dropdown && !dropdown.hidden && wrap && !wrap.contains(e.target)) {
        dropdown.hidden = true;
        if (btn) btn.setAttribute('aria-expanded', 'false');
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        var dropdown = document.getElementById('galleryAlbumsDropdown');
        var btn = document.getElementById('galleryAlbumsBtn');
        if (dropdown && !dropdown.hidden) {
          dropdown.hidden = true;
          if (btn) {
            btn.setAttribute('aria-expanded', 'false');
            btn.focus();
          }
        }
      }
    });

    // A sideways swipe moves between photos on a phone
    var startX = null, startY = 0;
    modal.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) { startX = null; return; }
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    }, { passive: true });
    modal.addEventListener('touchend', function (e) {
      if (startX == null) return;
      var dx = e.changedTouches[0].clientX - startX;
      var dy = e.changedTouches[0].clientY - startY;
      startX = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) stepGallery(dx < 0 ? 1 : -1);
    }, { passive: true });
  }

  function deleteGalleryPhoto(photo) {
    return deleteRow('gallery_photos', photo.id).then(function () {
      return deleteStoredImage(photo.image_url, GALLERY_FOLDER);
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
    wireGalleryUi();
    refreshAuthButtons();

    return fetch('/api/config', { headers: { Accept: 'application/json' } })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        cfg.url = (data && data.supabaseUrl) || '';
        cfg.anonKey = (data && data.supabaseAnonKey) || '';
        if (!configured()) return null;

        session = readStoredSession();
        refreshAuthButtons();

        // A visitor has no token, so the photos can start loading at once.
        // With a stored session wait for checkAdmin instead: it may renew
        // the token, and two renewals racing would sign the owner out.
        var hadSession = Boolean(session);
        if (!hadSession) loadGallery();

        return loadContent()
          .then(function () {
            applyAll();
            return session ? checkAdmin() : false;
          })
          .then(function (admin) {
            if (hadSession) loadGallery();
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
        // Without Supabase there are no photos to fetch; replace the
        // "Loading photos…" the page ships with by the empty-gallery note.
        if (!configured()) renderGallery();
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
    deleteStoredImage: deleteStoredImage,

    get gallery() { return gallery; },
    galleryFolder: GALLERY_FOLDER,
    listGallery: listGallery,
    reloadGallery: loadGallery,
    deleteGalleryPhoto: deleteGalleryPhoto,
    photoDate: photoDate,
    listGalleryAlbums: listGalleryAlbums,
    saveGalleryAlbum: saveGalleryAlbum,
    deleteGalleryAlbum: deleteGalleryAlbum,
    setActiveAlbum: setActiveAlbum,

    createQuotation: createQuotation,
    listQuotations: listQuotations,
    deleteQuotation: deleteQuotation,

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
