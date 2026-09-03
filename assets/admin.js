/* ============================================================
   DG Travels — admin editor
   ------------------------------------------------------------
   Downloaded only after an admin has signed in (cms.js injects it),
   so an ordinary visitor never pays for any of this.

   What it adds:
     • a top Admin bar with a "Preview as visitor" switch
     • a slide-in panel: Sections, Branding, Content, Tours, Vehicles
     • click-to-edit text directly on the page
     • image uploads straight into Supabase Storage

   Every write goes through window.DGCMS, which holds the session and
   refreshes the token before it touches the database.
   ============================================================ */

(function () {
  'use strict';

  var CMS = window.DGCMS;
  if (!CMS) return;

  var esc = CMS.escapeHtml;
  var root = document.documentElement;

  /* ---------------------------------------------------------
     What the Content tab offers, in the order it is shown.
     Adding a row here is all it takes to make another piece of
     the page editable — provided the element carries the
     matching data-cms-text / data-cms-src attribute.
     --------------------------------------------------------- */
  var CONTENT_GROUPS = [
    {
      title: 'Hero',
      fields: [
        { key: 'hero.badge', label: 'Badge above the logo' },
        { key: 'hero.title', label: 'Headline', half: true },
        { key: 'hero.title_accent', label: 'Headline — gold words', half: true },
        { key: 'hero.lede', label: 'Intro paragraph', type: 'textarea' },
        { key: 'hero.stat1_num', label: 'Stat 1 — number', half: true },
        { key: 'hero.stat1_label', label: 'Stat 1 — caption', half: true },
        { key: 'hero.stat2_num', label: 'Stat 2 — number', half: true },
        { key: 'hero.stat2_label', label: 'Stat 2 — caption', half: true },
        { key: 'hero.stat3_num', label: 'Stat 3 — number', half: true },
        { key: 'hero.stat3_label', label: 'Stat 3 — caption', half: true },
        { key: 'hero.stat4_num', label: 'Stat 4 — number', half: true },
        { key: 'hero.stat4_label', label: 'Stat 4 — caption', half: true }
      ]
    },
    {
      title: 'Booking section heading',
      fields: [
        { key: 'booking.eyebrow', label: 'Eyebrow' },
        { key: 'booking.title', label: 'Title' },
        { key: 'booking.subtitle', label: 'Subtitle', type: 'textarea' }
      ]
    },
    {
      title: 'Tours section heading',
      fields: [
        { key: 'tours.eyebrow', label: 'Eyebrow' },
        { key: 'tours.title', label: 'Title' },
        { key: 'tours.subtitle', label: 'Subtitle', type: 'textarea' }
      ]
    },
    {
      title: 'About the driver',
      fields: [
        { key: 'about.name', label: 'Name', half: true },
        { key: 'about.role', label: 'Role', half: true },
        { key: 'about.location', label: 'Location tag', half: true },
        { key: 'about.title', label: 'Section heading' },
        { key: 'about.bio', label: 'Biography', type: 'textarea', rows: 7 }
      ]
    },
    {
      title: 'Reviews & QR heading',
      fields: [
        { key: 'feedback.eyebrow', label: 'Eyebrow' },
        { key: 'feedback.title', label: 'Title' },
        { key: 'feedback.subtitle', label: 'Subtitle', type: 'textarea' }
      ]
    },
    {
      title: 'Footer',
      fields: [
        { key: 'footer.tagline', label: 'Footer location line' }
      ]
    }
  ];

  var BRANDING_FIELDS = [
    { key: 'brand.name', label: 'Brand name', half: true },
    { key: 'brand.sub', label: 'Brand sub-line', half: true },
    { key: 'contact.phone', label: 'Phone (as displayed)', half: true },
    { key: 'contact.whatsapp', label: 'WhatsApp number (digits only)', half: true }
  ];

  var BRANDING_IMAGES = [
    { key: 'brand.logo', label: 'Header logo', hint: 'Shown in the top bar and the mobile drawer. A square PNG with a transparent background works best.', folder: 'logo' },
    { key: 'brand.hero_logo', label: 'Hero logo', hint: 'The large animated logo on the opening screen.', folder: 'logo' },
    { key: 'about.photo', label: 'Driver photo', hint: 'Your portrait in the "About the driver" section.', folder: 'people' }
  ];

  var TOUR_FIELDS = [
    { key: 'tag', label: 'Tag', placeholder: 'Southern Coast & Surf' },
    { key: 'title', label: 'Tour title', required: true, placeholder: 'Galle, Ahangama & Mirissa' },
    { key: 'items', label: 'Highlights — one per line', type: 'lines', rows: 6 },
    { key: 'footer_note', label: 'Footer note', placeholder: 'Flexible Day Trips', half: true },
    { key: 'sort_order', label: 'Sort order', type: 'number', half: true },
    { key: 'whatsapp_text', label: 'WhatsApp message', type: 'textarea', rows: 2 }
  ];

  var VEHICLE_ICONS = [
    'fa-solid fa-car-side', 'fa-solid fa-car', 'fa-solid fa-car-rear',
    'fa-solid fa-van-shuttle', 'fa-solid fa-bus', 'fa-solid fa-truck',
    'fa-solid fa-taxi', 'fa-solid fa-shuttle-van', 'fa-solid fa-motorcycle'
  ];

  var VEHICLE_FIELDS = [
    { key: 'name', label: 'Vehicle name', required: true, placeholder: 'Toyota Prius', half: true },
    { key: 'badge', label: 'Type badge', placeholder: 'Premium Hybrid', half: true },
    { key: 'icon', label: 'Icon', type: 'icon', half: true },
    { key: 'sort_order', label: 'Sort order', type: 'number', half: true },
    { key: 'specs_primary', label: 'Specs — first line', placeholder: '1–3 Pax · 3 Bags' },
    { key: 'specs_secondary', label: 'Specs — second line', placeholder: 'Ultra smooth · Silent · A/C' }
  ];

  /* ---------------------------------------------------------
     Toast
     --------------------------------------------------------- */
  var toastTimer = null;

  function toast(message, kind) {
    var el = document.getElementById('dgToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'dgToast';
      el.className = 'dg-toast';
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.className = 'dg-toast show' + (kind === 'error' ? ' error' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.className = 'dg-toast'; }, kind === 'error' ? 5000 : 2600);
  }

  function fail(err) {
    console.error('[admin]', err);
    toast((err && err.message) || 'Something went wrong.', 'error');
  }

  /* ---------------------------------------------------------
     Chrome — the admin bar and the panel shell
     --------------------------------------------------------- */
  function buildChrome() {
    var bar = document.createElement('div');
    bar.className = 'dg-adminbar';
    bar.innerHTML =
      '<div class="dg-adminbar-in">' +
        '<span class="dg-adminbar-tag"><i class="fa-solid fa-user-shield"></i> Admin Mode</span>' +
        '<span class="dg-adminbar-user" id="dgAdminUser"></span>' +
        '<div class="dg-adminbar-actions">' +
          '<label class="dg-switch" title="See the site exactly as a visitor does">' +
            '<input type="checkbox" id="dgPreviewToggle">' +
            '<span class="dg-switch-track"><span class="dg-switch-thumb"></span></span>' +
            '<span class="dg-switch-label">Preview as visitor</span>' +
          '</label>' +
          '<label class="dg-switch" title="Click any text on the page to rewrite it">' +
            '<input type="checkbox" id="dgInlineToggle">' +
            '<span class="dg-switch-track"><span class="dg-switch-thumb"></span></span>' +
            '<span class="dg-switch-label">Edit on page</span>' +
          '</label>' +
          '<button type="button" class="dg-bar-btn primary" id="dgOpenPanel">' +
            '<i class="fa-solid fa-sliders"></i> Editor</button>' +
          '<button type="button" class="dg-bar-btn" id="dgLogout">' +
            '<i class="fa-solid fa-right-from-bracket"></i> Log out</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(bar);

    // Preview mode hides the bar above, so the way back out has to live
    // somewhere else — otherwise the only escape is reloading the page.
    var exit = document.createElement('button');
    exit.type = 'button';
    exit.className = 'dg-exit-preview';
    exit.id = 'dgExitPreview';
    exit.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Exit visitor preview';
    document.body.appendChild(exit);
    exit.addEventListener('click', function () { setPreview(false); });

    var backdrop = document.createElement('div');
    backdrop.className = 'dg-panel-backdrop';
    backdrop.id = 'dgPanelBackdrop';
    document.body.appendChild(backdrop);

    var panel = document.createElement('aside');
    panel.className = 'dg-panel';
    panel.id = 'dgPanel';
    panel.setAttribute('aria-label', 'Site editor');
    panel.innerHTML =
      '<header class="dg-panel-head">' +
        '<div>' +
          '<div class="dg-panel-title">Site Editor</div>' +
          '<div class="dg-panel-sub">Changes go live the moment you save</div>' +
        '</div>' +
        '<button type="button" class="dg-panel-close" id="dgClosePanel" aria-label="Close editor">' +
          '<i class="fa-solid fa-xmark"></i></button>' +
      '</header>' +
      // Five tabs have to fit the panel width without scrolling, so the
      // labels carry themselves — no icons here.
      '<nav class="dg-tabs" id="dgTabs">' +
        '<button type="button" class="dg-tab active" data-tab="sections">Sections</button>' +
        '<button type="button" class="dg-tab" data-tab="branding">Branding</button>' +
        '<button type="button" class="dg-tab" data-tab="content">Content</button>' +
        '<button type="button" class="dg-tab" data-tab="tours">Tours</button>' +
        '<button type="button" class="dg-tab" data-tab="vehicles">Vehicles</button>' +
      '</nav>' +
      '<div class="dg-panel-body" id="dgPanelBody"></div>';
    document.body.appendChild(panel);

    var user = document.getElementById('dgAdminUser');
    var session = CMS.session;
    if (user && session && session.user) user.textContent = session.user.email || '';

    document.getElementById('dgOpenPanel').addEventListener('click', openPanel);
    document.getElementById('dgClosePanel').addEventListener('click', closePanel);
    backdrop.addEventListener('click', closePanel);

    document.getElementById('dgLogout').addEventListener('click', function () {
      CMS.signOut().then(function () { window.location.reload(); });
    });

    document.getElementById('dgPreviewToggle').addEventListener('change', function () {
      setPreview(this.checked);
    });

    document.getElementById('dgInlineToggle').addEventListener('change', function () {
      setInlineEditing(this.checked);
    });

    document.getElementById('dgTabs').addEventListener('click', function (e) {
      var tab = e.target.closest('.dg-tab');
      if (!tab) return;
      document.querySelectorAll('.dg-tab').forEach(function (t) {
        t.classList.toggle('active', t === tab);
      });
      renderTab(tab.getAttribute('data-tab'));
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && panel.classList.contains('open')) closePanel();
    });
  }

  /** Shows the site exactly as a visitor sees it, editing chrome and all. */
  function setPreview(on) {
    root.classList.toggle('dg-preview', on);
    document.getElementById('dgPreviewToggle').checked = on;

    if (on) {
      document.getElementById('dgInlineToggle').checked = false;
      setInlineEditing(false);
      closePanel();
      toast('Viewing as a visitor — nothing here is editable');
    }
  }

  function openPanel() {
    if (root.classList.contains('dg-preview')) setPreview(false);
    document.getElementById('dgPanel').classList.add('open');
    document.getElementById('dgPanelBackdrop').classList.add('show');
  }

  function closePanel() {
    document.getElementById('dgPanel').classList.remove('open');
    document.getElementById('dgPanelBackdrop').classList.remove('show');
  }

  /* ---------------------------------------------------------
     Field rendering — shared by every tab
     --------------------------------------------------------- */
  function fieldHtml(field, value) {
    var id = 'dgf_' + field.key.replace(/\W/g, '_');
    var v = value == null ? '' : value;
    var input;

    if (field.type === 'textarea' || field.type === 'lines') {
      input = '<textarea id="' + id + '" class="dg-input" rows="' + (field.rows || 4) + '" ' +
              'data-field="' + esc(field.key) + '" data-kind="' + esc(field.type) + '" ' +
              'placeholder="' + esc(field.placeholder || '') + '">' + esc(v) + '</textarea>';
    } else if (field.type === 'icon') {
      input = '<select id="' + id + '" class="dg-input" data-field="' + esc(field.key) + '">' +
              VEHICLE_ICONS.map(function (icon) {
                return '<option value="' + esc(icon) + '"' + (icon === v ? ' selected' : '') + '>' +
                       esc(icon.replace('fa-solid fa-', '')) + '</option>';
              }).join('') +
              '</select>';
    } else {
      input = '<input id="' + id + '" class="dg-input" type="' + (field.type === 'number' ? 'number' : 'text') + '" ' +
              'data-field="' + esc(field.key) + '" value="' + esc(v) + '" ' +
              'placeholder="' + esc(field.placeholder || '') + '">';
    }

    return '<div class="dg-field' + (field.half ? ' half' : '') + '">' +
             '<label for="' + id + '">' + esc(field.label) +
               (field.required ? ' <span class="dg-req">*</span>' : '') + '</label>' +
             input +
           '</div>';
  }

  function readFields(container) {
    var out = {};
    container.querySelectorAll('[data-field]').forEach(function (el) {
      var key = el.getAttribute('data-field');
      var kind = el.getAttribute('data-kind');
      var value = el.value;

      if (kind === 'lines') {
        out[key] = value.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
      } else if (el.type === 'number') {
        out[key] = value === '' ? 0 : Number(value);
      } else {
        out[key] = value.trim();
      }
    });
    return out;
  }

  /**
   * What the page is showing for this slot right now. Falls back to the
   * image written into index.html, so an unset slot still previews the
   * real logo rather than an empty box.
   */
  function currentImage(key, value) {
    if (value) return value;
    var el = document.querySelector('[data-cms-src="' + key + '"]');
    return el ? el.getAttribute('src') : '';
  }

  function imageFieldHtml(item, value) {
    value = currentImage(item.key, value);

    return '<div class="dg-image-field" data-image-key="' + esc(item.key) + '" data-folder="' + esc(item.folder || 'uploads') + '">' +
             '<div class="dg-image-preview">' +
               (value ? '<img src="' + esc(value) + '" alt="">' : '<i class="fa-regular fa-image"></i>') +
             '</div>' +
             '<div class="dg-image-body">' +
               '<div class="dg-image-label">' + esc(item.label) + '</div>' +
               (item.hint ? '<p class="dg-hint">' + esc(item.hint) + '</p>' : '') +
               '<div class="dg-image-actions">' +
                 '<label class="dg-btn small">' +
                   '<i class="fa-solid fa-upload"></i> Upload' +
                   '<input type="file" accept="image/*" hidden data-image-input>' +
                 '</label>' +
                 '<button type="button" class="dg-btn small ghost" data-image-url>' +
                   '<i class="fa-solid fa-link"></i> Use a link</button>' +
               '</div>' +
               '<div class="dg-image-path">' + esc(value || 'Not set') + '</div>' +
             '</div>' +
           '</div>';
  }

  function wireImageFields(container) {
    container.querySelectorAll('.dg-image-field').forEach(function (wrap) {
      var key = wrap.getAttribute('data-image-key');
      var folder = wrap.getAttribute('data-folder');

      function commit(url) {
        CMS.saveSetting(key, url).then(function () {
          toast('Image updated');
          renderTab(currentTab);
        }).catch(fail);
      }

      wrap.querySelector('[data-image-input]').addEventListener('change', function () {
        var file = this.files && this.files[0];
        if (!file) return;
        if (file.size > 6 * 1024 * 1024) { toast('Please choose an image under 6 MB.', 'error'); return; }

        wrap.classList.add('busy');
        CMS.uploadImage(file, folder)
          .then(commit)
          .catch(fail)
          .then(function () { wrap.classList.remove('busy'); });
      });

      wrap.querySelector('[data-image-url]').addEventListener('click', function () {
        var current = currentImage(key, CMS.content.settings[key]);
        var url = window.prompt('Image URL or path inside the project:', current);
        if (url == null) return;
        commit(url.trim());
      });
    });
  }

  /* ---------------------------------------------------------
     Tabs
     --------------------------------------------------------- */
  var currentTab = 'sections';

  function renderTab(name) {
    currentTab = name;
    var body = document.getElementById('dgPanelBody');
    body.scrollTop = 0;

    if (name === 'sections') return renderSectionsTab(body);
    if (name === 'branding') return renderBrandingTab(body);
    if (name === 'content') return renderContentTab(body);
    if (name === 'tours') return renderListTab(body, 'tours');
    if (name === 'vehicles') return renderListTab(body, 'vehicles');
  }

  /* ---- Sections: show / hide ---- */
  function renderSectionsTab(body) {
    var sections = CMS.content.sections;
    var keys = Object.keys(sections).sort(function (a, b) {
      return (sections[a].sort_order || 0) - (sections[b].sort_order || 0);
    });

    if (!keys.length) {
      body.innerHTML = '<p class="dg-empty">No sections found. Run <code>supabase/admin-schema.sql</code> first.</p>';
      return;
    }

    body.innerHTML =
      '<p class="dg-hint block">Switch a section off to remove it from the public site. ' +
      'While you are logged in it stays on screen, dimmed and labelled, so you can keep working on it.</p>' +
      '<div class="dg-list">' +
        keys.map(function (key) {
          var s = sections[key];
          return '<div class="dg-toggle-row">' +
                   '<div>' +
                     '<div class="dg-toggle-name">' + esc(s.label || key) + '</div>' +
                     '<div class="dg-toggle-key">#' + esc(key) + '</div>' +
                   '</div>' +
                   '<label class="dg-switch">' +
                     '<input type="checkbox" data-section-toggle="' + esc(key) + '"' +
                       (s.visible !== false ? ' checked' : '') + '>' +
                     '<span class="dg-switch-track"><span class="dg-switch-thumb"></span></span>' +
                     '<span class="dg-switch-label">' + (s.visible !== false ? 'Visible' : 'Hidden') + '</span>' +
                   '</label>' +
                 '</div>';
        }).join('') +
      '</div>';

    body.querySelectorAll('[data-section-toggle]').forEach(function (input) {
      input.addEventListener('change', function () {
        var key = this.getAttribute('data-section-toggle');
        var next = this.checked;
        var label = this.parentNode.querySelector('.dg-switch-label');
        label.textContent = next ? 'Visible' : 'Hidden';
        this.disabled = true;

        CMS.setSectionVisible(key, next)
          .then(function () { toast(next ? 'Section shown' : 'Section hidden'); })
          .catch(function (err) {
            input.checked = !next;
            label.textContent = !next ? 'Visible' : 'Hidden';
            fail(err);
          })
          .then(function () { input.disabled = false; });
      });
    });
  }

  /* ---- Branding: logos, photo, name, contact ---- */
  function renderBrandingTab(body) {
    var s = CMS.content.settings;

    body.innerHTML =
      '<h3 class="dg-group-title">Images</h3>' +
      BRANDING_IMAGES.map(function (item) { return imageFieldHtml(item, s[item.key]); }).join('') +
      '<h3 class="dg-group-title">Identity & contact</h3>' +
      '<form class="dg-form" id="dgBrandForm">' +
        '<div class="dg-grid">' +
          BRANDING_FIELDS.map(function (f) { return fieldHtml(f, s[f.key]); }).join('') +
        '</div>' +
        '<button type="submit" class="dg-btn primary"><i class="fa-solid fa-check"></i> Save changes</button>' +
      '</form>';

    wireImageFields(body);
    wireSettingsForm(document.getElementById('dgBrandForm'));
  }

  /* ---- Content: every text field on the page ---- */
  function renderContentTab(body) {
    var s = CMS.content.settings;

    body.innerHTML =
      '<p class="dg-hint block">You can also flip on <strong>Edit on page</strong> in the top bar and click ' +
      'the text itself. Both routes save to the same place.</p>' +
      '<form class="dg-form" id="dgContentForm">' +
        CONTENT_GROUPS.map(function (group) {
          return '<h3 class="dg-group-title">' + esc(group.title) + '</h3>' +
                 '<div class="dg-grid">' +
                   group.fields.map(function (f) { return fieldHtml(f, s[f.key]); }).join('') +
                 '</div>';
        }).join('') +
        '<button type="submit" class="dg-btn primary"><i class="fa-solid fa-check"></i> Save changes</button>' +
      '</form>';

    wireSettingsForm(document.getElementById('dgContentForm'));
  }

  /**
   * Saves only the settings the owner actually touched, so an untouched
   * field can never overwrite something edited in another tab.
   */
  function wireSettingsForm(form) {
    if (!form) return;

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      var values = readFields(form);
      var changed = Object.keys(values).filter(function (key) {
        return String(values[key]) !== String(CMS.content.settings[key] == null ? '' : CMS.content.settings[key]);
      });

      if (!changed.length) { toast('Nothing to save'); return; }

      var btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;

      Promise.all(changed.map(function (key) { return CMS.saveSetting(key, values[key]); }))
        .then(function () {
          toast(changed.length + (changed.length === 1 ? ' change saved' : ' changes saved'));
        })
        .catch(fail)
        .then(function () { btn.disabled = false; });
    });
  }

  /* ---- Tours / Vehicles: full CRUD ---- */
  function renderListTab(body, table) {
    var isTours = table === 'tours';
    var rows = isTours ? CMS.content.tours : CMS.content.vehicles;
    var noun = isTours ? 'tour' : 'vehicle';

    body.innerHTML =
      '<div class="dg-list-head">' +
        '<p class="dg-hint">' +
          (isTours
            ? 'These cards fill the “Popular Tours” section.'
            : 'These cards fill the fleet picker inside the booking form.') +
        '</p>' +
        '<button type="button" class="dg-btn primary" id="dgAddRow">' +
          '<i class="fa-solid fa-plus"></i> Add ' + noun + '</button>' +
      '</div>' +
      (rows.length
        ? '<div class="dg-list">' + rows.map(function (row, i) {
            return rowCardHtml(table, row, i, rows.length);
          }).join('') + '</div>'
        : '<p class="dg-empty">No ' + noun + 's yet. Add the first one.</p>');

    document.getElementById('dgAddRow').addEventListener('click', function () {
      openRowEditor(table, null);
    });

    body.querySelectorAll('[data-edit-row]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = this.getAttribute('data-edit-row');
        openRowEditor(table, rows.filter(function (r) { return r.id === id; })[0]);
      });
    });

    body.querySelectorAll('[data-delete-row]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = this.getAttribute('data-delete-row');
        var row = rows.filter(function (r) { return r.id === id; })[0];
        if (!row) return;
        if (!window.confirm('Delete “' + (row.title || row.name) + '” permanently?')) return;

        CMS.deleteRow(table, id)
          .then(refreshEverything)
          .then(function () { toast('Deleted'); })
          .catch(fail);
      });
    });

    body.querySelectorAll('[data-toggle-row]').forEach(function (input) {
      input.addEventListener('change', function () {
        var id = this.getAttribute('data-toggle-row');
        var next = this.checked;
        CMS.saveRow(table, { id: id, visible: next })
          .then(refreshEverything)
          .then(function () { toast(next ? 'Shown on the site' : 'Hidden from the site'); })
          .catch(fail);
      });
    });

    body.querySelectorAll('[data-move-row]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = this.getAttribute('data-move-row');
        var dir = Number(this.getAttribute('data-dir'));
        moveRow(table, rows, id, dir);
      });
    });
  }

  function rowCardHtml(table, row, index, total) {
    var title = row.title || row.name || 'Untitled';
    var sub = table === 'tours'
      ? (row.tag || '') + ((Array.isArray(row.items) && row.items.length) ? ' · ' + row.items.length + ' highlights' : '')
      : [row.badge, row.specs_primary].filter(Boolean).join(' · ');

    var thumb = row.image_url
      ? '<img src="' + esc(row.image_url) + '" alt="">'
      : '<i class="' + esc(table === 'tours' ? 'fa-solid fa-route' : (row.icon || 'fa-solid fa-car-side')) + '"></i>';

    return '<div class="dg-row-card' + (row.visible === false ? ' off' : '') + '">' +
             '<div class="dg-row-thumb">' + thumb + '</div>' +
             '<div class="dg-row-main">' +
               '<div class="dg-row-title">' + esc(title) + '</div>' +
               '<div class="dg-row-sub">' + esc(sub) + '</div>' +
             '</div>' +
             '<div class="dg-row-tools">' +
               '<button type="button" class="dg-icon-btn" data-move-row="' + esc(row.id) + '" data-dir="-1"' +
                 (index === 0 ? ' disabled' : '') + ' title="Move up"><i class="fa-solid fa-arrow-up"></i></button>' +
               '<button type="button" class="dg-icon-btn" data-move-row="' + esc(row.id) + '" data-dir="1"' +
                 (index === total - 1 ? ' disabled' : '') + ' title="Move down"><i class="fa-solid fa-arrow-down"></i></button>' +
               '<button type="button" class="dg-icon-btn" data-edit-row="' + esc(row.id) + '" title="Edit">' +
                 '<i class="fa-solid fa-pen"></i></button>' +
               '<button type="button" class="dg-icon-btn danger" data-delete-row="' + esc(row.id) + '" title="Delete">' +
                 '<i class="fa-solid fa-trash"></i></button>' +
               '<label class="dg-switch mini" title="Show on the site">' +
                 '<input type="checkbox" data-toggle-row="' + esc(row.id) + '"' + (row.visible === false ? '' : ' checked') + '>' +
                 '<span class="dg-switch-track"><span class="dg-switch-thumb"></span></span>' +
               '</label>' +
             '</div>' +
           '</div>';
  }

  /** Swapping sort_order with the neighbour keeps the numbers meaningful. */
  function moveRow(table, rows, id, dir) {
    var index = rows.findIndex(function (r) { return r.id === id; });
    var target = index + dir;
    if (index < 0 || target < 0 || target >= rows.length) return;

    var a = rows[index], b = rows[target];
    var aOrder = a.sort_order, bOrder = b.sort_order;
    if (aOrder === bOrder) { aOrder = index * 10; bOrder = target * 10; }

    Promise.all([
      CMS.saveRow(table, { id: a.id, sort_order: bOrder }),
      CMS.saveRow(table, { id: b.id, sort_order: aOrder })
    ]).then(refreshEverything).catch(fail);
  }

  /* ---- The add / edit dialog for a tour or vehicle ---- */
  function openRowEditor(table, row) {
    var isTours = table === 'tours';
    var fields = isTours ? TOUR_FIELDS : VEHICLE_FIELDS;
    var isNew = !row;
    row = row || {};

    var existing = document.getElementById('dgRowModal');
    if (existing) existing.remove();

    var modal = document.createElement('div');
    modal.className = 'dg-modal';
    modal.id = 'dgRowModal';
    modal.innerHTML =
      '<div class="dg-modal-card" role="dialog" aria-modal="true">' +
        '<header class="dg-modal-head">' +
          '<h3>' + (isNew ? 'Add ' : 'Edit ') + (isTours ? 'tour' : 'vehicle') + '</h3>' +
          '<button type="button" class="dg-panel-close" data-close><i class="fa-solid fa-xmark"></i></button>' +
        '</header>' +
        '<form class="dg-modal-body" id="dgRowForm">' +
          '<div class="dg-grid">' +
            fields.map(function (f) {
              var value = f.type === 'lines'
                ? (Array.isArray(row[f.key]) ? row[f.key].join('\n') : '')
                : row[f.key];
              return fieldHtml(f, value);
            }).join('') +
          '</div>' +
          imageFieldHtml(
            { key: '__image', label: isTours ? 'Tour photo (optional)' : 'Vehicle photo (optional)',
              hint: isTours ? 'Shown above the highlights.' : 'Replaces the icon on the fleet card.',
              folder: table },
            row.image_url
          ) +
          '<div class="dg-modal-actions">' +
            '<button type="button" class="dg-btn ghost" data-close>Cancel</button>' +
            '<button type="submit" class="dg-btn primary"><i class="fa-solid fa-check"></i> ' +
              (isNew ? 'Create' : 'Save') + '</button>' +
          '</div>' +
        '</form>' +
      '</div>';
    document.body.appendChild(modal);
    requestAnimationFrame(function () { modal.classList.add('show'); });

    // Inside the dialog an upload only stages the URL — it is written
    // to the database when the form is submitted.
    var stagedImage = row.image_url || '';
    var imageWrap = modal.querySelector('.dg-image-field');

    imageWrap.querySelector('[data-image-input]').addEventListener('change', function () {
      var file = this.files && this.files[0];
      if (!file) return;
      if (file.size > 6 * 1024 * 1024) { toast('Please choose an image under 6 MB.', 'error'); return; }

      imageWrap.classList.add('busy');
      CMS.uploadImage(file, table).then(function (url) {
        stagedImage = url;
        imageWrap.querySelector('.dg-image-preview').innerHTML = '<img src="' + esc(url) + '" alt="">';
        imageWrap.querySelector('.dg-image-path').textContent = url;
        toast('Image ready — save to apply');
      }).catch(fail).then(function () { imageWrap.classList.remove('busy'); });
    });

    imageWrap.querySelector('[data-image-url]').addEventListener('click', function () {
      var url = window.prompt('Image URL:', stagedImage);
      if (url == null) return;
      stagedImage = url.trim();
      imageWrap.querySelector('.dg-image-preview').innerHTML = stagedImage
        ? '<img src="' + esc(stagedImage) + '" alt="">'
        : '<i class="fa-regular fa-image"></i>';
      imageWrap.querySelector('.dg-image-path').textContent = stagedImage || 'Not set';
    });

    function close() {
      modal.classList.remove('show');
      setTimeout(function () { modal.remove(); }, 200);
    }

    modal.querySelectorAll('[data-close]').forEach(function (btn) {
      btn.addEventListener('click', close);
    });
    modal.addEventListener('click', function (e) { if (e.target === modal) close(); });

    document.getElementById('dgRowForm').addEventListener('submit', function (e) {
      e.preventDefault();

      var payload = readFields(this);
      payload.image_url = stagedImage || null;

      var required = isTours ? 'title' : 'name';
      if (!payload[required]) {
        toast('A ' + (isTours ? 'title' : 'name') + ' is required.', 'error');
        return;
      }

      if (isNew) {
        // Put new entries at the end rather than at position zero.
        var rows = isTours ? CMS.content.tours : CMS.content.vehicles;
        if (!payload.sort_order) {
          payload.sort_order = rows.length
            ? Math.max.apply(null, rows.map(function (r) { return r.sort_order || 0; })) + 10
            : 10;
        }
        payload.visible = true;
      } else {
        payload.id = row.id;
      }

      var btn = this.querySelector('button[type="submit"]');
      btn.disabled = true;

      CMS.saveRow(table, payload)
        .then(refreshEverything)
        .then(function () {
          toast(isNew ? 'Created' : 'Saved');
          close();
        })
        .catch(function (err) { btn.disabled = false; fail(err); });
    });

    var first = modal.querySelector('.dg-input');
    if (first) setTimeout(function () { first.focus(); }, 80);
  }

  /* ---------------------------------------------------------
     Click-to-edit text on the page itself
     --------------------------------------------------------- */
  var inlineWired = false;

  function setInlineEditing(enable) {
    root.classList.toggle('dg-inline', enable);

    document.querySelectorAll('[data-cms-text]').forEach(function (el) {
      if (enable) {
        // Plain "true" rather than "plaintext-only": Firefox only learned
        // the latter recently, and an unrecognised value there leaves the
        // element uneditable. The paste handler below does the same job.
        el.setAttribute('contenteditable', 'true');
        el.setAttribute('spellcheck', 'false');
        el.dataset.dgOriginal = el.textContent;
      } else {
        el.removeAttribute('contenteditable');
      }
    });

    if (enable && !inlineWired) {
      inlineWired = true;

      // Delegated, so text re-rendered from the database is covered too.
      document.addEventListener('blur', function (e) {
        var el = e.target;
        if (!el.hasAttribute || !el.hasAttribute('data-cms-text')) return;
        if (!root.classList.contains('dg-inline')) return;

        var key = el.getAttribute('data-cms-text');
        var next = el.textContent.trim();
        if (next === (el.dataset.dgOriginal || '').trim()) return;

        el.classList.add('dg-saving');
        CMS.saveSetting(key, next)
          .then(function () {
            el.dataset.dgOriginal = next;
            toast('Saved');
          })
          .catch(function (err) {
            el.textContent = el.dataset.dgOriginal || '';
            fail(err);
          })
          .then(function () { el.classList.remove('dg-saving'); });
      }, true);

      // Enter commits instead of inserting a line break.
      document.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' || e.shiftKey) return;
        var el = e.target;
        if (!el.hasAttribute || !el.hasAttribute('data-cms-text')) return;
        e.preventDefault();
        el.blur();
      });

      // Paste arrives as plain text — copying a heading out of a Word
      // document should not drag its markup onto the page.
      document.addEventListener('paste', function (e) {
        var el = e.target;
        if (!el.hasAttribute || !el.hasAttribute('data-cms-text')) return;
        if (!root.classList.contains('dg-inline')) return;

        e.preventDefault();
        var text = ((e.clipboardData || window.clipboardData).getData('text') || '')
          .replace(/\s+/g, ' ');
        document.execCommand('insertText', false, text);
      });
    }

    if (enable) toast('Click any highlighted text to edit it');
  }

  /* ---------------------------------------------------------
     Re-read everything after a write, then repaint the page
     --------------------------------------------------------- */
  function refreshEverything() {
    return CMS.loadContent().then(function () {
      CMS.applyAll();
      renderTab(currentTab);
      if (root.classList.contains('dg-inline')) setInlineEditing(true);
    });
  }

  /* ---------------------------------------------------------
     Go
     --------------------------------------------------------- */
  buildChrome();
  renderTab('sections');

  // The nav "Log In" button turns into a shortcut back to the editor.
  CMS.on('open-admin', openPanel);

  toast('Signed in — you are editing the live site');
})();
