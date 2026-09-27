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
    [/^(\d[\d,]*) images?$/, function (m) { return m[1] + ' 張影像'; }],
    [/^(\d[\d,]*) scenes?$/, function (m) { return m[1] + ' 個場景'; }],
    [/^Scene #(\d+)$/, function (m) { return '場景 #' + m[1]; }],
    [/^(\d[\d,]*) scenes selected$/, function (m) { return '已選 ' + m[1] + ' 個場景'; }],
    [/^— of — scenes reviewed\.$/, function () { return '已檢視 — / — 個場景。'; }],
    [/^(\d[\d,]*) of (\d[\d,]*) scenes reviewed\.$/, function (m) { return '已檢視 ' + m[1] + ' / ' + m[2] + ' 個場景。'; }],
    [/^Step (\d+) of (\d+)$/, function (m) { return '第 ' + m[1] + ' 步，共 ' + m[2] + ' 步'; }],
    [/^(\d[\d,]*) accept · (\d[\d,]*) reject · (\d[\d,]*) total$/, function (m) {
      return m[1] + ' 挑選 · ' + m[2] + ' 拒絕 · 共 ' + m[3];
    }],
    [/^(\d[\d,]*) images accepted, (\d[\d,]*) to reject$/, function (m) {
      return '已挑選 ' + m[1] + ' 張，' + m[2] + ' 張待拒絕';
    }],
    [/^(\d[\d,]*) accepted · (\d[\d,]*) to reject$/, function (m) {
      return '已挑選 ' + m[1] + ' · 待拒絕 ' + m[2];
    }],
    [/^Quality ≥ ([0-9.]+) · Min (\S+) · Max (\S+) · Unrated → (Auto-Reject|Auto-Accept)$/, function (m) {
      const unrated = m[4] === 'Auto-Accept' ? '自動挑選' : '自動拒絕';
      return '畫質 ≥ ' + m[1] + ' · 最少 ' + m[2] + ' · 最多 ' + m[3] + ' · 未評分 → ' + unrated;
    }],
    [/^Culling Assistant — (.+)$/, function (m) { return '挑片助手 — ' + m[1]; }],
    [/^Accepts ★(\d) and above \(★\1 starts at ([0-9.]+)\)\.$/, function (m) {
      return '接受 ★' + m[1] + ' 以上（★' + m[1] + ' 從 ' + m[2] + ' 起）。';
    }],
    [/^Inside the ★(\d) band — accepts only the strongest ★\1 images\.$/, function (m) {
      return '落在 ★' + m[1] + ' 區間——只接受最強的 ★' + m[1] + ' 影像。';
    }],
    [/^Inside the ★(\d) band — accepts ★(\d) and above, plus stronger ★\1 images\.$/, function (m) {
      return '落在 ★' + m[1] + ' 區間——接受 ★' + m[2] + ' 以上，以及較強的 ★' + m[1] + ' 影像。';
    }],
  ];

  let _normIndex = null;
  let _normSource = null;
  function translated(n) {
    const table = window.KESTREL_ZH_HANT;
    if (!table) return null;
    if (_normSource !== table) {
      _normIndex = Object.create(null);
      _normSource = table;
      const keys = Object.keys(table);
      for (let i = 0; i < keys.length; i++) _normIndex[normalize(keys[i])] = table[keys[i]];
    }
    return Object.prototype.hasOwnProperty.call(_normIndex, n) ? _normIndex[n] : null;
  }

  function lookup(text) {
    if (lang !== 'zh-Hant') return null;
    const n = normalize(text);
    if (!n || n.length > 8000) return null;
    const hit = translated(n);
    if (hit != null) return hit;
    for (let i = 0; i < PATTERNS.length; i++) {
      const m = n.match(PATTERNS[i][0]);
      if (m) return PATTERNS[i][1](m);
    }
    const tail = n.match(/^(.{3,120}?:)(\s+\S[\s\S]*)$/);
    if (tail) {
      const pre = translated(tail[1]);
      if (pre && pre !== tail[1]) return pre + tail[2];
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

  const _birdByName = new Map();

  function peekBird(name) {
    const key = String(name || '').trim().toLowerCase();
    return key ? (_birdByName.get(key) || null) : null;
  }

  function rememberBird(rec) {
    if (!rec || typeof rec.canonical_common_name !== 'string') return;
    _birdByName.set(rec.canonical_common_name.trim().toLowerCase(), rec);
  }

  function displayBirdName(english, rec) {
    const key = String(english || '').trim();
    const hit = rec || peekBird(key);
    if (lang === 'zh-Hant' && hit && hit.name_zh) return hit.name_zh;
    return key;
  }

  function ensureBirdNames(names) {
    if (lang !== 'zh-Hant' || !names || !window.pywebview || !window.pywebview.api || !window.pywebview.api.lookup_birds) {
      return Promise.resolve();
    }
    const need = [];
    for (let i = 0; i < names.length; i++) {
      const n = String(names[i] || '').trim();
      if (!n || _birdByName.has(n.toLowerCase())) continue;
      _birdByName.set(n.toLowerCase(), { canonical_common_name: n, name_zh: '' });
      need.push(n);
    }
    if (!need.length) return Promise.resolve();
    return window.pywebview.api.lookup_birds(need).then(function (res) {
      const map = res && res.success && res.map;
      if (!map) return;
      Object.keys(map).forEach(function (k) { rememberBird(map[k]); });
    }).catch(function () {});
  }

  window.t = t;
  window.kestrelI18n = {
    t: t,
    applyDocument: applyDocument,
    setLanguage: setLanguage,
    getLanguage: function () { return lang; },
    displayBirdName: displayBirdName,
    ensureBirdNames: ensureBirdNames,
    peekBird: peekBird,
    rememberBird: rememberBird,
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
