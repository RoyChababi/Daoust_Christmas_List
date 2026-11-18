// Excel / CSV template generation and parsing (SheetJS, loaded on demand),
// plus the field-cleaning rules shared with the item form. These mirror the
// cleaning done in the database so the upload preview matches what is saved.
window.Excel = (function () {
  'use strict';
  const { t } = window.I18N;

  const XLSX_URL = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
  const MAX_ROWS = 300;

  const COLUMNS = [
    { key: 'name',       header: 'Item',         width: 34 },
    { key: 'link',       header: 'Link',         width: 40 },
    { key: 'price',      header: 'Price',        width: 10 },
    { key: 'size_color', header: 'Size / Color', width: 18 },
    { key: 'priority',   header: 'Priority',     width: 10 },
    { key: 'notes',      header: 'Notes',        width: 40 },
  ];

  // Header text (lowercased, letters/digits only) -> field key. Includes French.
  const HEADER_ALIASES = {
    item: 'name', items: 'name', itemname: 'name', gift: 'name', article: 'name', cadeau: 'name',
    link: 'link', url: 'link', website: 'link', lien: 'link',
    price: 'price', pricecad: 'price', cost: 'price', prix: 'price',
    sizecolor: 'size_color', sizecolour: 'size_color', size: 'size_color', color: 'size_color',
    colour: 'size_color', taillecouleur: 'size_color', taille: 'size_color', couleur: 'size_color',
    priority: 'priority', priorite: 'priority',
    notes: 'notes', note: 'notes', comments: 'notes', comment: 'notes', remarques: 'notes', commentaires: 'notes',
  };

  // ---- cleaning (keep in sync with private.clean_* in schema.sql) ----

  const Clean = {
    normalize(s) {
      const raw = String(s == null ? '' : s);
      const n = raw.toLowerCase().replace(/[\p{P}\p{S}]/gu, '').replace(/\s+/g, ' ').trim();
      return n || raw.toLowerCase().trim();
    },
    text(v, max) {
      const s = String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max || 200);
      return s || null;
    },
    notes(v) {
      const s = String(v == null ? '' : v).trim().slice(0, 1000);
      return s || null;
    },
    link(v) {
      let s = String(v == null ? '' : v).trim().slice(0, 2000);
      if (!s) return null;
      if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = 'https://' + s;
      return s;
    },
    price(v) {
      if (v == null || v === '') return null;
      if (typeof v === 'number') return isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : null;
      let s = String(v).replace(/[^0-9.,]/g, '');
      if (!s) return null;
      s = s.includes('.') ? s.replace(/,/g, '') : s.replace(/,/g, '.');
      const n = Number(s);
      return isFinite(n) ? Math.round(n * 100) / 100 : null;
    },
    priority(v) {
      const s = String(v == null ? '' : v).trim().toLowerCase();
      if (['high', 'h', '1', 'haute', 'élevée', 'elevee'].includes(s)) return 'high';
      if (['medium', 'med', 'm', '2', 'moyenne'].includes(s)) return 'medium';
      if (['low', 'l', '3', 'basse'].includes(s)) return 'low';
      return null;
    },
    item(raw) {
      return {
        name: Clean.text(raw.name, 200),
        link: Clean.link(raw.link),
        price: Clean.price(raw.price),
        size_color: Clean.text(raw.size_color, 200),
        priority: Clean.priority(raw.priority),
        notes: Clean.notes(raw.notes),
      };
    },
  };

  // Only http(s) links are ever turned into clickable links.
  function safeHref(link) {
    return link && /^https?:\/\//i.test(link) ? link : null;
  }

  // ---- SheetJS loader ----

  let loading = null;
  function load() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (!loading) {
      loading = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = XLSX_URL;
        s.async = true;
        s.onload = () => resolve(window.XLSX);
        s.onerror = () => { loading = null; const e = new Error('E_NETWORK'); e.code = 'E_NETWORK'; reject(e); };
        document.head.appendChild(s);
      });
    }
    return loading;
  }

  function fail(code) {
    const e = new Error(code);
    e.code = code;
    e.data = {};
    return e;
  }

  // ---- template download ----

  async function downloadTemplate(items, ownerName) {
    const XLSX = await load();
    const header = COLUMNS.map((c) => c.header);
    const priorityLabel = { high: 'High', medium: 'Medium', low: 'Low' };
    const rows = (items || []).map((i) => [
      i.name || '',
      i.link || '',
      i.price == null ? '' : Number(i.price),
      i.size_color || '',
      priorityLabel[i.priority] || '',
      i.notes || '',
    ]);
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    ws['!cols'] = COLUMNS.map((c) => ({ wch: c.width }));
    const help = XLSX.utils.aoa_to_sheet(t('excelHelpLines').map((l) => [l]));
    help['!cols'] = [{ wch: 90 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, t('excelSheetName'));
    XLSX.utils.book_append_sheet(wb, help, t('excelHelpSheetName'));
    const safeName = String(ownerName || '').replace(/[\\/:*?"<>|]/g, '').trim();
    XLSX.writeFile(wb, t('excelFileName', { name: safeName }));
  }

  // ---- parsing ----

  // Returns { rows: [cleaned items], skipped: number of rows with data but no Item }.
  async function parseFile(file) {
    const XLSX = await load();
    let wb;
    try {
      if (/\.csv$/i.test(file.name) || file.type === 'text/csv') {
        wb = XLSX.read(await file.text(), { type: 'string' });
      } else {
        wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      }
    } catch (err) {
      throw fail('E_BAD_FILE');
    }
    const first = wb && wb.SheetNames && wb.SheetNames[0];
    if (!first) throw fail('E_EMPTY_FILE');
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets[first], { header: 1, raw: true, defval: '', blankrows: false });
    if (!aoa.length) throw fail('E_EMPTY_FILE');

    const colKeys = aoa[0].map((h) => {
      const k = String(h == null ? '' : h).toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]/g, '');
      return HEADER_ALIASES[k] || null;
    });
    if (!colKeys.includes('name')) throw fail('E_NO_ITEM_COLUMN');

    const rows = [];
    let skipped = 0;
    for (const line of aoa.slice(1)) {
      const raw = {};
      colKeys.forEach((key, idx) => {
        if (key && raw[key] == null) raw[key] = line[idx];
      });
      const item = Clean.item(raw);
      const hasAnything = line.some((v) => String(v == null ? '' : v).trim() !== '');
      if (!hasAnything) continue;          // empty row
      if (!item.name) { skipped++; continue; }
      rows.push(item);
    }
    if (rows.length > MAX_ROWS) throw fail('E_TOO_MANY');
    return { rows, skipped };
  }

  // What the upload will do, from the owner's point of view.
  function diff(current, rows) {
    const byKey = new Map(current.map((i) => [Clean.normalize(i.name), i]));
    const seen = new Set();
    const added = [];
    const updated = [];
    let unchanged = 0;
    for (const r of rows) {
      const k = Clean.normalize(r.name);
      if (seen.has(k)) continue;           // duplicates in file: first wins (same as server)
      seen.add(k);
      const ex = byKey.get(k);
      if (!ex) added.push(r);
      else if (changed(ex, r)) updated.push(r);
      else unchanged++;
    }
    const removed = current.filter((i) => !seen.has(Clean.normalize(i.name)));
    return { added, updated, removed, unchanged };
  }

  function changed(a, b) {
    const price = (v) => (v == null || v === '' ? null : Number(v));
    return a.name !== b.name ||
      (a.link || null) !== (b.link || null) ||
      price(a.price) !== price(b.price) ||
      (a.size_color || null) !== (b.size_color || null) ||
      (a.priority || null) !== (b.priority || null) ||
      (a.notes || null) !== (b.notes || null);
  }

  return { Clean, safeHref, load, downloadTemplate, parseFile, diff };
})();
