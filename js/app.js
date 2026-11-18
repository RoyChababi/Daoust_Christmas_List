(function () {
  'use strict';

  const { t } = window.I18N;
  const Api = window.Api;
  const Excel = window.Excel;
  const Clean = Excel.Clean;

  const LS = { session: 'xmas.session', passcode: 'xmas.passcode', hideClaimed: 'xmas.hideClaimed' };
  const root = document.getElementById('app');

  // ------------------------------------------------------------------
  // Small helpers
  // ------------------------------------------------------------------

  function store(key, val) {
    try {
      if (val == null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(val));
    } catch (e) { /* storage blocked: app still works for this visit */ }
  }
  function load(key) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch (e) { return null; }
  }

  // el('div', {class: 'x', onclick: fn}, child, 'text', [more])
  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class') n.className = v;
        else if (k === 'text') n.textContent = v;
        else if (k === 'value') n.value = v;
        else if (k === 'checked') n.checked = !!v;
        else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
        else if (v === true) n.setAttribute(k, '');
        else n.setAttribute(k, String(v));
      }
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      n.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return n;
  }

  const money = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' });
  const fmtPrice = (p) => (p == null || p === '' ? null : money.format(Number(p)));

  function errMsg(err) {
    const code = (err && err.code) || 'E_UNKNOWN';
    const vars = Object.assign({ next: new Date().getFullYear() + 1 }, (err && err.data) || {});
    const msg = t('errors.' + code, vars);
    return msg === 'errors.' + code ? t('errors.E_UNKNOWN') : msg;
  }

  // Run an action with a busy button and friendly errors. Returns the result or undefined.
  async function act(button, fn) {
    if (button) { button.disabled = true; button.classList.add('busy'); }
    try {
      return await fn();
    } catch (err) {
      if (err && err.code === 'E_SESSION') { forceLogout(); return undefined; }
      toast(errMsg(err), 'error');
      return undefined;
    } finally {
      if (button) { button.disabled = false; button.classList.remove('busy'); }
    }
  }

  // ------------------------------------------------------------------
  // Toast + modal
  // ------------------------------------------------------------------

  let toastTimer = null;
  function toast(msg, kind) {
    let box = document.getElementById('toast');
    if (!box) {
      box = el('div', { id: 'toast', role: 'status', 'aria-live': 'polite' });
      document.body.append(box);
    }
    box.textContent = msg;
    box.className = 'toast show ' + (kind || 'ok');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { box.className = 'toast'; }, kind === 'error' ? 6000 : 3000);
  }

  function hideToast() {
    const box = document.getElementById('toast');
    if (box) box.className = 'toast';
  }

  function openModal({ title, body, actions }) {
    const prevFocus = document.activeElement;
    const overlay = el('div', { class: 'modal-overlay' });
    const panel = el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
    const close = () => {
      overlay.remove();
      document.body.classList.remove('no-scroll');
      if (prevFocus && prevFocus.focus) prevFocus.focus();
    };
    const footer = el('div', { class: 'modal-actions' },
      (actions || []).map((a) => el('button', {
        type: a.submit ? 'submit' : 'button',
        class: 'btn ' + (a.kind || 'secondary'),
        onclick: a.submit ? null : (e) => a.onClick(e, close),
        text: a.label,
      })));
    const form = el('form', { novalidate: true, onsubmit: (e) => {
      e.preventDefault();
      const submit = (actions || []).find((a) => a.submit);
      if (submit) submit.onClick(e, close, footer.querySelector('button[type=submit]'));
    } }, el('h2', { text: title }), body, footer);
    panel.append(form);
    overlay.append(panel);
    overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    document.body.append(overlay);
    document.body.classList.add('no-scroll');
    const firstInput = panel.querySelector('input:not([type=checkbox]), select, textarea');
    (firstInput || panel.querySelector('button')).focus();
    return close;
  }

  function confirmBox(message, { okLabel, danger, typeWord } = {}) {
    return new Promise((resolve) => {
      const input = typeWord ? el('input', { type: 'text', autocomplete: 'off', autocapitalize: 'characters' }) : null;
      openModal({
        title: t('confirm'),
        body: el('div', null, el('p', { text: message }), input),
        actions: [
          { label: t('cancel'), onClick: (e, close) => { close(); resolve(false); } },
          { label: okLabel || t('yes'), kind: danger ? 'danger' : 'primary', submit: true,
            onClick: (e, close) => {
              if (typeWord && input.value.trim().toUpperCase() !== typeWord) { input.focus(); return; }
              close(); resolve(true);
            } },
        ],
      });
    });
  }

  // ------------------------------------------------------------------
  // Session
  // ------------------------------------------------------------------

  let session = load(LS.session); // { token, member: {id, name, is_admin} }
  if (session) Api.setToken(session.token);

  function saveSession(s) {
    session = s;
    store(LS.session, s);
    Api.setToken(s ? s.token : null);
  }

  async function switchUser() {
    await Api.logout();
    saveSession(null);
    location.hash = '';
    render();
  }

  function forceLogout() {
    saveSession(null);
    location.hash = '';
    render().then(() => toast(t('errors.E_SESSION'), 'error'));
  }

  // ------------------------------------------------------------------
  // Login screens
  // ------------------------------------------------------------------

  function loginShell(...content) {
    root.replaceChildren(el('div', { class: 'login' },
      el('div', { class: 'login-brand' },
        el('div', { class: 'login-tree', 'aria-hidden': 'true', text: '🎄' }),
        el('h1', { text: t('appTitle') })),
      el('div', { class: 'card login-card' }, content)));
  }

  async function renderLogin() {
    const passcode = load(LS.passcode);
    if (passcode) {
      loginShell(el('p', { class: 'muted center', text: t('loading') }));
      try {
        const members = await Api.listMembers(passcode);
        return renderPickName(passcode, members);
      } catch (err) {
        if (err.code === 'E_BAD_PASSCODE') store(LS.passcode, null);
        else return renderPasscode(errMsg(err));
      }
    }
    renderPasscode();
  }

  function renderPasscode(errorText) {
    const input = el('input', { type: 'text', id: 'passcode', autocomplete: 'off', autocapitalize: 'none',
                                autocorrect: 'off', spellcheck: 'false', required: true });
    const error = el('p', { class: 'form-error', role: 'alert', text: errorText || '' });
    const button = el('button', { type: 'submit', class: 'btn primary block', text: t('passcodeButton') });
    const form = el('form', { onsubmit: async (e) => {
      e.preventDefault();
      const code = input.value.trim();
      if (!code) { input.focus(); return; }
      error.textContent = '';
      button.disabled = true;
      try {
        const members = await Api.listMembers(code);
        store(LS.passcode, code);
        renderPickName(code, members);
      } catch (err) {
        error.textContent = errMsg(err);
        button.disabled = false;
        input.select();
      }
    } },
      el('h2', { text: t('passcodeTitle') }),
      el('p', { text: t('passcodeIntro') }),
      el('label', { for: 'passcode', text: t('passcodeLabel') }), input,
      error, button);
    loginShell(form);
    input.focus();
  }

  function pinInput(id) {
    return el('input', { type: 'password', id, inputmode: 'numeric', pattern: '[0-9]*', maxlength: '4',
                         autocomplete: 'off', class: 'pin' });
  }

  function renderPickName(passcode, members) {
    const select = el('select', { id: 'who' },
      el('option', { value: '', text: t('whoPlaceholder') }),
      members.map((m) => el('option', { value: String(m.id), text: m.name })));
    const pinArea = el('div');
    const error = el('p', { class: 'form-error', role: 'alert' });
    const button = el('button', { type: 'submit', class: 'btn primary block', text: t('loginButton') });
    let pin, pin2;

    const current = () => members.find((m) => String(m.id) === select.value);

    function updatePinArea() {
      error.textContent = '';
      const m = current();
      pin = pin2 = null;
      if (!m) { pinArea.replaceChildren(); button.textContent = t('loginButton'); return; }
      if (m.has_pin) {
        pin = pinInput('pin');
        pinArea.replaceChildren(el('label', { for: 'pin', text: t('pinLabel') }), pin,
          el('p', { class: 'muted small', text: t('forgotPin') }));
        button.textContent = t('loginButton');
      } else {
        pin = pinInput('pin');
        pin2 = pinInput('pin2');
        pinArea.replaceChildren(
          el('p', { class: 'note', text: t('pinNewIntro') }),
          el('label', { for: 'pin', text: t('pinNewLabel') }), pin,
          el('label', { for: 'pin2', text: t('pinConfirmLabel') }), pin2);
        button.textContent = t('setPinButton');
      }
      pin.focus();
    }
    select.addEventListener('change', updatePinArea);

    const form = el('form', { onsubmit: async (e) => {
      e.preventDefault();
      error.textContent = '';
      const m = current();
      if (!m) { error.textContent = t('pickNameFirst'); select.focus(); return; }
      const p = (pin.value || '').trim();
      if (!/^\d{4}$/.test(p)) { error.textContent = t('pinMustBe4'); pin.focus(); return; }
      if (pin2 && pin2.value.trim() !== p) { error.textContent = t('pinMismatch'); pin2.value = ''; pin2.focus(); return; }
      button.disabled = true;
      try {
        const s = m.has_pin ? await Api.login(passcode, m.id, p) : await Api.setPin(passcode, m.id, p);
        saveSession(s);
        location.hash = '#/list';
        render();
      } catch (err) {
        button.disabled = false;
        if (err.code === 'E_BAD_PASSCODE') { store(LS.passcode, null); return renderPasscode(errMsg(err)); }
        if (err.code === 'E_BAD_PIN') error.textContent = t('badPinLeft', { n: err.data.attempts_left });
        else error.textContent = errMsg(err);
        if (err.code === 'E_PIN_ALREADY_SET' || err.code === 'E_NO_PIN' || err.code === 'E_NO_MEMBER') {
          // Someone else changed things in the meantime: refresh the names.
          try { members = await Api.listMembers(passcode); } catch (e2) { /* keep old list */ }
          const keep = select.value;
          select.replaceChildren(el('option', { value: '', text: t('whoPlaceholder') }),
            ...members.map((mm) => el('option', { value: String(mm.id), text: mm.name })));
          select.value = keep;
          const msg = error.textContent;
          updatePinArea();
          error.textContent = msg;
        } else {
          pin.value = '';
          if (pin2) pin2.value = '';
          pin.focus();
        }
      }
    } },
      el('h2', { text: t('whoTitle') }),
      el('label', { for: 'who', text: t('whoLabel') }), select,
      pinArea, error, button,
      el('button', { type: 'button', class: 'link-btn', text: t('differentPasscode'),
                     onclick: () => { store(LS.passcode, null); renderPasscode(); } }));
    loginShell(form);
    select.focus();
  }

  // ------------------------------------------------------------------
  // App shell + routing
  // ------------------------------------------------------------------

  const ROUTES = [
    { hash: '#/list', label: 'navMyList', icon: '📝', view: viewMyList },
    { hash: '#/family', label: 'navFamily', icon: '🎁', view: viewFamily },
    { hash: '#/claims', label: 'navClaims', icon: '🛍️', view: viewClaims },
    { hash: '#/admin', label: 'navAdmin', icon: '⚙️', view: viewAdmin, admin: true },
  ];

  function renderShell(activeHash) {
    const langToggle = window.I18N.AVAILABLE.length > 1
      ? el('button', { class: 'btn ghost small', onclick: () => {
          const list = window.I18N.AVAILABLE;
          window.I18N.setLang(list[(list.indexOf(window.I18N.lang) + 1) % list.length]);
          render();
        }, text: window.I18N.AVAILABLE.find((l) => l !== window.I18N.lang).toUpperCase() })
      : null;

    const header = el('header', { class: 'top' },
      el('div', { class: 'top-inner' },
        el('div', { class: 'brand' }, el('span', { 'aria-hidden': 'true', text: '🎄 ' }), t('appTitle')),
        el('div', { class: 'who' },
          el('span', { class: 'hello', text: t('hello', { name: session.member.name }) }),
          langToggle,
          el('button', { class: 'btn ghost small', onclick: switchUser, text: t('switchUser') }))));

    const nav = el('nav', { class: 'tabs', 'aria-label': 'Main' },
      ROUTES.filter((r) => !r.admin || session.member.is_admin).map((r) =>
        el('a', { href: r.hash, class: 'tab' + (r.hash === activeHash ? ' active' : ''),
                  'aria-current': r.hash === activeHash ? 'page' : null },
          el('span', { class: 'tab-icon', 'aria-hidden': 'true', text: r.icon }),
          el('span', { class: 'tab-label', text: t(r.label) }))));

    const main = el('main', { id: 'main' });
    root.replaceChildren(header, main, nav);
    return main;
  }

  function loadingInto(main) {
    main.replaceChildren(el('p', { class: 'muted center pad', text: t('loading') }));
  }

  function errorInto(main, err, retry) {
    if (err && err.code === 'E_SESSION') return forceLogout();
    main.replaceChildren(el('div', { class: 'card center' },
      el('p', { text: errMsg(err) }),
      el('button', { class: 'btn primary', onclick: retry, text: t('tryAgain') })));
  }

  let renderSeq = 0;
  async function render() {
    const seq = ++renderSeq;
    if (!session) return renderLogin();
    let hash = location.hash || '#/list';
    let route = ROUTES.find((r) => hash === r.hash || hash.startsWith(r.hash + '/'));
    if (!route || (route.admin && !session.member.is_admin)) { hash = '#/list'; route = ROUTES[0]; }
    const main = renderShell(route.hash);
    const param = hash.slice(route.hash.length + 1) || null;
    loadingInto(main);
    const stillCurrent = () => seq === renderSeq;
    try {
      await route.view(main, param, stillCurrent);
    } catch (err) {
      if (stillCurrent()) errorInto(main, err, render);
    }
  }

  window.addEventListener('hashchange', () => { window.scrollTo(0, 0); render(); });

  // ------------------------------------------------------------------
  // Shared item display
  // ------------------------------------------------------------------

  function priorityBadge(p) {
    if (!p) return null;
    const label = { high: t('priorityHigh'), medium: t('priorityMedium'), low: t('priorityLow') }[p];
    return el('span', { class: 'badge prio-' + p, text: label });
  }

  function itemBody(item, { struck } = {}) {
    const href = Excel.safeHref(item.link);
    const meta = [fmtPrice(item.price), item.size_color].filter(Boolean);
    return el('div', { class: 'item-body' },
      el('div', { class: 'item-title-row' },
        el('h3', { class: 'item-title' + (struck ? ' struck' : ''), text: item.name }),
        priorityBadge(item.priority)),
      meta.length ? el('p', { class: 'item-meta', text: meta.join(' · ') }) : null,
      item.notes ? el('p', { class: 'item-notes', text: item.notes }) : null,
      href ? el('a', { class: 'item-link', href, target: '_blank', rel: 'noopener noreferrer', text: t('viewLink') }) : null);
  }

  // ------------------------------------------------------------------
  // My List
  // ------------------------------------------------------------------

  async function viewMyList(main, _param, stillCurrent) {
    const items = await Api.getMyList();
    if (!stillCurrent()) return;
    drawMyList(main, items);
  }

  function drawMyList(main, items) {
    const fileInput = el('input', { type: 'file', accept: '.xlsx,.xls,.csv', class: 'visually-hidden', id: 'upload' });
    fileInput.addEventListener('change', () => {
      const f = fileInput.files && fileInput.files[0];
      fileInput.value = '';
      if (f) startUpload(main, items, f);
    });

    const downloadBtn = el('button', { class: 'btn secondary', text: t('downloadExcel') });
    downloadBtn.addEventListener('click', () => act(downloadBtn, () => Excel.downloadTemplate(items, session.member.name)));

    main.replaceChildren(
      el('section', { class: 'page-head' },
        el('h1', { text: t('myListTitle') }),
        el('p', { class: 'muted', text: t('myListIntro') })),
      el('div', { class: 'actions-row' },
        el('button', { class: 'btn primary', onclick: () => itemForm(main, null), text: t('addItem') })),
      items.length
        ? el('ul', { class: 'item-list' }, items.map((item) => el('li', { class: 'card item' },
            itemBody(item),
            el('div', { class: 'item-actions' },
              el('button', { class: 'btn secondary small', onclick: () => itemForm(main, item), text: t('edit') }),
              el('button', { class: 'btn ghost small danger-text', text: t('delete'),
                onclick: async (e) => {
                  const btn = e.currentTarget;
                  if (!(await confirmBox(t('deleteItemConfirm', { name: item.name }), { okLabel: t('delete'), danger: true }))) return;
                  const list = await act(btn, () => Api.deleteItem(item.id));
                  if (list) { drawMyList(main, list); toast(t('itemDeleted')); }
                } })))))
        : el('div', { class: 'card empty', text: t('emptyMyList') }),
      el('section', { class: 'card excel-box' },
        el('p', { class: 'muted small', text: t('excelHelp') }),
        el('div', { class: 'actions-row' },
          downloadBtn,
          el('label', { class: 'btn secondary', for: 'upload', tabindex: '0', role: 'button', text: t('uploadExcel'),
                        onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } } }),
          fileInput)));
  }

  function itemForm(main, item) {
    const v = item || {};
    const f = {
      name: el('input', { type: 'text', id: 'f-name', maxlength: '200', value: v.name || '', required: true }),
      link: el('input', { type: 'url', id: 'f-link', inputmode: 'url', maxlength: '2000', value: v.link || '',
                          placeholder: 'https://', autocapitalize: 'none', autocorrect: 'off' }),
      price: el('input', { type: 'text', id: 'f-price', inputmode: 'decimal', value: v.price == null ? '' : String(v.price) }),
      size_color: el('input', { type: 'text', id: 'f-size', maxlength: '200', value: v.size_color || '' }),
      priority: el('select', { id: 'f-prio' },
        ['', 'high', 'medium', 'low'].map((p) => el('option', { value: p,
          text: p ? t('priority' + p[0].toUpperCase() + p.slice(1)) : t('priorityNone') }))),
      notes: el('textarea', { id: 'f-notes', rows: '3', maxlength: '1000' }),
    };
    f.priority.value = v.priority || '';
    f.notes.value = v.notes || '';
    const error = el('p', { class: 'form-error', role: 'alert' });
    const field = (id, label, input, hint) => el('div', { class: 'field' },
      el('label', { for: id, text: label }), input, hint ? el('p', { class: 'muted small', text: hint }) : null);

    openModal({
      title: item ? t('editItemTitle') : t('addItemTitle'),
      body: el('div', null,
        field('f-name', t('fItem'), f.name, t('fItemHint')),
        field('f-link', t('fLink'), f.link, t('fLinkHint')),
        el('div', { class: 'field-row' },
          field('f-price', t('fPrice'), f.price),
          field('f-prio', t('fPriority'), f.priority)),
        field('f-size', t('fSizeColor'), f.size_color),
        field('f-notes', t('fNotes'), f.notes),
        error),
      actions: [
        { label: t('cancel'), onClick: (e, close) => close() },
        { label: t('save'), kind: 'primary', submit: true, onClick: async (e, close, btn) => {
          const data = Clean.item({
            name: f.name.value, link: f.link.value, price: f.price.value,
            size_color: f.size_color.value, priority: f.priority.value, notes: f.notes.value,
          });
          if (!data.name) { error.textContent = t('errors.E_NAME_REQUIRED'); f.name.focus(); return; }
          error.textContent = '';
          if (btn) btn.disabled = true;
          try {
            const list = item ? await Api.updateItem(item.id, data) : await Api.addItem(data);
            close();
            drawMyList(main, list);
            toast(item ? t('itemSaved') : t('itemAdded'));
          } catch (err) {
            if (btn) btn.disabled = false;
            if (err.code === 'E_SESSION') { close(); return forceLogout(); }
            error.textContent = errMsg(err);
            if (err.code === 'E_NOT_FOUND') { close(); render(); toast(errMsg(err), 'error'); }
          }
        } },
      ],
    });
  }

  async function startUpload(main, current, file) {
    toast(t('uploadReading'));
    let parsed;
    try {
      parsed = await Excel.parseFile(file);
    } catch (err) {
      toast(errMsg(err), 'error');
      return;
    }
    hideToast();
    const d = Excel.diff(current, parsed.rows);
    const section = (label, list) => list.length
      ? el('details', { class: 'diff' },
          el('summary', { text: `${label} (${list.length})` }),
          el('ul', null, list.map((i) => el('li', { text: i.name }))))
      : null;

    const nothing = !d.added.length && !d.updated.length && !d.removed.length;
    openModal({
      title: t('uploadPreviewTitle'),
      body: el('div', null,
        el('p', { class: 'diff-summary', text: t('uploadPreviewSummary',
          { added: d.added.length, updated: d.updated.length, removed: d.removed.length }) }),
        d.unchanged ? el('p', { class: 'muted small', text: t('uploadUnchanged', { n: d.unchanged }) }) : null,
        parsed.skipped ? el('p', { class: 'note', text: t(parsed.skipped === 1 ? 'uploadSkippedOne' : 'uploadSkipped', { n: parsed.skipped }) }) : null,
        !parsed.rows.length && current.length ? el('p', { class: 'note warn', text: t('uploadAllRemovedWarn') }) : null,
        nothing ? el('p', { class: 'muted', text: t('uploadNothing') }) : null,
        section(t('uploadNew'), d.added),
        section(t('uploadUpdated'), d.updated),
        section(t('uploadRemoved'), d.removed)),
      actions: nothing
        ? [{ label: t('close'), kind: 'primary', submit: true, onClick: (e, close) => close() }]
        : [
            { label: t('cancel'), onClick: (e, close) => close() },
            { label: t('uploadConfirm'), kind: 'primary', submit: true, onClick: async (e, close, btn) => {
              const list = await act(btn, () => Api.upsertMyList(parsed.rows));
              if (list) { close(); drawMyList(main, list); toast(t('uploadDone')); }
            } },
          ],
    });
  }

  // ------------------------------------------------------------------
  // Family
  // ------------------------------------------------------------------

  async function viewFamily(main, param, stillCurrent) {
    if (param) return viewPerson(main, Number(param), stillCurrent);
    const members = await Api.getMembers();
    if (!stillCurrent()) return;
    const countText = (n) => (n === 0 ? t('itemCountZero') : n === 1 ? t('itemCountOne') : t('itemCount', { n }));
    main.replaceChildren(
      el('section', { class: 'page-head' },
        el('h1', { text: t('familyTitle') }),
        el('p', { class: 'muted', text: t('familyIntro') })),
      members.length
        ? el('div', { class: 'people-grid' }, members.map((m) =>
            el('a', { class: 'card person', href: '#/family/' + m.id },
              el('span', { class: 'avatar', 'aria-hidden': 'true', text: (m.name.trim()[0] || '?').toUpperCase() }),
              el('span', { class: 'person-name', text: m.name }),
              el('span', { class: 'person-meta', text: countText(m.item_count) +
                (m.claimed_count ? ' · ' + t('claimedCount', { n: m.claimed_count }) : '') }))))
        : el('div', { class: 'card empty', text: t('familyEmpty') }));
  }

  async function viewPerson(main, memberId, stillCurrent) {
    if (memberId === session.member.id) { location.hash = '#/list'; return; }
    const data = await Api.getFamilyList(memberId);
    if (!stillCurrent()) return;
    drawPerson(main, data);
  }

  function drawPerson(main, data) {
    const hide = !!load(LS.hideClaimed);
    const reload = async () => {
      try { drawPerson(main, await Api.getFamilyList(data.member.id)); }
      catch (err) { errorInto(main, err, render); }
    };
    const ownerName = data.member.name;
    const visible = data.items.filter((i) => !hide || !i.claimed || i.removed);

    const toggle = el('label', { class: 'switch' },
      el('input', { type: 'checkbox', checked: hide, onchange: (e) => { store(LS.hideClaimed, e.target.checked); drawPerson(main, data); } }),
      el('span', { class: 'switch-track', 'aria-hidden': 'true' }),
      el('span', { text: t('hideClaimed') }));

    function statusArea(item) {
      if (item.removed) {
        return el('div', { class: 'status removed' },
          el('p', { text: t('removedAfterClaim', { name: ownerName }) }),
          el('button', { class: 'btn secondary', text: t('unclaim'), onclick: (e) => doUnclaim(e.currentTarget, item) }));
      }
      if (item.claimed_by_me) {
        return el('div', { class: 'status mine' },
          el('span', { class: 'status-label', text: '✓ ' + t('youClaimed') }),
          el('button', { class: 'btn secondary', text: t('unclaim'), onclick: (e) => doUnclaim(e.currentTarget, item) }));
      }
      if (item.claimed) {
        return el('div', { class: 'status taken' },
          el('span', { class: 'status-label', text: t('claimedBy', { name: item.claimer_name }) }),
          session.member.is_admin
            ? el('button', { class: 'btn ghost small', text: t('adminClearClaim'), onclick: async (e) => {
                const btn = e.currentTarget;
                if (!(await confirmBox(t('adminClearClaimConfirm', { item: item.name }), { danger: true }))) return;
                if (await act(btn, () => Api.adminClearClaim(item.id))) { toast(t('claimCleared')); reload(); }
              } })
            : null);
      }
      return el('div', { class: 'status open' },
        el('button', { class: 'btn primary claim-btn', text: '🎁 ' + t('claim'), onclick: (e) => doClaim(e.currentTarget, item) }));
    }

    async function doClaim(btn, item) {
      btn.disabled = true;
      try {
        await Api.claimItem(item.id);
        toast(t('claimedToast'));
      } catch (err) {
        if (err.code === 'E_SESSION') return forceLogout();
        if (err.code === 'E_ALREADY_CLAIMED') {
          toast(err.data.claimed_by_me ? t('alreadyClaimedByYou') : t('alreadyClaimed', { name: err.data.claimer_name }), 'error');
        } else {
          toast(errMsg(err), 'error');
        }
      }
      reload();
    }

    async function doUnclaim(btn, item) {
      if (await act(btn, () => Api.unclaimItem(item.id))) toast(t('unclaimedToast'));
      reload();
    }

    let listNode;
    if (!data.items.length) listNode = el('div', { class: 'card empty', text: t('emptyFamilyList', { name: ownerName }) });
    else if (!visible.length) listNode = el('div', { class: 'card empty', text: t('allClaimedHidden') });
    else {
      listNode = el('ul', { class: 'item-list' }, visible.map((item) =>
        el('li', { class: 'card item' + (item.claimed && !item.claimed_by_me ? ' is-taken' : '') + (item.removed ? ' is-removed' : '') },
          itemBody(item, { struck: (item.claimed && !item.claimed_by_me) || item.removed }),
          statusArea(item))));
    }

    main.replaceChildren(
      el('a', { class: 'back-link', href: '#/family', text: t('everyone') }),
      el('section', { class: 'page-head' }, el('h1', { text: t('listOf', { name: ownerName }) }), toggle),
      listNode);
  }

  // ------------------------------------------------------------------
  // My Claims
  // ------------------------------------------------------------------

  async function viewClaims(main, _param, stillCurrent) {
    const claims = await Api.getMyClaims();
    if (!stillCurrent()) return;
    drawClaims(main, claims);
  }

  function drawClaims(main, claims) {
    const head = el('section', { class: 'page-head' },
      el('h1', { text: t('claimsTitle') }),
      el('p', { class: 'muted', text: t('claimsIntro') }));
    if (!claims.length) {
      main.replaceChildren(head, el('div', { class: 'card empty' }, t('claimsEmpty'), ' ',
        el('a', { href: '#/family', text: t('navFamily') + ' →' })));
      return;
    }
    const total = claims.reduce((s, c) => s + (c.price == null ? 0 : Number(c.price)), 0);
    const bought = claims.filter((c) => c.bought).length;
    const groups = new Map();
    for (const c of claims) {
      if (!groups.has(c.owner_id)) groups.set(c.owner_id, { name: c.owner_name, items: [] });
      groups.get(c.owner_id).items.push(c);
    }

    main.replaceChildren(head,
      el('p', { class: 'claims-summary' },
        t(claims.length === 1 ? 'claimsSummaryOne' : 'claimsSummary', { n: claims.length, bought }),
        total ? ' · ' + t('claimsTotal', { total: fmtPrice(total) }) : ''),
      ...[...groups.values()].map((g) => {
        const sub = g.items.reduce((s, c) => s + (c.price == null ? 0 : Number(c.price)), 0);
        return el('section', { class: 'claim-group' },
          el('h2', null, t('forName', { name: g.name }), sub ? el('span', { class: 'muted small', text: ' · ' + fmtPrice(sub) }) : null),
          el('ul', { class: 'item-list' }, g.items.map((c) => {
            const box = el('input', { type: 'checkbox', id: 'b-' + c.claim_id, checked: c.bought });
            box.addEventListener('change', async () => {
              const want = box.checked;
              box.disabled = true;
              const ok = await act(null, () => Api.setBought(c.claim_id, want));
              box.disabled = false;
              if (ok) { c.bought = want; drawClaims(main, claims); }
              else box.checked = !want;
            });
            return el('li', { class: 'card item' + (c.bought ? ' is-bought' : '') + (c.removed ? ' is-removed' : '') },
              itemBody(c, { struck: c.removed }),
              c.removed ? el('p', { class: 'note warn', text: t('removedAfterClaim', { name: g.name }) }) : null,
              el('div', { class: 'item-actions' },
                el('label', { class: 'check', for: 'b-' + c.claim_id }, box, el('span', { text: t('bought') })),
                el('button', { class: 'btn ghost small', text: t('unclaim'), onclick: async (e) => {
                  if (await act(e.currentTarget, () => Api.unclaimItem(c.item_id))) {
                    toast(t('unclaimedToast'));
                    drawClaims(main, claims.filter((x) => x !== c));
                  }
                } })));
          })));
      }));
  }

  // ------------------------------------------------------------------
  // Admin
  // ------------------------------------------------------------------

  async function viewAdmin(main, _param, stillCurrent) {
    const data = await Api.adminListMembers();
    if (!stillCurrent()) return;
    drawAdmin(main, data);
  }

  function drawAdmin(main, data) {
    const redraw = (d) => { if (d) drawAdmin(main, d); };

    const memberRow = (m) => el('li', { class: 'admin-member' },
      el('div', { class: 'admin-member-name' },
        el('strong', { text: m.name }),
        m.is_me ? el('span', { class: 'badge', text: t('adminBadgeYou') }) : null,
        m.is_admin ? el('span', { class: 'badge prio-medium', text: t('adminBadgeAdmin') }) : null,
        !m.has_pin ? el('span', { class: 'badge muted-badge', text: t('adminBadgeNoPin') }) : null,
        m.locked ? el('span', { class: 'badge prio-high', text: t('adminBadgeLocked') }) : null,
        el('span', { class: 'muted small', text: ' ' + (m.item_count === 1 ? t('itemCountOne') : t('itemCount', { n: m.item_count })) })),
      el('div', { class: 'admin-member-actions' },
        el('button', { class: 'btn ghost small', text: t('adminRename'), onclick: () => renameMember(m, redraw) }),
        el('button', { class: 'btn ghost small', text: t('adminResetPin'), onclick: async (e) => {
          const btn = e.currentTarget;
          if (!(await confirmBox(t('adminResetPinConfirm', { name: m.name })))) return;
          const d = await act(btn, () => Api.adminResetPin(m.id));
          if (d) { redraw(d); toast(t('adminPinReset', { name: m.name })); }
        } }),
        m.is_me ? null : el('button', { class: 'btn ghost small', text: m.is_admin ? t('adminRemoveAdmin') : t('adminMakeAdmin'),
          onclick: async (e) => redraw(await act(e.currentTarget, () => Api.adminSetAdmin(m.id, !m.is_admin))) }),
        m.is_me ? null : el('button', { class: 'btn ghost small danger-text', text: t('adminRemoveMember'), onclick: async (e) => {
          const btn = e.currentTarget;
          if (!(await confirmBox(t('adminRemoveConfirm', { name: m.name }), { okLabel: t('remove'), danger: true }))) return;
          redraw(await act(btn, () => Api.adminRemoveMember(m.id)));
        } })));

    const newName = el('input', { type: 'text', id: 'new-member', maxlength: '60', placeholder: t('adminAddPlaceholder'), autocomplete: 'off' });
    const addForm = el('form', { class: 'inline-form', onsubmit: async (e) => {
      e.preventDefault();
      if (!newName.value.trim()) { newName.focus(); return; }
      const d = await act(e.submitter || addForm.querySelector('button'), () => Api.adminAddMember(newName.value));
      if (d) { redraw(d); toast(t('adminSaved')); document.getElementById('new-member')?.focus(); }
    } },
      el('label', { for: 'new-member', class: 'visually-hidden', text: t('adminAddMember') }),
      newName, el('button', { type: 'submit', class: 'btn primary', text: t('adminAdd') }));

    const passInput = el('input', { type: 'text', id: 'new-pass', autocomplete: 'off', autocapitalize: 'none', minlength: '4' });
    const passForm = el('form', { class: 'inline-form', onsubmit: async (e) => {
      e.preventDefault();
      const code = passInput.value.trim();
      const ok = await act(e.submitter || passForm.querySelector('button'), () => Api.adminSetPasscode(code));
      if (ok) { store(LS.passcode, code); passInput.value = ''; toast(t('adminPasscodeSaved')); }
    } }, el('label', { for: 'new-pass', class: 'visually-hidden', text: t('adminPasscodeLabel') }),
      passInput, el('button', { type: 'submit', class: 'btn primary', text: t('save') }));
    passInput.placeholder = t('adminPasscodeLabel');

    const seasonInput = el('input', { type: 'number', id: 'season', inputmode: 'numeric', min: '2000', max: '2200',
                                      value: String(data.season + 1) });
    const newYear = async (btn, mode) => {
      const season = parseInt(seasonInput.value, 10);
      const ok = mode === 'archive'
        ? await confirmBox(t('adminArchiveConfirm', { season, old: data.season }), { okLabel: t('confirm'), danger: true })
        : await confirmBox(t('adminWipeConfirm', { season }), { okLabel: t('adminWipe'), danger: true, typeWord: t('adminWipeWord') });
      if (!ok) return;
      const d = await act(btn, () => Api.adminNewYear(mode, season));
      if (d) { redraw(d); toast(t('adminSeasonChanged', { season: d.season })); }
    };

    main.replaceChildren(
      el('section', { class: 'page-head' },
        el('h1', { text: t('adminTitle') }),
        el('p', { class: 'muted', text: t('adminSeason', { season: data.season }) })),
      el('section', { class: 'card' },
        el('h2', { text: t('adminMembers') }),
        el('ul', { class: 'admin-members' }, data.members.map(memberRow)),
        el('h3', { text: t('adminAddMember') }), addForm),
      el('section', { class: 'card' },
        el('h2', { text: t('adminPasscodeTitle') }),
        el('p', { class: 'muted small', text: t('adminPasscodeIntro') }), passForm),
      el('section', { class: 'card' },
        el('h2', { text: t('adminNewYearTitle') }),
        el('p', { class: 'muted small', text: t('adminNewYearIntro') }),
        el('div', { class: 'field' }, el('label', { for: 'season', text: t('adminNewSeasonLabel') }), seasonInput),
        el('div', { class: 'actions-row' },
          el('button', { class: 'btn secondary', text: t('adminArchive'), onclick: (e) => newYear(e.currentTarget, 'archive') }),
          el('button', { class: 'btn danger', text: t('adminWipe'), onclick: (e) => newYear(e.currentTarget, 'wipe') }))));
  }

  function renameMember(m, redraw) {
    const input = el('input', { type: 'text', id: 'rename', maxlength: '60', value: m.name });
    openModal({
      title: t('adminRenameTitle', { name: m.name }),
      body: el('div', { class: 'field' }, el('label', { for: 'rename', text: t('adminAddPlaceholder') }), input),
      actions: [
        { label: t('cancel'), onClick: (e, close) => close() },
        { label: t('save'), kind: 'primary', submit: true, onClick: async (e, close, btn) => {
          const d = await act(btn, () => Api.adminRenameMember(m.id, input.value));
          if (d) {
            close();
            redraw(d);
            if (m.is_me) { session.member.name = d.members.find((x) => x.is_me).name; saveSession(session); render(); }
          }
        } },
      ],
    });
  }

  // ------------------------------------------------------------------
  // Start
  // ------------------------------------------------------------------

  async function start() {
    if (!Api.configured()) {
      root.replaceChildren(el('div', { class: 'card center pad' }, el('p', { text: t('errors.E_CONFIG') })));
      return;
    }
    await render();
    // Refresh name/admin flag in the background; log out if the session is gone.
    if (session) {
      Api.getSession().then((s) => {
        const changed = s.member.name !== session.member.name || s.member.is_admin !== session.member.is_admin;
        session.member = s.member;
        saveSession(session);
        if (changed) render();
      }).catch((err) => { if (err.code === 'E_SESSION') forceLogout(); });
    }
  }

  start();
})();
