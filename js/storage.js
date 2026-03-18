// ============================================================
// storage.js  —  v7 (IndexedDB upgrade)
//
// TECH UPGRADE: IndexedDB replaces localStorage for chat data.
//   localStorage  → 5 MB limit, synchronous, strings only
//   IndexedDB     → 50 MB+ limit, async, any data type
//
// ARCHITECTURE:
//   IndexedDB   → chat messages (large, async)
//   localStorage → preferences + profile (small, sync reads on startup)
// ============================================================

const DB_NAME    = 'arjun-ai-db';
const DB_VERSION = 1;
const STORE      = 'chats';
let db = null;

// ── Open IndexedDB ───────────────────────────────────────────
function openDB() {
  return new Promise((resolve) => {
    if (db) return resolve(db);
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains(STORE)) {
        const s = d.createObjectStore(STORE, { keyPath: 'id' });
        s.createIndex('created', 'created', { unique: false });
      }
    };
    req.onsuccess = e => { db = e.target.result; resolve(db); };
    req.onerror   = () => { console.warn('[Arjun] IndexedDB unavailable, using localStorage'); resolve(null); };
  });
}

// ── IndexedDB CRUD ───────────────────────────────────────────
async function dbSave(chat) {
  const d = await openDB(); if (!d) return;
  return new Promise(r => { const tx = d.transaction(STORE,'readwrite'); tx.objectStore(STORE).put(chat); tx.oncomplete=r; tx.onerror=r; });
}
async function dbLoadAll() {
  const d = await openDB(); if (!d) return {};
  return new Promise(r => {
    const req = d.transaction(STORE,'readonly').objectStore(STORE).getAll();
    req.onsuccess = () => { const out={}; (req.result||[]).forEach(c=>{out[c.id]=c;}); r(out); };
    req.onerror   = () => r({});
  });
}
async function dbDelete(id) {
  const d = await openDB(); if (!d) return;
  return new Promise(r => { const tx = d.transaction(STORE,'readwrite'); tx.objectStore(STORE).delete(id); tx.oncomplete=r; tx.onerror=r; });
}
async function dbClear() {
  const d = await openDB(); if (!d) return;
  return new Promise(r => { const tx = d.transaction(STORE,'readwrite'); tx.objectStore(STORE).clear(); tx.oncomplete=r; tx.onerror=r; });
}

// ── Schema Migration ─────────────────────────────────────────
async function migrate() {
  const v = parseInt(localStorage.getItem('arjun_schema') || '0');
  if (v < SCHEMA_VER) {
    // Move old localStorage chats into IndexedDB
    ['arjun5_chats','arjun4_chats'].forEach(async key => {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      try {
        const old = JSON.parse(raw);
        for (const chat of Object.values(old)) await dbSave(chat);
        localStorage.removeItem(key);
        console.info('[Arjun] Migrated', key, 'to IndexedDB');
      } catch(e) {}
    });
    ['arjun5_active','arjun5_tok','arjun4_active','arjun4_tok'].forEach(k=>localStorage.removeItem(k));
    localStorage.setItem('arjun_schema', String(SCHEMA_VER));
  }
}

// ── Public API used by app.js ─────────────────────────────────
async function save() {
  if (activeId && chats[activeId]) await dbSave(chats[activeId]);
  safeSet('arjun_active', activeId);
  safeSet('arjun_tok', String(totalTok));
  updateStorageBar();
}
async function loadState() {
  chats    = await dbLoadAll();
  activeId = localStorage.getItem('arjun_active');
  totalTok = parseInt(localStorage.getItem('arjun_tok') || '0');
  updateTok();
}
async function deleteChat(id) {
  delete chats[id];
  await dbDelete(id);
  safeSet('arjun_active', activeId);
}
async function clearAllChats() {
  chats = {};
  await dbClear();
}

// ── Safe localStorage (small data only) ──────────────────────
function safeSet(key, val) {
  try { localStorage.setItem(key, val); return true; } catch(e) { return false; }
}

// ── Storage Bar ───────────────────────────────────────────────
async function updateStorageBar() {
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const { usage, quota } = await navigator.storage.estimate();
      const pct = Math.min((usage/quota)*100, 100);
      const mb  = (usage/1024/1024).toFixed(1);
      const el  = document.getElementById('storage-lbl');
      const fill= document.getElementById('storage-fill');
      if (el)   el.textContent = 'Storage: ' + mb + ' MB used';
      if (fill) { fill.style.width = pct+'%'; fill.classList.toggle('warn', pct>70); }
    } else {
      const el = document.getElementById('storage-lbl');
      if (el) el.textContent = Object.keys(chats).length + ' chats saved (IndexedDB)';
    }
  } catch(e) {}
}

// ── User Profile ──────────────────────────────────────────────
function userProfile() {
  try { return JSON.parse(localStorage.getItem('arjun_profile')||'{}'); } catch(e) { return {}; }
}
function loadProfile() {
  const p = userProfile();
  if (!p.name) return;
  const set = (id,v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
  const setVal = (id,v) => { const el=document.getElementById(id); if(el) el.value=v||''; };
  set('profile-av', p.name.charAt(0).toUpperCase());
  set('profile-name', p.name);
  set('profile-sub', (p.year||'Student')+(p.city?' · '+p.city:''));
  ['p-name','p-year','p-goal','p-city'].forEach((id,i)=>setVal(id,[p.name,p.year,p.goal,p.city][i]));
}
function saveProfile() {
  const get = id => document.getElementById(id)?.value.trim() || '';
  const p = { name:get('p-name'), year:get('p-year'), goal:get('p-goal'), city:get('p-city') };
  safeSet('arjun_profile', JSON.stringify(p));
  loadProfile();
  closeM('profile-modal');
  toast('Profile saved! Arjun now knows you 👋','ok');
}

// ── Preferences ───────────────────────────────────────────────
function loadPrefs() {
  const raw = localStorage.getItem('arjun_prefs');
  const p   = JSON.parse(raw || '{}');
  // First visit — respect OS dark/light preference instead of always defaulting to dark
  if (!raw) {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    p.theme = prefersDark ? 'dark' : 'light';
  }
  const tog = (id,v) => { const el=document.getElementById(id); if(el&&v!==undefined) el.checked=v; };
  if (p.theme)    { document.body.classList.toggle('light',p.theme==='light'); tog('s-theme',p.theme==='light'); }
  if (p.fontSize) { document.documentElement.style.setProperty('--fs',p.fontSize); const el=document.getElementById('s-fs'); if(el) el.value=p.fontSize; }
  tog('ss', p.stream); tog('sd', p.sound); tog('sa', p.scroll);
  if (p.tokens) { const el=document.getElementById('stok'); if(el) el.value=p.tokens; }
}
function savePrefs() {
  const get = id => document.getElementById(id)?.checked;
  const p = {
    theme:    document.body.classList.contains('light')?'light':'dark',
    fontSize: getComputedStyle(document.documentElement).getPropertyValue('--fs').trim(),
    stream:   get('ss'), sound: get('sd'), scroll: get('sa'),
    tokens:   document.getElementById('stok')?.value
  };
  safeSet('arjun_prefs', JSON.stringify(p));
}
