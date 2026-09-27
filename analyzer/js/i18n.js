/* UI language layer. English source strings stay in the markup; zh-Hant
   is applied by exact match so upstream text can still be merged.
   Species names, file paths, and scientific names are never in the
   dictionary, so they stay as stored. */
(function () {
  const SETTINGS_KEY = 'kestrel-webviz-settings-v1';

  function readLang() {
    try {
      const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
      if (s.ui_language === 'en' || s.ui_language === 'zh-Hant') return s.ui_language;
    } catch (_) { /* keep default */ }
    return 'zh-Hant';
  }

  let lang = readLang();

  function normalize(s) {
    return String(s)
      .replace(/\u00a0/g, ' ')
      .replace(/[\u2018\u2019\u2032]/g, "'")
      .replace(/[\u201c\u201d]/g, '"')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const PATTERNS = [
    [/^(\d[\d,]*) photos$/, function (m) { return m[1] + ' 張照片'; }],
    [/^(\d[\d,]*) scenes selected$/, function (m) { return '已選 ' + m[1] + ' 個場景'; }],
    [/^— of — scenes reviewed\.$/, function () { return '已檢視 — / — 個場景。'; }],
    [/^(\d[\d,]*) of (\d[\d,]*) scenes reviewed\.$/, function (m) { return '已檢視 ' + m[1] + ' / ' + m[2] + ' 個場景。'; }],
  ];

  function lookup(text) {
    if (lang !== 'zh-Hant') return null;
    const table = window.KESTREL_ZH_HANT;
    if (!table) return null;
    const n = normalize(text);
    if (!n || n.length > 500) return null;
    if (Object.prototype.hasOwnProperty.call(table, n)) return table[n];
    for (let i = 0; i < PATTERNS.length; i++) {
      const m = n.match(PATTERNS[i][0]);
      if (m) return PATTERNS[i][1](m);
    }
    return null;
  }

  function t(text) {
    const hit = lookup(text);
    return hit == null ? text : hit;
  }

  const SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, CODE: 1, PRE: 1 };

  function translateAttrs(el) {
    const attrs = ['title', 'placeholder', 'aria-label'];
    for (let i = 0; i < attrs.length; i++) {
      const attr = attrs[i];
      const v = el.getAttribute(attr);
      if (!v) continue;
      const hit = lookup(v);
      if (hit && hit !== v) el.setAttribute(attr, hit);
    }
  }

  function translateText(node) {
    const raw = node.nodeValue;
    if (!raw || !/\S/.test(raw)) return;
    const parent = node.parentElement;
    if (!parent || SKIP[parent.tagName]) return;
    if (parent.closest && parent.closest('[data-i18n-skip], input, textarea')) return;
    const hit = lookup(raw);
    if (hit == null || hit === normalize(raw)) return;
    const lead = raw.match(/^\s*/)[0];
    const tail = raw.match(/\s*$/)[0];
    node.nodeValue = lead + hit + (tail && lead + hit !== raw ? tail : '');
  }

  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) {
      translateText(root);
      return;
    }
    if (root.nodeType !== 1 || SKIP[root.tagName]) return;
    translateAttrs(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let n = walker.nextNode();
    while (n) {
      if (n.nodeType === 3) translateText(n);
      else translateAttrs(n);
      n = walker.nextNode();
    }
  }

  function applyDocument() {
    document.documentElement.lang = lang === 'zh-Hant' ? 'zh-Hant' : 'en';
    document.documentElement.classList.toggle('lang-zh-Hant', lang === 'zh-Hant');
    if (lang !== 'zh-Hant' || !document.body) return;
    walk(document.body);
    if (document.title) {
      const hit = lookup(document.title);
      if (hit) document.title = hit;
    }
  }

  const obs = new MutationObserver(function (records) {
    if (lang !== 'zh-Hant') return;
    for (let i = 0; i < records.length; i++) {
      const rec = records[i];
      if (rec.type === 'characterData' && rec.target) translateText(rec.target);
      const added = rec.addedNodes;
      for (let j = 0; j < added.length; j++) walk(added[j]);
    }
  });

  function setLanguage(next) {
    lang = next === 'en' ? 'en' : 'zh-Hant';
    try {
      const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
      s.ui_language = lang;
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    } catch (_) { /* reload still switches the in-memory default next launch */ }
    location.reload();
  }

  window.t = t;
  window.kestrelI18n = {
    t: t,
    applyDocument: applyDocument,
    setLanguage: setLanguage,
    getLanguage: function () { return lang; },
  };

  document.documentElement.lang = lang === 'zh-Hant' ? 'zh-Hant' : 'en';
  document.documentElement.classList.toggle('lang-zh-Hant', lang === 'zh-Hant');

  function boot() {
    applyDocument();
    if (document.body) {
      obs.observe(document.body, { childList: true, subtree: true, characterData: true });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
