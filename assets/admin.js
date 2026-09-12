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
     • an A4 quotation bill the owner fills in and prints

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
          '<button type="button" class="dg-bar-btn" id="dgOpenQuote" ' +
            'title="Raise an A4 quotation bill for a customer">' +
            '<i class="fa-solid fa-file-invoice"></i> Quotation</button>' +
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
    document.getElementById('dgOpenQuote').addEventListener('click', openQuoteModal);
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


  /* =========================================================
     QUOTATION BILLS
     ---------------------------------------------------------
     An A4 quotation the owner fills in and prints for a customer.
     Admin-only end to end: the button lives on the admin bar, the
     table is closed to everyone but an admin, and none of this is
     downloaded by a visitor.

     The reference number and the issue time come back from the
     database so two quotations can never share a number. If the
     table is missing or the network is down the sheet still prints
     with a local reference, clearly marked as unsaved — a customer
     waiting at the car is not helped by an error message.
     ========================================================= */

  var QUOTE_LIMIT = 25;

  /* Printed on every quotation, word for word. Edit it here and it
     changes on the next bill — including reprints of old ones. */
  var QUOTE_IMPORTANT =
    'The above fee is only for the trip and does not include any other charges ' +
    'like Toll, Parking, Entrance Fee, Night Fee, Extra Kilometre Charge, etc. ' +
    'If you have any queries please contact us using www.dgtravels.com.lk website.';

  /** A setting, or whatever the page is currently showing for it. */
  function settingText(key, fallback) {
    var s = CMS.content.settings || {};
    if (s[key]) return s[key];
    var el = document.querySelector('[data-cms-text="' + key + '"]');
    if (el && el.textContent.trim()) return el.textContent.trim();
    return fallback || '';
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /** "2026-09-12 14:05:00" — the stamp format the bill is specified in. */
  function stampDateTime(value) {
    var d = value ? new Date(value) : new Date();
    if (isNaN(d.getTime())) d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
      ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
  }

  /** "12 September 2026" from the yyyy-mm-dd an <input type=date> gives. */
  function readableDate(value) {
    if (!value) return '';
    var parts = String(value).split('-');
    if (parts.length !== 3) return value;
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    if (isNaN(d.getTime())) return value;
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  /** "14:30" or "14:30:00" -> "02:30 PM" */
  function readableTime(value) {
    if (!value) return '';
    var bits = String(value).split(':');
    var h = Number(bits[0]);
    var m = bits.length > 1 ? bits[1].slice(0, 2) : '00';
    if (isNaN(h)) return value;
    var suffix = h >= 12 ? 'PM' : 'AM';
    var h12 = h % 12;
    if (h12 === 0) h12 = 12;
    return pad2(h12) + ':' + m + ' ' + suffix;
  }

  function money(value) {
    var n = Number(value);
    if (!isFinite(n)) return '';
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /* ---------------------------------------------------------
     The form
     --------------------------------------------------------- */
  function vehicleOptions(selected) {
    var names = (CMS.content.vehicles || [])
      .filter(function (v) { return v.name; })
      .map(function (v) { return v.name; });

    // Whatever the fleet holds, plus anything already typed that is not
    // in it — a hired van should not vanish when the form re-renders.
    if (selected && names.indexOf(selected) === -1) names.push(selected);

    return '<option value="">Choose a vehicle…</option>' +
      names.map(function (name) {
        return '<option value="' + esc(name) + '"' +
          (name === selected ? ' selected' : '') + '>' + esc(name) + '</option>';
      }).join('') +
      '<option value="__other"' + (selected === '__other' ? ' selected' : '') + '>Other — type it in…</option>';
  }

  /* ---- Other locations: a list that grows as the route does ---- */
  function stopRowHtml(value) {
    return '<div class="dgq-stop">' +
             '<span class="dgq-stop-n" aria-hidden="true"></span>' +
             '<input class="dg-input" type="text" data-stop autocomplete="off" ' +
               'value="' + esc(value || '') + '" placeholder="Another place on the route">' +
             '<button type="button" class="dg-icon-btn danger" data-stop-remove ' +
               'title="Remove this stop"><i class="fa-solid fa-xmark"></i></button>' +
           '</div>';
  }

  /** Keeps the visible numbering honest after any add or remove. */
  function renumberStops(host) {
    host.querySelectorAll('.dgq-stop').forEach(function (row, i) {
      row.querySelector('.dgq-stop-n').textContent = (i + 1) + '.';
    });
  }

  function addStop(host, value, focus) {
    host.insertAdjacentHTML('beforeend', stopRowHtml(value));
    var row = host.lastElementChild;
    row.querySelector('[data-stop-remove]').addEventListener('click', function () {
      row.remove();
      renumberStops(host);
    });
    renumberStops(host);
    if (focus) row.querySelector('[data-stop]').focus();
    return row;
  }

  function readStops(modal) {
    return Array.prototype.map.call(
      modal.querySelectorAll('#dgqStops [data-stop]'),
      function (el) { return el.value.trim(); }
    ).filter(Boolean);
  }

  function quoteFormHtml() {
    return '' +
      '<form class="dg-modal-body" id="dgQuoteForm" novalidate>' +

        '<p class="dg-hint block">Reference number and timestamp are added automatically when you ' +
        'create the bill. Fields marked <span class="dg-req">*</span> are required.</p>' +

        '<h3 class="dg-group-title">Customer <span class="dgq-optional">optional</span></h3>' +
        '<div class="dg-grid">' +
          '<div class="dg-field half"><label for="dgqName">Name</label>' +
            '<input id="dgqName" class="dg-input" type="text" autocomplete="off" placeholder="Full name"></div>' +
          '<div class="dg-field half"><label for="dgqPhone">Contact no</label>' +
            '<input id="dgqPhone" class="dg-input" type="tel" autocomplete="off" placeholder="+94 …"></div>' +
          '<div class="dg-field"><label for="dgqEmail">Email</label>' +
            '<input id="dgqEmail" class="dg-input" type="email" autocomplete="off" placeholder="name@example.com"></div>' +
        '</div>' +

        '<h3 class="dg-group-title">Trip</h3>' +
        '<div class="dg-field">' +
          '<label>Trip type <span class="dg-req">*</span></label>' +
          '<div class="dgq-choice" role="radiogroup" aria-label="Trip type">' +
            '<label class="dgq-chip"><input type="radio" name="dgqTrip" value="one_way" checked>' +
              '<span><i class="fa-solid fa-arrow-right-long"></i> One way</span></label>' +
            '<label class="dgq-chip"><input type="radio" name="dgqTrip" value="return">' +
              '<span><i class="fa-solid fa-arrow-right-arrow-left"></i> Return trip</span></label>' +
          '</div>' +
        '</div>' +

        '<div class="dg-grid">' +
          '<div class="dg-field"><label for="dgqPickup">Pickup location <span class="dg-req">*</span></label>' +
            '<input id="dgqPickup" class="dg-input" type="text" autocomplete="off" ' +
            'placeholder="Hotel, villa or airport"></div>' +

          '<div class="dg-field">' +
            '<label>Other locations <span class="dgq-optional">optional, as many as you need</span></label>' +
            '<div id="dgqStops" class="dgq-stops"></div>' +
            '<button type="button" class="dg-btn small ghost dgq-addstop" id="dgqAddStop">' +
              '<i class="fa-solid fa-plus"></i> Add a stop</button>' +
          '</div>' +

          '<div class="dg-field" id="dgqReturnField" hidden>' +
            '<label for="dgqReturn">Return location <span class="dg-req">*</span></label>' +
            '<input id="dgqReturn" class="dg-input" type="text" autocomplete="off" ' +
            'placeholder="Where the trip comes back to"></div>' +

          '<div class="dg-field half"><label for="dgqDate">Date of journey</label>' +
            '<input id="dgqDate" class="dg-input" type="date"></div>' +
          '<div class="dg-field half"><label for="dgqTime">Time of journey</label>' +
            '<input id="dgqTime" class="dg-input" type="time"></div>' +

          '<div class="dg-field half"><label for="dgqPax">No. of passengers <span class="dg-req">*</span></label>' +
            '<input id="dgqPax" class="dg-input" type="number" min="1" max="99" step="1" placeholder="2"></div>' +

          '<div class="dg-field half"><label for="dgqBags">No. of luggage</label>' +
            '<input id="dgqBags" class="dg-input" type="number" min="0" max="99" step="1" placeholder="3"></div>' +

          '<div class="dg-field half"><label for="dgqVehicleSel">Vehicle type <span class="dg-req">*</span></label>' +
            '<select id="dgqVehicleSel" class="dg-input">' + vehicleOptions('') + '</select>' +
            '<input id="dgqVehicleOther" class="dg-input dgq-other" type="text" ' +
            'placeholder="Vehicle name" hidden></div>' +

          '<div class="dg-field"><label for="dgqRequests">Special requests</label>' +
            '<textarea id="dgqRequests" class="dg-input" rows="3" ' +
            'placeholder="Child seat, surfboard rack, early pickup\u2026"></textarea></div>' +
        '</div>' +

        '<h3 class="dg-group-title">Your figures</h3>' +
        '<div class="dg-grid">' +
          '<div class="dg-field half"><label for="dgqDistance">Distance</label>' +
            '<div class="dgq-withbtn">' +
              '<input id="dgqDistance" class="dg-input" type="text" placeholder="e.g. 128 km">' +
              '<button type="button" class="dg-btn small ghost" id="dgqCalc" ' +
              'title="Look the distance up from the two locations">' +
              '<i class="fa-solid fa-route"></i> Look up</button>' +
            '</div></div>' +

          '<div class="dg-field half"><label for="dgqDriver">Driver name</label>' +
            '<input id="dgqDriver" class="dg-input" type="text" autocomplete="off" ' +
            'value="' + esc(settingText('about.name', '')) + '"></div>' +

          '<div class="dg-field"><label for="dgqFare">Fare (LKR)</label>' +
            '<input id="dgqFare" class="dg-input" type="number" min="0" step="0.01" placeholder="25000"></div>' +
        '</div>' +

        '<div class="dg-modal-actions">' +
          '<button type="button" class="dg-btn ghost" data-close>Cancel</button>' +
          '<button type="submit" class="dg-btn primary">' +
            '<i class="fa-solid fa-print"></i> Create &amp; print</button>' +
        '</div>' +

        '<h3 class="dg-group-title">Recent quotations</h3>' +
        '<div id="dgqRecent"><p class="dg-hint">Loading…</p></div>' +
      '</form>';
  }

  function openQuoteModal() {
    closePanel();
    if (root.classList.contains('dg-preview')) setPreview(false);

    var existing = document.getElementById('dgQuoteModal');
    if (existing) existing.remove();

    var modal = document.createElement('div');
    modal.className = 'dg-modal';
    modal.id = 'dgQuoteModal';
    modal.innerHTML =
      '<div class="dg-modal-card wide" role="dialog" aria-modal="true" aria-label="New quotation">' +
        '<header class="dg-modal-head">' +
          '<h3><i class="fa-solid fa-file-invoice"></i> New quotation</h3>' +
          '<button type="button" class="dg-panel-close" data-close aria-label="Close">' +
            '<i class="fa-solid fa-xmark"></i></button>' +
        '</header>' +
        quoteFormHtml() +
      '</div>';
    document.body.appendChild(modal);
    requestAnimationFrame(function () { modal.classList.add('show'); });

    function close() {
      modal.classList.remove('show');
      setTimeout(function () { modal.remove(); }, 200);
    }

    modal.querySelectorAll('[data-close]').forEach(function (btn) {
      btn.addEventListener('click', close);
    });
    modal.addEventListener('click', function (e) { if (e.target === modal) close(); });

    wireQuoteForm(modal, close);
    loadRecentQuotes(modal.querySelector('#dgqRecent'));

    var first = modal.querySelector('#dgqName');
    if (first) setTimeout(function () { first.focus(); }, 80);
  }

  function wireQuoteForm(modal, close) {
    var form = modal.querySelector('#dgQuoteForm');
    var returnField = modal.querySelector('#dgqReturnField');
    var returnInput = modal.querySelector('#dgqReturn');
    var vehicleSel = modal.querySelector('#dgqVehicleSel');
    var vehicleOther = modal.querySelector('#dgqVehicleOther');
    var pickupInput = modal.querySelector('#dgqPickup');
    var distanceInput = modal.querySelector('#dgqDistance');
    var calcBtn = modal.querySelector('#dgqCalc');

    // The return location only exists for a return trip.
    /** Where the route ends: the return location, else the last stop. */
    function lastPoint() {
      var isReturn = modal.querySelector('input[name="dgqTrip"]:checked').value === 'return';
      if (isReturn && returnInput.value.trim()) return returnInput.value.trim();
      var stops = readStops(modal);
      return stops.length ? stops[stops.length - 1] : '';
    }

    // Nothing to route to means nothing to look up.
    function refreshLookup() { calcBtn.hidden = !lastPoint(); }

    modal.querySelectorAll('input[name="dgqTrip"]').forEach(function (radio) {
      radio.addEventListener('change', function () {
        var isReturn = modal.querySelector('input[name="dgqTrip"]:checked').value === 'return';
        returnField.hidden = !isReturn;
        refreshLookup();
        if (isReturn) returnInput.focus();
      });
    });

    // Typing a destination is what makes the lookup worth offering.
    modal.addEventListener('input', function (e) {
      if (e.target === returnInput || e.target.hasAttribute('data-stop')) refreshLookup();
    });
    refreshLookup();

    var stopsHost = modal.querySelector('#dgqStops');
    modal.querySelector('#dgqAddStop').addEventListener('click', function () {
      addStop(stopsHost, '', true);
      refreshLookup();
    });

    vehicleSel.addEventListener('change', function () {
      var other = this.value === '__other';
      vehicleOther.hidden = !other;
      if (other) vehicleOther.focus();
    });

    // Same lookup the booking form uses; it fills the field rather than
    // owning it, so the owner can still overwrite the number by hand.
    calcBtn.addEventListener('click', function () {
      var origin = pickupInput.value.trim();
      var destination = lastPoint();
      if (origin.length < 3 || destination.length < 3) {
        toast('Fill in both ends of the route first.', 'error');
        return;
      }

      calcBtn.disabled = true;
      var label = calcBtn.innerHTML;
      calcBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Looking up';

      fetch('/api/distance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ origin: origin, destination: destination })
      })
        .then(function (res) {
          return res.json().then(function (b) { return { ok: res.ok, body: b }; });
        })
        .then(function (r) {
          if (!r.ok) throw new Error((r.body && r.body.error) || 'Lookup failed.');
          distanceInput.value = r.body.text || (r.body.km + ' km');
        })
        .catch(function (err) { toast(err.message || 'Could not look that route up.', 'error'); })
        .then(function () {
          calcBtn.disabled = false;
          calcBtn.innerHTML = label;
        });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var payload = readQuoteForm(modal);
      if (!payload) return;

      var btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;

      CMS.createQuotation(payload)
        .then(function (row) {
          close();
          showQuoteSheet(row || localQuote(payload), !row);
        })
        .catch(function (err) {
          // Saving failed — print anyway, marked as not recorded, so the
          // customer still leaves with a bill in hand.
          console.error('[quotation]', err);
          btn.disabled = false;
          if (!window.confirm(
            'The quotation could not be saved:\n\n' + (err.message || 'Unknown error') +
            '\n\nPrint it anyway? It will carry a temporary reference number and will not be recorded.'
          )) return;
          close();
          showQuoteSheet(localQuote(payload), true);
        });
    });
  }

  /** Reads and validates the form. Returns null (and complains) if invalid. */
  function readQuoteForm(modal) {
    function val(id) {
      var el = modal.querySelector('#' + id);
      return el ? el.value.trim() : '';
    }

    var tripType = modal.querySelector('input[name="dgqTrip"]:checked').value;
    var pickup = val('dgqPickup');
    var returnTo = val('dgqReturn');
    var pax = val('dgqPax');
    var vehicle = modal.querySelector('#dgqVehicleSel').value;
    if (vehicle === '__other') vehicle = val('dgqVehicleOther');

    function complain(message, id) {
      toast(message, 'error');
      var el = modal.querySelector('#' + id);
      if (el) { el.focus(); el.classList.add('dgq-invalid'); setTimeout(function () {
        el.classList.remove('dgq-invalid');
      }, 1600); }
      return null;
    }

    if (!pickup) return complain('A pickup location is required.', 'dgqPickup');
    if (tripType === 'return' && !returnTo) {
      return complain('A return trip needs a return location.', 'dgqReturn');
    }
    if (!pax || Number(pax) < 1) return complain('How many passengers?', 'dgqPax');
    if (!vehicle) {
      return complain('Choose a vehicle type.',
        modal.querySelector('#dgqVehicleOther').hidden ? 'dgqVehicleSel' : 'dgqVehicleOther');
    }

    var fare = val('dgqFare');
    var bags = val('dgqBags');

    return {
      customer_name:    val('dgqName') || null,
      customer_phone:   val('dgqPhone') || null,
      customer_email:   val('dgqEmail') || null,
      trip_type:        tripType,
      pickup_location:  pickup,
      other_locations:  readStops(modal),
      return_location:  tripType === 'return' ? returnTo : null,
      journey_date:     val('dgqDate') || null,
      journey_time:     val('dgqTime') || null,
      distance:         val('dgqDistance') || null,
      passengers:       Number(pax),
      luggage:          bags === '' ? null : Number(bags),
      special_requests: val('dgqRequests') || null,
      vehicle_type:     vehicle,
      driver_name:      val('dgqDriver') || null,
      fare_lkr:         fare === '' ? null : Number(fare)
    };
  }

  /** A stand-in record for when the save did not go through. */
  function localQuote(payload) {
    var now = new Date();
    return Object.assign({}, payload, {
      ref_no: 'REF-' + String(now.getFullYear()).slice(2) + pad2(now.getMonth() + 1) +
              pad2(now.getDate()) + '-' + pad2(now.getHours()) + pad2(now.getMinutes()),
      issued_at: now.toISOString()
    });
  }

  /* ---------------------------------------------------------
     Recent quotations — so an old bill can be reprinted
     --------------------------------------------------------- */
  function loadRecentQuotes(host) {
    if (!host) return;

    CMS.listQuotations(QUOTE_LIMIT).then(function (rows) {
      rows = rows || [];
      if (!rows.length) {
        host.innerHTML = '<p class="dg-empty">No quotations yet. The first one you create will be REF-001.</p>';
        return;
      }

      host.innerHTML = '<div class="dg-list">' + rows.map(function (row) {
        var who = row.customer_name || row.pickup_location || 'Quotation';
        var sub = [
          stampDateTime(row.issued_at).slice(0, 16),
          row.vehicle_type,
          row.fare_lkr == null ? '' : 'LKR ' + money(row.fare_lkr)
        ].filter(Boolean).join(' · ');

        return '<div class="dg-row-card">' +
                 '<div class="dg-row-thumb dgq-refbox"><span class="dgq-ref">' + esc(row.ref_no) + '</span></div>' +
                 '<div class="dg-row-main">' +
                   '<div class="dg-row-title">' + esc(who) + '</div>' +
                   '<div class="dg-row-sub">' + esc(sub) + '</div>' +
                 '</div>' +
                 '<div class="dg-row-tools">' +
                   '<button type="button" class="dg-icon-btn" data-quote-print="' + esc(row.id) + '" ' +
                     'title="Print again"><i class="fa-solid fa-print"></i></button>' +
                   '<button type="button" class="dg-icon-btn danger" data-quote-delete="' + esc(row.id) + '" ' +
                     'title="Delete"><i class="fa-solid fa-trash"></i></button>' +
                 '</div>' +
               '</div>';
      }).join('') + '</div>';

      host.querySelectorAll('[data-quote-print]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var id = this.getAttribute('data-quote-print');
          var row = rows.filter(function (r) { return r.id === id; })[0];
          if (!row) return;
          var modal = document.getElementById('dgQuoteModal');
          if (modal) {
            modal.classList.remove('show');
            setTimeout(function () { modal.remove(); }, 200);
          }
          showQuoteSheet(row, false);
        });
      });

      host.querySelectorAll('[data-quote-delete]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var id = this.getAttribute('data-quote-delete');
          var row = rows.filter(function (r) { return r.id === id; })[0];
          if (!row) return;
          if (!window.confirm('Delete ' + row.ref_no + ' permanently?')) return;

          CMS.deleteQuotation(id)
            .then(function () {
              toast('Deleted');
              loadRecentQuotes(host);
            })
            .catch(fail);
        });
      });
    }).catch(function (err) {
      console.warn('[quotation]', err);
      host.innerHTML = '<p class="dg-empty">Could not load past quotations. ' +
        'Run <code>supabase/quotations-schema.sql</code> if you have not yet.</p>';
    });
  }

  /* ---------------------------------------------------------
     The printed sheet
     --------------------------------------------------------- */
  function letterhead() {
    return {
      logo: currentImage('brand.logo', CMS.content.settings['brand.logo']),
      name: settingText('brand.name', 'DG TRAVELS'),
      sub: settingText('brand.sub', 'SRI LANKA'),
      phone: settingText('contact.phone', ''),
      whatsapp: settingText('contact.whatsapp', ''),
      place: settingText('footer.tagline', '')
    };
  }

  function detailRow(label, value) {
    if (!value && value !== 0) return '';
    return '<tr><th>' + esc(label) + '</th><td>' + esc(value) + '</td></tr>';
  }

  /**
   * The short facts, three to a line. A row each reads fine on screen but
   * costs about 20mm of paper, which is the difference between one sheet
   * and two on an ordinary quotation.
   */
  function factsHtml(pairs) {
    var cells = pairs.filter(function (pair) {
      return pair[1] || pair[1] === 0;
    }).map(function (pair) {
      return '<div class="dgq-fact">' +
               '<div class="dgq-fact-l">' + esc(pair[0]) + '</div>' +
               '<div class="dgq-fact-v">' + esc(pair[1]) + '</div>' +
             '</div>';
    });
    return cells.length ? '<div class="dgq-facts">' + cells.join('') + '</div>' : '';
  }

  /** A full-width paragraph, for the one field that runs long. */
  function noteHtml(label, value) {
    if (!value) return '';
    return '<div class="dgq-note">' +
             '<div class="dgq-fact-l">' + esc(label) + '</div>' +
             '<p>' + esc(value) + '</p>' +
           '</div>';
  }

  /** The stops, numbered, in one cell — a row each would cost a page. */
  function stopsRow(list) {
    if (!Array.isArray(list) || !list.length) return '';
    return '<tr class="dgq-stops-row"><th>Other locations</th><td>' +
             '<ol class="dgq-stoplist">' +
               list.map(function (stop) { return '<li>' + esc(stop) + '</li>'; }).join('') +
             '</ol>' +
           '</td></tr>';
  }

  function quoteSheetHtml(q, unsaved) {
    var head = letterhead();
    var isReturn = q.trip_type === 'return';

    var customer = factsHtml([
      ['Name', q.customer_name],
      ['Contact no', q.customer_phone],
      ['Email', q.customer_email]
    ]);

    // Places can run long, so they keep a full-width row each.
    var route = [
      detailRow('Pickup location', q.pickup_location),
      stopsRow(q.other_locations),
      isReturn ? detailRow('Return location', q.return_location) : ''
    ].join('');

    var facts = factsHtml([
      ['Trip type', isReturn ? 'Return trip' : 'One way'],
      ['Date of journey', readableDate(q.journey_date)],
      ['Time of journey', readableTime(q.journey_time)],
      ['Distance', q.distance],
      ['No. of passengers', q.passengers],
      ['No. of luggage', q.luggage],
      ['Vehicle type', q.vehicle_type],
      ['Driver', q.driver_name]
    ]);

    return '' +
      '<div class="dgq-sheet">' +

        '<header class="dgq-letterhead">' +
          (head.logo ? '<img class="dgq-logo" src="' + esc(head.logo) + '" alt="">' : '') +
          '<div class="dgq-ident">' +
            '<div class="dgq-name">' + esc(head.name) + '</div>' +
            '<div class="dgq-sub">' + esc(head.sub) + '</div>' +
          '</div>' +
          '<div class="dgq-reach">' +
            (head.place ? '<div>' + esc(head.place) + '</div>' : '') +
            (head.phone ? '<div>Tel ' + esc(head.phone) + '</div>' : '') +
            (head.whatsapp ? '<div>WhatsApp +' + esc(head.whatsapp) + '</div>' : '') +
          '</div>' +
        '</header>' +

        '<div class="dgq-rule"></div>' +

        '<h1 class="dgq-doctitle">Quotation</h1>' +

        '<div class="dgq-meta">' +
          '<div><span>Reference No</span><strong>' + esc(q.ref_no) + '</strong></div>' +
          '<div><span>Date &amp; Time</span><strong>' + esc(stampDateTime(q.issued_at)) + '</strong></div>' +
        '</div>' +

        (unsaved ? '<p class="dgq-warn">Not recorded — this reference number is temporary.</p>' : '') +

        (customer
          ? '<section class="dgq-block">' +
              '<h2>Customer</h2>' + customer +
            '</section>'
          : '') +

        '<section class="dgq-block">' +
          '<h2>Journey</h2>' +
          '<table class="dgq-table">' + route + '</table>' +
          facts +
          noteHtml('Special requests', q.special_requests) +
        '</section>' +

        (q.fare_lkr == null
          ? ''
          : '<div class="dgq-fare">' +
              '<span>Quoted fare</span>' +
              '<strong>LKR ' + esc(money(q.fare_lkr)) + '</strong>' +
            '</div>') +

        '<section class="dgq-important">' +
          '<h3>Important</h3>' +
          '<p>' + esc(QUOTE_IMPORTANT) + '</p>' +
        '</section>' +

        '<footer class="dgq-foot">' +
          '<div class="dgq-sign">' +
            '<div class="dgq-signline"></div>' +
            '<div>' + esc(q.driver_name || head.name) + '</div>' +
            '<div class="dgq-signrole">' +
              (q.driver_name ? 'For ' + esc(head.name) : 'Authorised signature') + '</div>' +
          '</div>' +
          '<p class="dgq-thanks">Thank you for travelling with ' + esc(head.name) + '.</p>' +
        '</footer>' +

      '</div>';
  }

  /* The host is a direct child of <body> so the print rules can hide
     every sibling and leave the sheet alone on the page. */
  function sheetHost() {
    var host = document.getElementById('dgQuoteSheetHost');
    if (!host) {
      host = document.createElement('div');
      host.id = 'dgQuoteSheetHost';
      document.body.appendChild(host);
    }
    return host;
  }

  function showQuoteSheet(q, unsaved) {
    var host = sheetHost();
    host.innerHTML =
      '<div class="dgq-toolbar">' +
        '<button type="button" class="dg-bar-btn" id="dgqBack">' +
          '<i class="fa-solid fa-arrow-left"></i> Back</button>' +
        '<span class="dgq-toolbar-ref">' + esc(q.ref_no) + '</span>' +
        '<button type="button" class="dg-bar-btn primary" id="dgqPrint">' +
          '<i class="fa-solid fa-print"></i> Print / Save as PDF</button>' +
      '</div>' +
      '<div class="dgq-stage"><div class="dgq-scaler">' + quoteSheetHtml(q, unsaved) + '</div></div>';

    root.classList.add('dg-quoting');
    fitSheet();

    // The scaled height is measured, not computed, so anything that lands
    // after the first measurement has to trigger another one: the webfont
    // swapping in, and the logo arriving.
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitSheet);
    var logo = host.querySelector('.dgq-logo');
    if (logo && !logo.complete) {
      logo.addEventListener('load', fitSheet);
      logo.addEventListener('error', fitSheet);
    }

    host.querySelector('#dgqPrint').addEventListener('click', function () { window.print(); });
    host.querySelector('#dgqBack').addEventListener('click', hideQuoteSheet);

    if (unsaved) toast('Printing an unsaved quotation', 'error');
  }

  function hideQuoteSheet() {
    root.classList.remove('dg-quoting');
    var host = document.getElementById('dgQuoteSheetHost');
    if (host) host.innerHTML = '';
    openQuoteModal();
  }

  /* An A4 page is 794px wide at 96dpi and a phone is not. Scale the
     preview to fit; print resets the transform and uses the real page. */
  function fitSheet() {
    if (!root.classList.contains('dg-quoting')) return;

    var scaler = document.querySelector('#dgQuoteSheetHost .dgq-scaler');
    var stage = document.querySelector('#dgQuoteSheetHost .dgq-stage');
    var sheet = scaler && scaler.querySelector('.dgq-sheet');
    if (!scaler || !sheet) return;

    scaler.style.transform = 'none';
    scaler.style.width = '';
    scaler.style.height = '';

    var available = stage.clientWidth - 24;
    var scale = Math.min(1, available / sheet.offsetWidth);

    scaler.style.transform = 'scale(' + scale + ')';
    // A transform paints at the new size but leaves the old layout box in
    // place. Without these the stage scrolls sideways on a phone and never
    // scrolls far enough down to reach the foot of the sheet.
    scaler.style.width = (sheet.offsetWidth * scale) + 'px';
    scaler.style.height = (sheet.offsetHeight * scale) + 'px';
  }

  window.addEventListener('resize', fitSheet);

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && root.classList.contains('dg-quoting')) hideQuoteSheet();
  });

  /* ---------------------------------------------------------
     Go
     --------------------------------------------------------- */
  buildChrome();
  renderTab('sections');

  // The nav "Log In" button turns into a shortcut back to the editor.
  CMS.on('open-admin', openPanel);

  toast('Signed in — you are editing the live site');
})();
