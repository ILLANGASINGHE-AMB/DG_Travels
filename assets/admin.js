/* ============================================================
   DG Travels — admin editor
   ------------------------------------------------------------
   Downloaded only after an admin has signed in (cms.js injects it),
   so an ordinary visitor never pays for any of this.

   What it adds:
     • a top Admin bar with a "Preview as visitor" switch
     • a slide-in panel: Sections, Branding, Content, Tours, Gallery, Vehicles
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
      title: 'Gallery section heading',
      fields: [
        { key: 'gallery.eyebrow', label: 'Eyebrow' },
        { key: 'gallery.title', label: 'Title' },
        { key: 'gallery.subtitle', label: 'Subtitle', type: 'textarea' }
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

  var GALLERY_FIELDS = [
    { key: 'caption', label: 'Caption', required: true, maxlength: 200,
      placeholder: 'Sunrise over the Nine Arch Bridge, Ella' },
    { key: 'photo_date', label: 'Date of the photo', type: 'date', required: true, half: true }
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
            'title="Raise an A4 quotation bill, or open a saved one">' +
            '<i class="fa-solid fa-file-invoice"></i> Quotations</button>' +
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
      // Six tabs have to fit the panel width without scrolling, so the
      // labels carry themselves — no icons here.
      '<nav class="dg-tabs" id="dgTabs">' +
        '<button type="button" class="dg-tab active" data-tab="sections">Sections</button>' +
        '<button type="button" class="dg-tab" data-tab="branding">Branding</button>' +
        '<button type="button" class="dg-tab" data-tab="content">Content</button>' +
        '<button type="button" class="dg-tab" data-tab="tours">Tours</button>' +
        '<button type="button" class="dg-tab" data-tab="gallery">Gallery</button>' +
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
      var inputType = field.type === 'number' || field.type === 'date' ? field.type : 'text';
      input = '<input id="' + id + '" class="dg-input" type="' + inputType + '" ' +
              (field.maxlength ? 'maxlength="' + Number(field.maxlength) + '" ' : '') +
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
    if (name === 'gallery') return renderGalleryTab(body);
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

  /* ---- Gallery: photos with a caption and the date they were taken ---- */
  var galleryRows = [];
  var PHOTO_MAX_EDGE = 2000;

  function todayIso() {
    var d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function findPhoto(id) {
    return galleryRows.filter(function (p) { return p.id === id; })[0];
  }

  /**
   * A photo straight off a phone is 3–10 MB and 4000px across; the gallery
   * never shows one wider than about 1100px. Anything big is re-encoded to
   * 2000px on its long edge before it uploads. If the browser cannot decode
   * the file (HEIC in desktop Chrome, say) the original goes up unchanged.
   */
  function shrinkImage(file) {
    return new Promise(function (resolve) {
      if (/gif|svg/i.test(file.type || '') || !window.URL || !URL.createObjectURL) {
        resolve(file);
        return;
      }

      var src = URL.createObjectURL(file);
      var img = new Image();

      img.onerror = function () {
        URL.revokeObjectURL(src);
        resolve(file);
      };

      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight;
        var scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(w, h));

        if (scale === 1 && file.size <= 1.5 * 1024 * 1024) {
          URL.revokeObjectURL(src);
          resolve(file);
          return;
        }

        var canvas = document.createElement('canvas');
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        var ctx = canvas.getContext('2d');
        // JPEG has no transparency; a see-through PNG lands on the site's
        // own background colour rather than on black.
        ctx.fillStyle = '#111111';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(src);

        canvas.toBlob(function (blob) {
          if (!blob || (scale === 1 && blob.size >= file.size)) { resolve(file); return; }
          var name = String(file.name || 'photo').replace(/\.[^.]*$/, '') + '.jpg';
          try {
            resolve(new File([blob], name, { type: 'image/jpeg' }));
          } catch (err) {
            blob.name = name;   // very old Safari: no File constructor
            resolve(blob);
          }
        }, 'image/jpeg', 0.85);
      };

      img.src = src;
    });
  }

  function photoRowHtml(photo) {
    return '<div class="dg-row-card">' +
             '<div class="dg-row-thumb"><img src="' + esc(photo.image_url) + '" alt="" loading="lazy"></div>' +
             '<div class="dg-row-main">' +
               '<div class="dg-row-title">' + esc(photo.caption) + '</div>' +
               '<div class="dg-row-sub">' + esc(CMS.photoDate(photo.photo_date)) + '</div>' +
             '</div>' +
             '<div class="dg-row-tools">' +
               '<button type="button" class="dg-icon-btn" data-edit-photo="' + esc(photo.id) + '" title="Edit">' +
                 '<i class="fa-solid fa-pen"></i></button>' +
               '<button type="button" class="dg-icon-btn danger" data-delete-photo="' + esc(photo.id) + '" title="Delete">' +
                 '<i class="fa-solid fa-trash"></i></button>' +
             '</div>' +
           '</div>';
  }

  function renderGalleryTab(body) {
    body.innerHTML =
      '<div class="dg-list-head">' +
        '<p class="dg-hint">These photos fill the “Gallery” section, newest date first. ' +
          'Visitors see four, then <strong>View more photos</strong> for the rest.</p>' +
        '<button type="button" class="dg-btn primary" id="dgAddPhoto">' +
          '<i class="fa-solid fa-plus"></i> Add photo</button>' +
      '</div>' +
      '<div id="dgGalleryList"><p class="dg-empty">Loading photos…</p></div>';

    document.getElementById('dgAddPhoto').addEventListener('click', function () {
      openPhotoEditor(null);
    });

    CMS.listGallery(0, 1000, true)
      .then(function (rows) {
        var list = document.getElementById('dgGalleryList');
        if (!list) return;   // the owner has moved on to another tab
        galleryRows = Array.isArray(rows) ? rows : [];

        if (!galleryRows.length) {
          list.innerHTML = '<p class="dg-empty">No photos yet. Add the first one.</p>';
          return;
        }

        list.innerHTML = '<div class="dg-list">' + galleryRows.map(photoRowHtml).join('') + '</div>';

        list.querySelectorAll('[data-edit-photo]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var photo = findPhoto(this.getAttribute('data-edit-photo'));
            if (photo) openPhotoEditor(photo);
          });
        });

        list.querySelectorAll('[data-delete-photo]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var photo = findPhoto(this.getAttribute('data-delete-photo'));
            if (!photo) return;
            if (!window.confirm('Delete “' + photo.caption + '” from the gallery permanently?')) return;

            btn.disabled = true;
            CMS.deleteGalleryPhoto(photo)
              .then(CMS.reloadGallery)
              .then(function () {
                toast('Photo deleted');
                if (currentTab === 'gallery') renderTab('gallery');
              })
              .catch(function (err) { btn.disabled = false; fail(err); });
          });
        });
      })
      .catch(function (err) {
        console.error('[admin]', err);
        var list = document.getElementById('dgGalleryList');
        if (list) {
          list.innerHTML = '<p class="dg-empty">The gallery could not be loaded. If this is the first time, ' +
            'run <code>supabase/gallery-schema.sql</code> in Supabase.</p>';
        }
      });
  }

  /* ---- The add / edit dialog for one photo ---- */
  function openPhotoEditor(photo) {
    var isNew = !photo;
    photo = photo || { caption: '', photo_date: todayIso(), image_url: '' };

    var existing = document.getElementById('dgRowModal');
    if (existing) existing.remove();

    var modal = document.createElement('div');
    modal.className = 'dg-modal';
    modal.id = 'dgRowModal';
    modal.innerHTML =
      '<div class="dg-modal-card" role="dialog" aria-modal="true">' +
        '<header class="dg-modal-head">' +
          '<h3>' + (isNew ? 'Add photo' : 'Edit photo') + '</h3>' +
          '<button type="button" class="dg-panel-close" data-close aria-label="Close"><i class="fa-solid fa-xmark"></i></button>' +
        '</header>' +
        '<form class="dg-modal-body" id="dgPhotoForm" novalidate>' +
          imageFieldHtml({
            key: '__photo',
            label: 'Photo',
            hint: 'Required. A large photo is resized before it uploads, so it stays quick to load on a phone.',
            folder: CMS.galleryFolder
          }, photo.image_url) +
          '<div class="dg-grid">' +
            GALLERY_FIELDS.map(function (f) { return fieldHtml(f, photo[f.key]); }).join('') +
          '</div>' +
          '<div class="dg-modal-actions">' +
            '<button type="button" class="dg-btn ghost" data-close>Cancel</button>' +
            '<button type="submit" class="dg-btn primary"><i class="fa-solid fa-check"></i> ' +
              (isNew ? 'Add to gallery' : 'Save') + '</button>' +
          '</div>' +
        '</form>' +
      '</div>';
    document.body.appendChild(modal);
    requestAnimationFrame(function () { modal.classList.add('show'); });

    // As with tours, an upload only stages the file; nothing reaches the
    // gallery until the form is saved.
    var original = photo.image_url || '';
    var staged = original;
    var uploads = [];
    var saved = false;
    var closed = false;
    var imageWrap = modal.querySelector('.dg-image-field');

    function showStaged() {
      imageWrap.querySelector('.dg-image-preview').innerHTML = staged
        ? '<img src="' + esc(staged) + '" alt="">'
        : '<i class="fa-regular fa-image"></i>';
      imageWrap.querySelector('.dg-image-path').textContent = staged || 'Not set';
    }

    imageWrap.querySelector('[data-image-input]').addEventListener('change', function () {
      var file = this.files && this.files[0];
      this.value = '';   // choosing the same file again should still fire
      if (!file) return;

      imageWrap.classList.add('busy');
      shrinkImage(file)
        .then(function (ready) {
          if (ready.size > 6 * 1024 * 1024) throw new Error('Please choose an image under 6 MB.');
          return CMS.uploadImage(ready, CMS.galleryFolder);
        })
        .then(function (url) {
          uploads.push(url);
          staged = url;
          showStaged();
          toast('Photo ready — save to publish it');
        })
        .catch(fail)
        .then(function () { imageWrap.classList.remove('busy'); });
    });

    imageWrap.querySelector('[data-image-url]').addEventListener('click', function () {
      var url = window.prompt('Image URL:', staged);
      if (url == null) return;
      staged = url.trim();
      showStaged();
    });

    function close() {
      if (closed) return;
      closed = true;

      // Leave nothing orphaned in storage: an abandoned dialog's uploads are
      // unused, and so is the old file once a replacement has been saved.
      var unused = uploads.filter(function (url) { return !saved || url !== staged; });
      if (saved && staged !== original) unused.push(original);
      unused.forEach(function (url) { CMS.deleteStoredImage(url, CMS.galleryFolder); });

      modal.classList.remove('show');
      setTimeout(function () { modal.remove(); }, 200);
    }

    modal.querySelectorAll('[data-close]').forEach(function (btn) {
      btn.addEventListener('click', close);
    });
    modal.addEventListener('click', function (e) { if (e.target === modal) close(); });

    document.getElementById('dgPhotoForm').addEventListener('submit', function (e) {
      e.preventDefault();

      if (imageWrap.classList.contains('busy')) {
        toast('Wait for the photo to finish uploading.', 'error');
        return;
      }

      var values = readFields(this);
      if (!staged) {
        toast('Choose a photo to upload.', 'error');
        return;
      }
      if (!values.caption) {
        toast('A caption is required.', 'error');
        modal.querySelector('[data-field="caption"]').focus();
        return;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(values.photo_date || '')) {
        toast('Pick the date of the photo.', 'error');
        modal.querySelector('[data-field="photo_date"]').focus();
        return;
      }

      var payload = { image_url: staged, caption: values.caption, photo_date: values.photo_date };
      if (!isNew) payload.id = photo.id;

      var btn = this.querySelector('button[type="submit"]');
      btn.disabled = true;

      CMS.saveRow('gallery_photos', payload)
        .then(function () {
          saved = true;
          return CMS.reloadGallery();
        })
        .then(function () {
          toast(isNew ? 'Photo added to the gallery' : 'Photo saved');
          close();
          if (currentTab === 'gallery') renderTab('gallery');
        })
        .catch(function (err) { btn.disabled = false; fail(err); });
    });
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

     A quotation is one or more trips sharing a vehicle. Each trip
     carries its own route, its own distance and its own fare; the
     vehicle, the driver, the allowance and the totals are worked
     out once for the lot.

     The reference number and the issue time come back from the
     database so two quotations can never share a number. If the
     table is missing or the network is down the sheet still prints
     with a local reference, clearly marked as unsaved — a customer
     waiting at the car is not helped by an error message.
     ========================================================= */

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

  /** Distances are typed in kilometres, so they add up and print alike. */
  function kmText(value) {
    if (value == null || value === '') return '';
    var n = Number(value);
    if (!isFinite(n)) return '';
    return (Math.round(n * 10) / 10).toLocaleString('en-US') + ' km';
  }

  function num(value) {
    var n = Number(value);
    return isFinite(n) ? n : 0;
  }

  /* ---------------------------------------------------------
     Vehicle choices
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
      '<option value="__other">Other — type it in…</option>';
  }

  /* ---------------------------------------------------------
     One trip — the repeatable part of the form
     --------------------------------------------------------- */
  var tripUid = 0;

  function stopRowHtml(value) {
    return '<div class="dgq-stop">' +
             '<span class="dgq-stop-n" aria-hidden="true"></span>' +
             '<input class="dg-input" type="text" data-stop autocomplete="off" ' +
               'value="' + esc(value || '') + '" placeholder="Another place on the route">' +
             '<button type="button" class="dg-icon-btn danger" data-stop-remove ' +
               'title="Remove this stop"><i class="fa-solid fa-xmark"></i></button>' +
           '</div>';
  }

  function tripCardHtml() {
    var uid = ++tripUid;

    return '<section class="dgq-trip" data-trip>' +
      '<header class="dgq-trip-head">' +
        '<h4><span class="dgq-trip-n"></span></h4>' +
        '<button type="button" class="dg-btn small ghost" data-trip-remove>' +
          '<i class="fa-solid fa-xmark"></i> Remove</button>' +
      '</header>' +

      '<div class="dg-field">' +
        '<div class="dgq-choice" role="radiogroup" aria-label="Trip type">' +
          '<label class="dgq-chip"><input type="radio" data-f="type" ' +
            'name="dgqTrip' + uid + '" value="one_way" checked>' +
            '<span><i class="fa-solid fa-arrow-right-long"></i> One way</span></label>' +
          '<label class="dgq-chip"><input type="radio" data-f="type" ' +
            'name="dgqTrip' + uid + '" value="return">' +
            '<span><i class="fa-solid fa-arrow-right-arrow-left"></i> Return trip</span></label>' +
        '</div>' +
      '</div>' +

      '<div class="dg-grid">' +
        '<div class="dg-field"><label>Pickup location <span class="dg-req">*</span></label>' +
          '<input class="dg-input" type="text" data-f="pickup" autocomplete="off" ' +
          'placeholder="Hotel, villa or airport"></div>' +

        '<div class="dg-field">' +
          '<label>Other locations <span class="dgq-optional">optional, as many as you need</span></label>' +
          '<div class="dgq-stops" data-stops></div>' +
          '<button type="button" class="dg-btn small ghost dgq-addstop" data-add-stop>' +
            '<i class="fa-solid fa-plus"></i> Add a stop</button>' +
        '</div>' +

        // Only one of these two is ever in play, and the trip type decides which.
        '<div class="dg-field" data-when="one_way">' +
          '<label>Destination <span class="dg-req">*</span></label>' +
          '<input class="dg-input" type="text" data-f="destination" autocomplete="off" ' +
          'placeholder="Where the trip ends"></div>' +

        '<div class="dg-field" data-when="return" hidden>' +
          '<label>Return location <span class="dg-req">*</span></label>' +
          '<input class="dg-input" type="text" data-f="return" autocomplete="off" ' +
          'placeholder="Where the trip comes back to"></div>' +

        '<div class="dg-field half"><label>Date of journey</label>' +
          '<input class="dg-input dgq-dt" type="date" data-f="date"></div>' +
        '<div class="dg-field half"><label>Time of journey</label>' +
          '<input class="dg-input dgq-dt" type="time" data-f="time"></div>' +

        '<div class="dg-field half"><label>Trip distance (km) <span class="dg-req">*</span></label>' +
          '<div class="dgq-withbtn">' +
            '<input class="dg-input" type="number" min="0" step="0.1" data-f="km" placeholder="168">' +
            '<button type="button" class="dg-btn small ghost" data-lookup ' +
            'title="Work it out from the route"><i class="fa-solid fa-route"></i> Look up</button>' +
          '</div></div>' +

        '<div class="dg-field half"><label>Trip fare (LKR)</label>' +
          '<input class="dg-input" type="number" min="0" step="0.01" data-f="fare" placeholder="25000"></div>' +
      '</div>' +
    '</section>';
  }

  /* ---------------------------------------------------------
     The composer
     --------------------------------------------------------- */
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

        '<h3 class="dg-group-title">Trip details</h3>' +
        '<div id="dgqTrips"></div>' +
        '<button type="button" class="dg-btn ghost dgq-addtrip" id="dgqAddTrip">' +
          '<i class="fa-solid fa-plus"></i> Add trip</button>' +

        '<h3 class="dg-group-title">Passenger details <span class="dgq-optional">one for all trips</span></h3>' +
        '<div class="dg-grid">' +
          '<div class="dg-field half"><label for="dgqPax">No. of passengers <span class="dg-req">*</span></label>' +
            '<input id="dgqPax" class="dg-input" type="number" min="1" max="99" step="1" placeholder="2"></div>' +
          '<div class="dg-field half"><label for="dgqBags">No. of luggage</label>' +
            '<input id="dgqBags" class="dg-input" type="number" min="0" max="99" step="1" placeholder="3"></div>' +
          '<div class="dg-field"><label for="dgqRequests">Special requests</label>' +
            '<textarea id="dgqRequests" class="dg-input" rows="2" ' +
            'placeholder="Child seat, surfboard rack, early pickup…"></textarea></div>' +
        '</div>' +

        '<h3 class="dg-group-title">Vehicle details <span class="dgq-optional">one for all trips</span></h3>' +
        '<div class="dg-grid">' +
          '<div class="dg-field half"><label for="dgqVehicleSel">Vehicle type <span class="dg-req">*</span></label>' +
            '<select id="dgqVehicleSel" class="dg-input">' + vehicleOptions('') + '</select>' +
            '<input id="dgqVehicleOther" class="dg-input dgq-other" type="text" ' +
            'placeholder="Vehicle name" hidden></div>' +

          '<div class="dg-field half"><label for="dgqDriver">Driver name</label>' +
            '<input id="dgqDriver" class="dg-input" type="text" autocomplete="off" ' +
            'value="' + esc(settingText('about.name', '')) + '"></div>' +

          '<div class="dg-field half"><label for="dgqAllowance">Driver allowance (LKR)</label>' +
            '<input id="dgqAllowance" class="dg-input" type="number" min="0" step="0.01" placeholder="3000"></div>' +
        '</div>' +

        // Both totals are worked out from the trips above, so they are shown
        // rather than typed — there is nothing here for the owner to get wrong.
        '<div class="dgq-totals" id="dgqTotals">' +
          '<div><span>Total distance</span><strong data-total="km">—</strong></div>' +
          '<div><span>Total fare</span><strong data-total="fare">—</strong></div>' +
        '</div>' +

        '<div class="dg-modal-actions">' +
          '<button type="button" class="dg-btn ghost" data-close>Cancel</button>' +
          '<button type="submit" class="dg-btn primary">' +
            '<i class="fa-solid fa-print"></i> Create &amp; print</button>' +
        '</div>' +

      '</form>';
  }

  /** Which half of the dialog was last open, so Back comes back here. */
  var quoteTab = 'new';

  function openQuoteModal(tab) {
    closePanel();
    if (root.classList.contains('dg-preview')) setPreview(false);
    quoteTab = tab || quoteTab || 'new';

    var existing = document.getElementById('dgQuoteModal');
    if (existing) existing.remove();

    var isSaved = quoteTab === 'saved';

    var modal = document.createElement('div');
    modal.className = 'dg-modal';
    modal.id = 'dgQuoteModal';
    modal.innerHTML =
      '<div class="dg-modal-card wide" role="dialog" aria-modal="true" aria-label="Quotations">' +
        '<header class="dg-modal-head">' +
          '<h3><i class="fa-solid fa-file-invoice"></i> Quotations</h3>' +
          '<button type="button" class="dg-panel-close" data-close aria-label="Close">' +
            '<i class="fa-solid fa-xmark"></i></button>' +
        '</header>' +
        '<nav class="dg-tabs dgq-tabs">' +
          '<button type="button" class="dg-tab' + (isSaved ? '' : ' active') + '" ' +
            'data-quote-tab="new">New quotation</button>' +
          '<button type="button" class="dg-tab' + (isSaved ? ' active' : '') + '" ' +
            'data-quote-tab="saved">Saved quotations</button>' +
        '</nav>' +
        (isSaved ? savedTabHtml() : quoteFormHtml()) +
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

    modal.querySelectorAll('[data-quote-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var next = this.getAttribute('data-quote-tab');
        if (next !== quoteTab) openQuoteModal(next);
      });
    });

    if (isSaved) {
      wireSavedTab(modal);
    } else {
      wireQuoteForm(modal, close);
      var first = modal.querySelector('#dgqName');
      if (first) setTimeout(function () { first.focus(); }, 80);
    }
  }

  function wireQuoteForm(modal, close) {
    var form = modal.querySelector('#dgQuoteForm');
    var tripsHost = modal.querySelector('#dgqTrips');
    var vehicleSel = modal.querySelector('#dgqVehicleSel');
    var vehicleOther = modal.querySelector('#dgqVehicleOther');

    /* ---- Totals, recomputed on every keystroke that can move them ---- */
    function recalcTotals() {
      var km = 0, fare = 0, anyKm = false, anyFare = false;

      tripsHost.querySelectorAll('[data-trip]').forEach(function (card) {
        var k = card.querySelector('[data-f="km"]').value;
        var f = card.querySelector('[data-f="fare"]').value;
        if (k !== '') { km += num(k); anyKm = true; }
        if (f !== '') { fare += num(f); anyFare = true; }
      });

      var allowance = modal.querySelector('#dgqAllowance').value;
      if (allowance !== '') { fare += num(allowance); anyFare = true; }

      modal.querySelector('[data-total="km"]').textContent = anyKm ? kmText(km) : '—';
      modal.querySelector('[data-total="fare"]').textContent = anyFare ? 'LKR ' + money(fare) : '—';
    }

    /* ---- One trip card ---- */
    function renumberTrips() {
      var cards = tripsHost.querySelectorAll('[data-trip]');
      cards.forEach(function (card, i) {
        card.querySelector('.dgq-trip-n').textContent = 'Trip ' + (i + 1);
        // A single trip has nothing to remove down to, so the button goes.
        card.querySelector('[data-trip-remove]').hidden = cards.length < 2;
      });
    }

    function wireTripCard(card) {
      var stopsHost = card.querySelector('[data-stops]');
      var lookupBtn = card.querySelector('[data-lookup]');
      var kmInput = card.querySelector('[data-f="km"]');

      function stops() {
        return Array.prototype.map.call(
          stopsHost.querySelectorAll('[data-stop]'),
          function (el) { return el.value.trim(); }
        ).filter(Boolean);
      }

      function renumberStops() {
        stopsHost.querySelectorAll('.dgq-stop').forEach(function (row, i) {
          row.querySelector('.dgq-stop-n').textContent = (i + 1) + '.';
        });
      }

      function addStop(focus) {
        stopsHost.insertAdjacentHTML('beforeend', stopRowHtml(''));
        var row = stopsHost.lastElementChild;
        row.querySelector('[data-stop-remove]').addEventListener('click', function () {
          row.remove();
          renumberStops();
          refreshLookup();
        });
        renumberStops();
        if (focus) row.querySelector('[data-stop]').focus();
      }

      /** Where this trip ends: its destination or return point, else the last stop. */
      function lastPoint() {
        var isReturn = card.querySelector('[data-f="type"]:checked').value === 'return';
        var end = card.querySelector(isReturn ? '[data-f="return"]' : '[data-f="destination"]').value.trim();
        if (end) return end;
        var list = stops();
        return list.length ? list[list.length - 1] : '';
      }

      function refreshLookup() { lookupBtn.hidden = !lastPoint(); }

      card.querySelectorAll('[data-f="type"]').forEach(function (radio) {
        radio.addEventListener('change', function () {
          var type = card.querySelector('[data-f="type"]:checked').value;
          card.querySelectorAll('[data-when]').forEach(function (field) {
            field.hidden = field.getAttribute('data-when') !== type;
          });
          refreshLookup();
          var live = card.querySelector('[data-when="' + type + '"] .dg-input');
          if (live) live.focus();
        });
      });

      card.querySelector('[data-add-stop]').addEventListener('click', function () {
        addStop(true);
        refreshLookup();
      });

      card.querySelector('[data-trip-remove]').addEventListener('click', function () {
        card.remove();
        renumberTrips();
        recalcTotals();
      });

      card.addEventListener('input', function (e) {
        var f = e.target.getAttribute('data-f');
        if (f === 'km' || f === 'fare') recalcTotals();
        if (f === 'destination' || f === 'return' || e.target.hasAttribute('data-stop')) refreshLookup();
      });

      // The same lookup the booking form uses. It measures pickup to the end
      // of the route and ignores the stops between, so it fills the box
      // rather than owning it — the figure stays the owner's to correct.
      lookupBtn.addEventListener('click', function () {
        var origin = card.querySelector('[data-f="pickup"]').value.trim();
        var destination = lastPoint();
        if (origin.length < 3 || destination.length < 3) {
          toast('Fill in both ends of the route first.', 'error');
          return;
        }

        lookupBtn.disabled = true;
        var label = lookupBtn.innerHTML;
        lookupBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Looking up';

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
            kmInput.value = r.body.km;
            recalcTotals();
          })
          .catch(function (err) { toast(err.message || 'Could not look that route up.', 'error'); })
          .then(function () {
            lookupBtn.disabled = false;
            lookupBtn.innerHTML = label;
          });
      });

      refreshLookup();
    }

    function addTrip(focus) {
      tripsHost.insertAdjacentHTML('beforeend', tripCardHtml());
      var card = tripsHost.lastElementChild;
      wireTripCard(card);
      renumberTrips();
      recalcTotals();
      if (focus) {
        card.scrollIntoView({ block: 'nearest' });
        card.querySelector('[data-f="pickup"]').focus();
      }
      return card;
    }

    modal.querySelector('#dgqAddTrip').addEventListener('click', function () { addTrip(true); });
    modal.querySelector('#dgqAllowance').addEventListener('input', recalcTotals);

    vehicleSel.addEventListener('change', function () {
      var other = this.value === '__other';
      vehicleOther.hidden = !other;
      if (other) vehicleOther.focus();
    });

    // A quotation is at least one trip, so the first card is already there.
    addTrip(false);

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

  /* ---------------------------------------------------------
     Reading and validating the form
     --------------------------------------------------------- */
  /** Complains about a field, focuses it, and returns null. */
  function complain(message, el) {
    toast(message, 'error');
    if (el) {
      el.focus();
      el.classList.add('dgq-invalid');
      setTimeout(function () { el.classList.remove('dgq-invalid'); }, 1600);
      el.scrollIntoView({ block: 'center' });
    }
    return null;
  }

  /** One trip, or null if it is not usable — the message names which trip. */
  function readTrip(card, n) {
    function f(name) { return card.querySelector('[data-f="' + name + '"]'); }
    function v(name) { var el = f(name); return el ? el.value.trim() : ''; }

    var where = 'Trip ' + n + ': ';
    var type = card.querySelector('[data-f="type"]:checked').value;
    var isReturn = type === 'return';

    var pickup = v('pickup');
    if (!pickup) return complain(where + 'a pickup location is required.', f('pickup'));

    var endKey = isReturn ? 'return' : 'destination';
    var end = v(endKey);
    if (!end) {
      return complain(
        where + (isReturn ? 'a return trip needs a return location.' : 'a one-way trip needs a destination.'),
        f(endKey));
    }

    var km = v('km');
    if (km === '' || num(km) <= 0) return complain(where + 'how far is this trip, in km?', f('km'));

    var fare = v('fare');

    return {
      trip_type:        type,
      pickup_location:  pickup,
      other_locations:  Array.prototype.map.call(
                          card.querySelectorAll('[data-stop]'),
                          function (el) { return el.value.trim(); }
                        ).filter(Boolean),
      destination:      isReturn ? null : end,
      return_location:  isReturn ? end : null,
      journey_date:     v('date') || null,
      journey_time:     v('time') || null,
      distance_km:      num(km),
      fare_lkr:         fare === '' ? null : num(fare)
    };
  }

  function readQuoteForm(modal) {
    function val(id) {
      var el = modal.querySelector('#' + id);
      return el ? el.value.trim() : '';
    }

    var cards = modal.querySelectorAll('#dgqTrips [data-trip]');
    if (!cards.length) return complain('A quotation needs at least one trip.', null);

    var trips = [];
    for (var i = 0; i < cards.length; i++) {
      var trip = readTrip(cards[i], i + 1);
      if (!trip) return null;              // readTrip has already complained
      trips.push(trip);
    }

    var pax = val('dgqPax');
    if (pax === '' || num(pax) < 1) {
      return complain('How many passengers?', modal.querySelector('#dgqPax'));
    }
    var bags = val('dgqBags');

    var vehicleSel = modal.querySelector('#dgqVehicleSel');
    var vehicle = vehicleSel.value;
    if (vehicle === '__other') vehicle = val('dgqVehicleOther');
    if (!vehicle) {
      return complain('Choose a vehicle type.',
        modal.querySelector('#dgqVehicleOther').hidden ? vehicleSel : modal.querySelector('#dgqVehicleOther'));
    }

    var allowance = val('dgqAllowance');

    // Worked out here rather than read off the screen, so what is stored
    // cannot drift from what the trips actually say.
    var totalKm = trips.reduce(function (sum, t) { return sum + t.distance_km; }, 0);
    var totalFare = trips.reduce(function (sum, t) { return sum + (t.fare_lkr || 0); }, 0) +
                    (allowance === '' ? 0 : num(allowance));
    var anyFare = trips.some(function (t) { return t.fare_lkr != null; }) || allowance !== '';

    return {
      customer_name:    val('dgqName') || null,
      customer_phone:   val('dgqPhone') || null,
      customer_email:   val('dgqEmail') || null,
      trips:            trips,
      passengers:       num(pax),
      luggage:          bags === '' ? null : num(bags),
      special_requests: val('dgqRequests') || null,
      vehicle_type:     vehicle,
      driver_name:      val('dgqDriver') || null,
      driver_allowance: allowance === '' ? null : num(allowance),
      total_distance_km: Math.round(totalKm * 10) / 10,
      total_fare_lkr:   anyFare ? Math.round(totalFare * 100) / 100 : null
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
     Saved quotations — find an old one, look at it, download it
     --------------------------------------------------------- */
  var QUOTE_PAGE = 25;

  function savedTabHtml() {
    return '' +
      '<div class="dg-modal-body">' +
        '<div class="dgq-search">' +
          '<i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>' +
          '<input id="dgqSearch" class="dg-input" type="search" autocomplete="off" ' +
            'placeholder="Search by reference, customer, phone, email or vehicle">' +
        '</div>' +
        '<div id="dgqSavedList"><p class="dg-hint">Loading…</p></div>' +
      '</div>';
  }

  /** One line of summary under the customer's name. */
  function quoteSummary(row) {
    var trips = Array.isArray(row.trips) ? row.trips : [];
    return [
      stampDateTime(row.issued_at).slice(0, 10),
      trips.length > 1 ? trips.length + ' trips' : row.vehicle_type
    ].filter(Boolean).join(' · ');
  }

  function quoteRowHtml(row) {
    var trips = Array.isArray(row.trips) ? row.trips : [];
    var who = row.customer_name || (trips[0] && trips[0].pickup_location) || 'Quotation';

    return '<div class="dg-row-card">' +
             '<div class="dg-row-thumb dgq-refbox"><span class="dgq-ref">' + esc(row.ref_no) + '</span></div>' +
             '<div class="dg-row-main">' +
               '<div class="dg-row-title">' + esc(who) + '</div>' +
               '<div class="dg-row-sub">' + esc(quoteSummary(row)) + '</div>' +
             '</div>' +
             (row.total_fare_lkr == null ? '' :
               '<div class="dgq-row-total">LKR ' + esc(money(row.total_fare_lkr)) + '</div>') +
             '<div class="dg-row-tools">' +
               '<button type="button" class="dg-icon-btn" data-quote-view="' + esc(row.id) + '" ' +
                 'title="View the quotation"><i class="fa-solid fa-eye"></i></button>' +
               '<button type="button" class="dg-icon-btn" data-quote-download="' + esc(row.id) + '" ' +
                 'title="Download as PDF"><i class="fa-solid fa-download"></i></button>' +
               '<button type="button" class="dg-icon-btn danger" data-quote-delete="' + esc(row.id) + '" ' +
                 'title="Delete"><i class="fa-solid fa-trash"></i></button>' +
             '</div>' +
           '</div>';
  }

  function wireSavedTab(modal) {
    var host = modal.querySelector('#dgqSavedList');
    var search = modal.querySelector('#dgqSearch');

    var rows = [];          // everything loaded so far, in order
    var term = '';
    var loading = false;
    var exhausted = false;
    var seq = 0;            // so a slow reply cannot overwrite a newer one

    function closeModal() {
      modal.classList.remove('show');
      setTimeout(function () { modal.remove(); }, 200);
    }

    function open(id, thenPrint) {
      var row = rows.filter(function (r) { return r.id === id; })[0];
      if (!row) return;
      closeModal();
      showQuoteSheet(row, false, thenPrint);
    }

    function render() {
      if (!rows.length) {
        host.innerHTML = '<p class="dg-empty">' +
          (term
            ? 'Nothing matches “' + esc(term) + '”.'
            : 'No quotations yet. The first one you create will be REF-001.') +
          '</p>';
        return;
      }

      host.innerHTML =
        '<p class="dg-hint block">' +
          rows.length + (rows.length === 1 ? ' quotation' : ' quotations') +
          (exhausted ? '' : ' so far') +
          '. <strong>View</strong> opens the sheet; <strong>Download</strong> opens your ' +
          'print dialogue, where <em>Save as PDF</em> gives you a file to send on.' +
        '</p>' +
        '<div class="dg-list">' + rows.map(quoteRowHtml).join('') + '</div>' +
        (exhausted ? '' :
          '<button type="button" class="dg-btn ghost dgq-more" id="dgqMore">' +
            '<i class="fa-solid fa-arrow-down"></i> Load older</button>');

      host.querySelectorAll('[data-quote-view]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          open(this.getAttribute('data-quote-view'), false);
        });
      });

      host.querySelectorAll('[data-quote-download]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          open(this.getAttribute('data-quote-download'), true);
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
              load(true);
            })
            .catch(fail);
        });
      });

      var more = host.querySelector('#dgqMore');
      if (more) more.addEventListener('click', function () { load(false); });
    }

    function load(reset) {
      if (loading) return;
      loading = true;
      var mine = ++seq;

      if (reset) {
        rows = [];
        exhausted = false;
        host.innerHTML = '<p class="dg-hint">Loading…</p>';
      }

      CMS.listQuotations({ limit: QUOTE_PAGE, offset: rows.length, term: term })
        .then(function (page) {
          if (mine !== seq) return;         // a newer search already ran
          page = page || [];
          rows = rows.concat(page);
          if (page.length < QUOTE_PAGE) exhausted = true;
          render();
        })
        .catch(function (err) {
          if (mine !== seq) return;
          console.warn('[quotation]', err);
          host.innerHTML = '<p class="dg-empty">Could not load past quotations. ' +
            'Run <code>supabase/quotations-trips-migration.sql</code> if you have not yet.</p>';
        })
        .then(function () { if (mine === seq) loading = false; });
    }

    // Typing searches the server, so it waits for a pause in the typing.
    var searchTimer;
    search.addEventListener('input', function () {
      var next = this.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () {
        term = next;
        seq++;            // cancel whatever is in flight
        loading = false;
        load(true);
      }, 300);
    });

    load(true);
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

  /**
   * The short facts, three to a line. A row each reads fine on screen but
   * costs about 20mm of paper, which is the difference between one sheet
   * and two once a quotation carries more than one trip.
   */
  function factsHtml(pairs, tail) {
    var cells = pairs.filter(function (pair) {
      return pair[1] || pair[1] === 0;
    }).map(function (pair) {
      return '<div class="dgq-fact">' +
               '<div class="dgq-fact-l">' + esc(pair[0]) + '</div>' +
               '<div class="dgq-fact-v">' + esc(pair[1]) + '</div>' +
             '</div>';
    });
    if (tail) cells.push(tail);
    return cells.length ? '<div class="dgq-facts">' + cells.join('') + '</div>' : '';
  }

  /**
   * A fact that runs long, sharing the row with the short ones rather
   * than taking a line to itself. `span` is how many grid tracks it eats.
   */
  function wideFactHtml(label, value, span) {
    if (!value) return '';
    return '<div class="dgq-fact dgq-fact-wide" style="grid-column: span ' + span + '">' +
             '<div class="dgq-fact-l">' + esc(label) + '</div>' +
             '<div class="dgq-fact-v dgq-fact-text">' + esc(value) + '</div>' +
           '</div>';
  }

  /** One trip on the sheet: a titled block with its own fare on the right. */
  /** A label/value pair on a trip card's route list. */
  function routeRow(label, value) {
    if (!value) return '';
    return '<div class="dgq-rrow">' +
             '<span class="dgq-rrow-l">' + esc(label) + '</span>' +
             '<span class="dgq-rrow-v">' + esc(value) + '</span>' +
           '</div>';
  }

  /** The stops, numbered, sharing one row rather than taking one each. */
  function stopsRoutRow(list) {
    if (!Array.isArray(list) || !list.length) return '';
    return '<div class="dgq-rrow">' +
             '<span class="dgq-rrow-l">Via</span>' +
             '<span class="dgq-rrow-v">' +
               '<ol class="dgq-stoplist">' +
                 list.map(function (stop) { return '<li>' + esc(stop) + '</li>'; }).join('') +
               '</ol>' +
             '</span>' +
           '</div>';
  }

  /**
   * One trip, as a card: what it costs at the top right, where it goes
   * down the left, how far and when down the right.
   */
  function tripBlockHtml(trip, n) {
    var isReturn = trip.trip_type === 'return';

    var route =
      routeRow('Pickup', trip.pickup_location) +
      stopsRoutRow(trip.other_locations) +
      routeRow(isReturn ? 'Return to' : 'Destination',
               isReturn ? trip.return_location : trip.destination);

    var when = [readableDate(trip.journey_date), readableTime(trip.journey_time)]
      .filter(Boolean).join(' · ');

    return '<section class="dgq-trip-card">' +
             '<header class="dgq-trip-head">' +
               '<span class="dgq-trip-tag">Trip ' + n + '</span>' +
               '<span class="dgq-trip-kind">' + (isReturn ? 'Return trip' : 'One way') + '</span>' +
               (trip.fare_lkr == null ? '' :
                 '<span class="dgq-trip-fare">LKR ' + esc(money(trip.fare_lkr)) + '</span>') +
             '</header>' +
             '<div class="dgq-trip-body">' +
               '<div class="dgq-trip-route">' + route + '</div>' +
               '<div class="dgq-trip-side">' +
                 (trip.distance_km == null ? '' :
                   '<div class="dgq-trip-km">' + esc(kmText(trip.distance_km)) + '</div>' +
                   '<div class="dgq-trip-kml">Distance</div>') +
                 (when ? '<div class="dgq-trip-when">' + esc(when) + '</div>' : '') +
               '</div>' +
             '</div>' +
           '</section>';
  }

  function quoteSheetHtml(q, unsaved) {
    var head = letterhead();
    var trips = Array.isArray(q.trips) ? q.trips : [];

    // Small counts read better as pills than as another labelled column.
    var pills = [
      q.passengers == null ? '' : q.passengers + (q.passengers === 1 ? ' passenger' : ' passengers'),
      q.luggage == null ? '' : q.luggage + (q.luggage === 1 ? ' bag' : ' bags')
    ].filter(Boolean);

    var who = [q.customer_phone, q.customer_email].filter(Boolean);

    var preparedFor = (q.customer_name || who.length)
      ? '<div class="dgq-party">' +
          '<div class="dgq-fact-l">Prepared for</div>' +
          '<div class="dgq-party-name">' + esc(q.customer_name || 'Guest') + '</div>' +
          who.map(function (line) {
            return '<div class="dgq-party-line">' + esc(line) + '</div>';
          }).join('') +
        '</div>'
      : '';

    var service = factsHtml([
      ['Vehicle', q.vehicle_type],
      ['Driver', q.driver_name],
      ['Total distance', kmText(q.total_distance_km)],
      ['Allowance', q.driver_allowance == null ? '' : 'LKR ' + money(q.driver_allowance)]
    ], wideFactHtml('Special requests', q.special_requests, 2));

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

        // Who it is for on the left, what it is on the right.
        '<section class="dgq-parties' + (preparedFor ? '' : ' solo') + '">' +
          preparedFor +
          '<div class="dgq-party dgq-party-ref">' +
            '<div class="dgq-fact-l">Reference</div>' +
            '<div class="dgq-party-name">' + esc(q.ref_no) + '</div>' +
            '<div class="dgq-party-line">' + esc(stampDateTime(q.issued_at)) + '</div>' +
            (pills.length
              ? '<div class="dgq-pills">' + pills.map(function (p) {
                  return '<span class="dgq-pill">' + esc(p) + '</span>';
                }).join('') + '</div>'
              : '') +
          '</div>' +
        '</section>' +

        (unsaved ? '<p class="dgq-warn">Not recorded — this reference number is temporary.</p>' : '') +

        trips.map(function (trip, i) { return tripBlockHtml(trip, i + 1); }).join('') +

        (service
          ? '<section class="dgq-block dgq-service">' +
              '<h2>Service details</h2>' + service +
            '</section>'
          : '') +

        // The total, the terms and the signature close the document
        // together. Wrapped so a page break moves all three: a page
        // carrying nothing but a signature reads as a mistake.
        '<div class="dgq-close">' +
          (q.total_fare_lkr == null
            ? ''
            : '<div class="dgq-fare">' +
                '<span>Total fare</span>' +
                '<strong>LKR ' + esc(money(q.total_fare_lkr)) + '</strong>' +
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
        '</div>' +

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

  /**
   * @param unsaved   mark the sheet as not recorded
   * @param autoPrint open the print dialogue as soon as it has been laid out
   */
  function showQuoteSheet(q, unsaved, autoPrint) {
    var host = sheetHost();
    host.innerHTML =
      '<div class="dgq-toolbar">' +
        '<button type="button" class="dg-bar-btn" id="dgqBack">' +
          '<i class="fa-solid fa-arrow-left"></i> Back</button>' +
        '<span class="dgq-toolbar-ref">' + esc(q.ref_no) + '</span>' +
        '<button type="button" class="dg-bar-btn primary" id="dgqPrint">' +
          '<i class="fa-solid fa-print"></i> Print / Save as PDF</button>' +
      '</div>' +
      // The sheet asks the page for margins so a second page keeps them,
      // and that same space is where the browser prints its own date and
      // page title. Turning them off is a setting the browser remembers.
      '<p class="dgq-tip">In the print dialogue set the paper to <strong>A4</strong> and turn ' +
        '<strong>Headers and footers</strong> off, so the browser does not print its own ' +
        'date and page title across your letterhead. Your browser remembers it.</p>' +
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

    // Downloading is the same dialogue, reached without a second click.
    // It waits for the fonts so the sheet is measured before it is sent.
    if (autoPrint) {
      var ready = (document.fonts && document.fonts.ready) || Promise.resolve();
      ready.then(function () {
        setTimeout(function () { fitSheet(); window.print(); }, 60);
      });
    }
  }

  function hideQuoteSheet() {
    root.classList.remove('dg-quoting');
    var host = document.getElementById('dgQuoteSheetHost');
    if (host) host.innerHTML = '';
    openQuoteModal();           // reopens on whichever tab it came from
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
