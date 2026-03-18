// ============================================================
// app.js
// Main application logic — UI state, chat management,
// message rendering, input handling, agent cards, utilities.
// ============================================================

// ── Global State ────────────────────────────────────────────
let chats         = {};    // { chatId: { title, messages[], mode, agent, created } }
let activeId      = null;  // currently open chat ID
let loading       = false; // true while waiting for API response
let chatMode      = 'chat';// active chat mode: 'chat' | 'study' | 'career'
let agentMode     = null;  // active agent: 'code' | 'jobs' | 'plan' | etc. | null
let recording     = false; // true while voice input is active
let recog         = null;  // SpeechRecognition instance
let attachedFiles = [];    // [{ name, content }] — files to include in next message
let totalTok      = 0;     // cumulative output tokens this session
let imgData       = null;  // { data, type } — base64 image for multimodal send
let abortCtrl     = null;  // AbortController — lets Stop button cancel fetch
let _sendRetried  = false; // true if we already auto-retried once this send
let typingStart   = 0;     // timestamp when typing indicator appeared
let typingTimer   = null;  // interval ID for typing elapsed counter
let renamingId    = null;  // chat ID currently being renamed

// ── Startup ─────────────────────────────────────────────────
addEventListener('DOMContentLoaded', async () => {
  // Register Service Worker (PWA — offline support + installable)
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('/sw.js')
      .then(() => console.info('[Arjun] Service Worker registered'))
      .catch(e  => console.warn('[Arjun] SW registration failed:', e));
  }

  // PWA install prompt — show "Add to Home Screen" button when available
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    window._pwaInstallPrompt = e;
    document.getElementById('install-btn')?.style.setProperty('display','flex');
  });

  await migrate();     // migrate old localStorage data to IndexedDB
  loadPrefs();         // restore theme, font size, toggles (sync — localStorage)
  loadProfile();       // restore user name/year/goal/city (sync)
  checkApiKey();       // show warning banner if key not set
  await loadState();   // restore chats from IndexedDB (async)

  if (!getApiKey()) showKeySetup();
  if (location.protocol === 'file:') setTimeout(() => showServerHelp(), 800);

  renderChips();
  renderSuggestions();
  if (!activeId || !chats[activeId]) newChat(false);
  renderList();
  renderMsgs();
  updateStorageBar();
  setupDragDrop();
  setupPasteImg();
  setupKeyboardShortcuts();
});

// ── PWA Install ──────────────────────────────────────────────
async function installPWA() {
  const prompt = window._pwaInstallPrompt;
  if (!prompt) { toast('Open in Chrome/Edge to install as app', 'tip'); return; }
  prompt.prompt();
  const { outcome } = await prompt.userChoice;
  if (outcome === 'accepted') toast('Arjun AI installed! Find it on your home screen 🎉', 'ok');
  window._pwaInstallPrompt = null;
  document.getElementById('install-btn')?.style.setProperty('display','none');
}


// ── API Key Setup (onboarding) ───────────────────────────────
// Shows the key entry screen. Called on first load and when
// user clicks "Set Key" in the warning banner.
function showKeySetup() {
  document.getElementById('key-setup').classList.add('on');
  setTimeout(() => document.getElementById('key-input').focus(), 100);
}

function saveKey() {
  const val = document.getElementById('key-input').value.trim();
  if (val.length < 10) {
    document.getElementById('key-input').style.borderColor = 'var(--err)';
    document.getElementById('key-input').placeholder = '❌ Key too short — paste full gsk_... key';
    return;
  }
  setApiKey(val);
  document.getElementById('key-setup').classList.remove('on');
  document.getElementById('key-input').value = '';
  checkApiKey();
  toast('API key saved! Arjun is ready 🚀', 'ok');
}

function removeKey() {
  if (!confirm('Remove your API key? You will need to enter it again to use Arjun.')) return;
  localStorage.removeItem('arjun_api_key');
  checkApiKey();
  showKeySetup();
  toast('API key removed.', 'tip');
}


// ── Server Help Modal ────────────────────────────────────────
// Shown when user opens via file:// protocol (double-click)
// instead of a proper local server.
function showServerHelp() {
  openM('server-help');
}

// ── API Key Warning Banner ───────────────────────────────────
function checkApiKey() {
  const bad = !getApiKey();
  document.getElementById('api-warn').classList.toggle('show', bad);
}

// ── Theme & Font Size ────────────────────────────────────────
function toggleTheme(light) {
  document.body.classList.toggle('light', light);
  savePrefs();
}
function setFontSize(sz) {
  document.documentElement.style.setProperty('--fs', sz);
  savePrefs();
}

// ── Sidebar Toggle ───────────────────────────────────────────
function toggleSidebar() {
  document.getElementById('app').classList.toggle('sb-collapsed');
}

// ── Keyboard Shortcuts ───────────────────────────────────────
function setupKeyboardShortcuts() {
  // Alt+1..0 map to agents in order
  const AGENT_KEYS = {
    '1':'code','2':'jobs','3':'plan','4':'write','5':'finance',
    '6':'hustle','7':'health','8':'debug','9':'mock','0':'social'
  };

  document.addEventListener('keydown', e => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key === 'k') { e.preventDefault(); document.getElementById('ui').focus(); }
    if (mod && e.key === 'n') { e.preventDefault(); newChat(); }
    if (mod && e.key === 'b') { e.preventDefault(); toggleSidebar(); }
    if (mod && e.key === 'f') { e.preventDefault(); toggleSearch(); }
    if (e.key === 'Escape') {
      if (loading) stopGeneration();
      else if (document.getElementById('srchwrap').classList.contains('on')) toggleSearch();
      document.querySelectorAll('.overlay.on').forEach(m => m.classList.remove('on'));
    }
    // Alt+1-0 → switch agents (Alt avoids browser conflicts)
    if (e.altKey && AGENT_KEYS[e.key]) {
      e.preventDefault();
      const agent = AGENT_KEYS[e.key];
      const pills = document.querySelectorAll('.agpill');
      const idx   = ALL_AGENTS.indexOf(agent);
      if (idx >= 0 && pills[idx]) toggleAgent(agent, pills[idx]);
    }
  });
}

// ── Drag & Drop File Upload ──────────────────────────────────
function setupDragDrop() {
  const wrap = document.getElementById('inwrap');
  wrap.addEventListener('dragover',  e => { e.preventDefault(); wrap.classList.add('drag-over'); });
  wrap.addEventListener('dragleave', () => wrap.classList.remove('drag-over'));
  wrap.addEventListener('drop', e => {
    e.preventDefault(); wrap.classList.remove('drag-over');
    const all   = Array.from(e.dataTransfer.files);
    const imgs  = all.filter(f => f.type.startsWith('image/'));
    const files = all.filter(f => !f.type.startsWith('image/'));
    if (imgs.length)  processImgFile(imgs[0]);
    if (files.length) files.forEach(f => {
      const r = new FileReader();
      r.onload = ev => { attachedFiles.push({ name: f.name, content: ev.target.result }); renderFileTray(); };
      r.readAsText(f);
    });
  });
}

// ── Paste Image (Ctrl+V) ─────────────────────────────────────
function setupPasteImg() {
  document.addEventListener('paste', e => {
    const items = Array.from(e.clipboardData?.items || []);
    const img   = items.find(i => i.type.startsWith('image/'));
    if (!img) return;
    e.preventDefault();
    processImgFile(img.getAsFile());
    toast('Image pasted! Open 🖼 Image to analyze it.', 'tip');
  });
}

function processImgFile(file) {
  const r = new FileReader();
  r.onload = e => {
    imgData = { data: e.target.result.split(',')[1], type: file.type };
    document.getElementById('imgdrop').innerHTML =
      `<img src="${e.target.result}" style="max-height:120px;border-radius:10px;object-fit:contain"/>
       <div style="font-size:11px;color:var(--ok);margin-top:6px">✅ ${escH(file.name || 'pasted image')}</div>`;
  };
  r.readAsDataURL(file);
}

// ── Chat Management ──────────────────────────────────────────
let _chatCounter = 0; // ensures unique IDs even if called within same millisecond
function newChat(render = true) {
  const id = 'c' + Date.now() + '_' + (++_chatCounter);
  chats[id] = { id, title: 'New Chat', messages: [], mode: chatMode, agent: agentMode, created: Date.now() };
  activeId  = id;
  if (render) { renderList(); renderMsgs(); save(); }
}

function switchChat(id) {
  if (!chats[id]) return;
  activeId  = id;
  chatMode  = chats[id].mode  || 'chat';
  agentMode = chats[id].agent || null;
  syncModeUI(); renderChips(); renderSuggestions();
  renderList(); renderMsgs(); save();
}

async function delChat(id, e) {
  e.stopPropagation();
  const wasActive = activeId === id;
  await deleteChat(id);          // removes from IndexedDB + chats object
  if (wasActive) {
    const ids = Object.keys(chats);
    activeId  = ids.length ? ids[ids.length - 1] : null;
    if (!activeId) newChat(false);
  }
  renderList(); renderMsgs(); save();
}

function renameChat(id, e) {
  e.stopPropagation();
  renamingId = id;
  document.getElementById('rename-in').value = chats[id].title;
  openM('rename-modal');
  setTimeout(() => document.getElementById('rename-in').select(), 50);
}

function doRename() {
  const val = document.getElementById('rename-in').value.trim();
  if (val && renamingId && chats[renamingId]) {
    chats[renamingId].title = val;
    renderList(); save();
    toast('Chat renamed', 'ok');
  }
  closeM('rename-modal'); renamingId = null;
}

// ── Sync Mode/Agent Pill UI ──────────────────────────────────
const ALL_AGENTS = ['code','jobs','plan','write','finance','hustle','health','debug','mock','social'];

function syncModeUI() {
  document.querySelectorAll('.mpill').forEach((b, i) =>
    b.classList.toggle('on', ['chat','study','career'][i] === chatMode));
  document.querySelectorAll('.agpill').forEach((b, i) =>
    b.classList.toggle('on', ALL_AGENTS[i] === agentMode));

  const badge = document.getElementById('agent-badge');
  const lbl   = document.getElementById('agent-mode-lbl');
  if (agentMode && badge && lbl) {
    const icons = { code:'💻',jobs:'🎯',plan:'📋',write:'✍️',finance:'💰',hustle:'🚀',health:'🧘',debug:'🐛',mock:'🎤',social:'💬' };
    const names = { code:'Code Agent',jobs:'Job Agent',plan:'Plan Agent',write:'Write Agent',finance:'Finance Agent',hustle:'Hustle Agent',health:'Health Agent',debug:'Debug Agent',mock:'Mock Interview',social:'Social Agent' };
    lbl.textContent = (icons[agentMode] || '🤖') + ' ' + (names[agentMode] || agentMode);
    badge.style.display = 'flex';
  } else if (badge) {
    badge.style.display = 'none';
  }
}

function renderList() {
  const c = document.getElementById('clist');
  c.innerHTML = '';
  Object.keys(chats)
    .sort((a, b) => (chats[b].created || 0) - (chats[a].created || 0))
    .forEach(id => {
      const d = document.createElement('div');
      d.className = 'crow' + (id === activeId ? ' on' : '');
      const msgCount = chats[id].messages?.length || 0;
      const countBadge = msgCount > 0
        ? `<span style="font-size:9px;color:var(--d);font-family:var(--mono);margin-left:2px">${msgCount}</span>`
        : '';
      d.innerHTML = `<div class="cdot"></div>
        <span class="cname" title="${escH(chats[id].title)}">${escH(chats[id].title)}</span>
        ${countBadge}
        <div class="crow-actions">
          <button class="crow-btn" onclick="renameChat('${id}',event)" title="Rename">✏️</button>
          <button class="crow-btn del" onclick="delChat('${id}',event)" title="Delete">✕</button>
        </div>`;
      d.onclick = () => switchChat(id);
      c.appendChild(d);
    });
  const t = document.getElementById('ctitle');
  if (t && activeId && chats[activeId]) t.textContent = chats[activeId].title.slice(0, 30);
}

// ── Message Rendering ────────────────────────────────────────
function renderMsgs() {
  const c    = document.getElementById('msgs');
  const chat = chats[activeId];

  if (!chat || !chat.messages.length) {
    const p     = userProfile();
    const greet = p.name ? `Hey ${p.name}! 👋` : "Hey! I'm Arjun 👋";
    c.innerHTML = `<div class="welcome" id="ws">
      <div class="w-orb">🧠</div>
      <div class="w-greeting">${greet}</div>
      <p class="w-sub">Your all-in-one AI buddy — chat, code, find jobs, make plans, write anything. What do you need?</p>
      <div class="w-chips">
        <div class="w-chip" onclick="qs('Build me a complete to-do app in React with localStorage')">💻 Build a React app</div>
        <div class="w-chip" onclick="qs('Find me AI/ML jobs in Bangalore for freshers')">🎯 Find me jobs</div>
        <div class="w-chip" onclick="qs('I earn ₹8000/month as a student. Make me a budget and tell me how to invest')">💰 Fix my finances</div>
        <div class="w-chip" onclick="qs('I want to earn money as a college student. What can I do with my coding skills?')">🚀 Make money online</div>
        <div class="w-chip" onclick="qs('Conduct a full mock HR interview for a software engineer fresher role at a startup')">🎤 Mock interview me</div>
        <div class="w-chip" onclick="qs('Give me a hostel-friendly workout plan and a healthy meal plan under ₹100/day')">🧘 Health plan</div>
        <div class="w-chip" onclick="qs('Make me a 90-day AI/ML placement roadmap starting from basics')">📋 90-day roadmap</div>
        <div class="w-chip" onclick="qs('I am feeling overwhelmed with college. Help me calm down and make a plan.')">😤 Overwhelmed</div>
      </div>
    </div>`;
    return;
  }

  c.innerHTML = '';
  let lastDate = '';
  chat.messages.forEach(m => {
    // Insert a date separator when the day changes
    const msgDate = m.date || formatDate(new Date());
    if (msgDate !== lastDate) {
      lastDate = msgDate;
      const sep = document.createElement('div');
      sep.className = 'date-sep';
      sep.innerHTML = `<div class="date-sep-line"></div><span class="date-sep-lbl">${msgDate}</span><div class="date-sep-line"></div>`;
      c.appendChild(sep);
    }
    addBubble(m.role, m.content, m.time, /*animate=*/false, /*streaming=*/false, m.pinned);
  });
  scrollBot();
}

function formatDate(d) {
  const today     = new Date();
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString())     return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Scroll-to-Bottom FAB ─────────────────────────────────────
function onMsgsScroll() {
  const c        = document.getElementById('msgs');
  const atBottom = c.scrollHeight - c.scrollTop - c.clientHeight < 80;
  document.getElementById('scroll-fab').classList.toggle('show', !atBottom);
}

// ── Mode & Agent Selection ───────────────────────────────────
function setMode(m, btn) {
  chatMode  = m;
  agentMode = null;
  document.querySelectorAll('.mpill').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  document.querySelectorAll('.agpill').forEach(b => b.classList.remove('on'));
  if (activeId && chats[activeId]) { chats[activeId].mode = m; chats[activeId].agent = null; }
  syncModeUI(); renderChips(); renderSuggestions(); save(); savePrefs();
}

function toggleAgent(a, btn) {
  if (agentMode === a) {
    // Clicking active agent again → deactivate it
    agentMode = null;
    btn.classList.remove('on');
  } else {
    agentMode = a; chatMode = 'chat';
    document.querySelectorAll('.agpill').forEach(b => b.classList.remove('on'));
    btn.classList.add('on');
    document.querySelectorAll('.mpill').forEach(b => b.classList.remove('on'));
    const labels = {
      code:    '💻 Code Agent — tell me what to build!',
      jobs:    '🎯 Job Agent — tell me your role and city!',
      plan:    '📋 Plan Agent — tell me your goal!',
      write:   '✍️ Write Agent — tell me what to write!',
      finance: '💰 Finance Agent — tell me your income and I will build your budget!',
      hustle:  '🚀 Hustle Agent — tell me your skills and I will find you income!',
      health:  '🧘 Health Agent — tell me your situation and I will build your plan!',
      debug:   '🐛 Debug Agent — paste your broken code and I will fix it!',
      mock:    '🎤 Mock Interview Agent — tell me the role and round type!',
      social:  '💬 Social Agent — tell me what is going on!'
    };
    toast(labels[a] || 'Agent activated', 'tip');
  }
  if (activeId && chats[activeId]) { chats[activeId].mode = 'chat'; chats[activeId].agent = agentMode; }
  syncModeUI(); renderChips(); renderSuggestions(); save();
}

function getPrompt() {
  const key = agentMode || chatMode;
  return (PROMPTS[key] || PROMPTS.chat)();
}

function renderChips() {
  const g = document.getElementById('chiplist'); if (!g) return;
  g.innerHTML = '';
  const key = agentMode || chatMode;
  (CHIPS[key] || CHIPS.chat).forEach(t => {
    const b = document.createElement('button');
    b.className = 'chip'; b.textContent = t; b.onclick = () => qs(t);
    g.appendChild(b);
  });
}

function renderSuggestions() {
  const r = document.getElementById('sugg-row'); if (!r) return;
  r.innerHTML = '';
  const key = agentMode || chatMode;
  (SUGGESTIONS[key] || []).forEach(t => {
    const b = document.createElement('button');
    b.className = 'sugg'; b.textContent = t; b.onclick = () => qs(t);
    r.appendChild(b);
  });
}

// Shortcut: fills input and sends immediately
function qs(text) { const i = document.getElementById('ui'); if (i) { i.value = text; send(); } }

// ── Send Message ─────────────────────────────────────────────
async function send() {
  const inp = document.getElementById('ui');
  const txt = inp.value.trim();
  if ((!txt && !attachedFiles.length && !imgData) || loading) return;
  if (!getApiKey()) { showKeySetup(); return; }

  document.getElementById('ws')?.remove(); // hide welcome screen

  // Build content string (append any attached files as code blocks)
  let content = txt;
  if (attachedFiles.length) {
    content = (txt || 'Please review these files:') +
      attachedFiles.map(f => `\n\n--- File: ${f.name} ---\n\`\`\`\n${f.content}\n\`\`\``).join('');
  }

  const now     = new Date();
  const ts      = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateStr = formatDate(now);
  const chat    = chats[activeId];

  chat.messages.push({ role: 'user', content, time: ts, date: dateStr });
  addBubble('user', content, ts, true, false, false);

  // Auto-title from first message
  if (chat.messages.length === 1) {
    chat.title = (txt || 'Agent Task').slice(0, 40) + (txt.length > 40 ? '…' : '');
    renderList();
  }

  // Clear input
  inp.value = ''; inp.style.height = 'auto';
  attachedFiles = []; renderFileTray(); updateCharCount(0);

  const cap = imgData; imgData = null; // capture and clear before async

  const tid = showTyping();
  loading = true; disableSend();
  document.getElementById('stop-btn').style.display = '';
  abortCtrl = new AbortController();

  try {
    const doStream = document.getElementById('ss').checked && !cap;
    const maxTok   = parseInt(document.getElementById('stok').value);
    const sys      = getPrompt();

    // Trim to MAX_CTX_MSGS to prevent API 400 token overflow
    const allMsgs = chat.messages.slice(0, -1);
    const trimmed = allMsgs.length > MAX_CTX_MSGS ? allMsgs.slice(-MAX_CTX_MSGS) : allMsgs;
    let msgs = trimmed.map(m => ({ role: m.role, content: m.content }));

    if (cap) {
      // Multimodal message (image + text)
      msgs.push({ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: cap.type, data: cap.data } },
        { type: 'text',  text: content || 'Describe and analyze this image in detail.' }
      ]});
      resetImgDrop();
    } else {
      msgs.push({ role: 'user', content });
    }

    let reply = '';
    if (doStream) reply = await streamResp(sys, msgs, maxTok, tid, ts, dateStr, chat);
    else          reply = await normResp(sys, msgs, maxTok, tid, ts, dateStr, chat);

    // Post-process agent responses (add action buttons, download cards)
    if (reply && agentMode) renderAgentCard(reply, agentMode);

  } catch (err) {
    if (err.name === 'AbortError') { toast('Generation stopped.', 'tip'); }
    else {
      rmTyping(tid);
      chat.messages.pop(); // rollback optimistic push
      const isFileProtocol = location.protocol === 'file:';
      if (isFileProtocol) {
        toast('⚠️ Open via server, not file:// — see instructions below', 'bad');
        showServerHelp();
      } else if (!_sendRetried) {
        // Retry once automatically after 2 seconds on transient network errors
        _sendRetried = true;
        toast('Network hiccup — retrying in 2s…', 'tip');
        setTimeout(() => { _sendRetried = false; send(); }, 2000);
      } else {
        _sendRetried = false;
        toast('Network error — check your connection and API key!', 'bad');
      }
      console.error('[Arjun] Send error:', err);
    }
  } finally {
    loading = false; enableSend();
    document.getElementById('stop-btn').style.display = 'none';
    abortCtrl = null;
    if (typingTimer) { clearInterval(typingTimer); typingTimer = null; }
    save();
    if (document.getElementById('sd').checked) chime();
    savePrefs();
  }
}

function stopGeneration() {
  if (abortCtrl) { abortCtrl.abort(); toast('Stopping…', 'tip'); }
}

// ── Agent Card Renderer ──────────────────────────────────────
// After an agent responds, append relevant action buttons and
// (for Code Agent) a download card for each code block.
function renderAgentCard(reply, agent) {
  const c       = document.getElementById('msgs');
  const lastMsg = c.lastElementChild;
  if (!lastMsg) return;
  const bub = lastMsg.querySelector('.bub');
  if (!bub) return;

  // Code Agent: add a download card below every code block
  if (agent === 'code') {
    bub.querySelectorAll('pre').forEach((pre, i) => {
      const code = pre.querySelector('code');
      if (!code || code.textContent.length < 50) return;
      const lang   = (code.className.match(/lang-(\w+)/) || [])[1] || 'txt';
      const extMap = { python:'py', javascript:'js', typescript:'ts', html:'html', css:'css', java:'java', cpp:'cpp', c:'c', go:'go', rust:'rs', json:'json', bash:'sh', shell:'sh' };
      const fn     = `arjun_${i + 1}.${extMap[lang] || 'txt'}`;
      const dl     = document.createElement('div');
      dl.className = 'code-dl';
      dl.innerHTML = `<div class="code-dl-icon">📄</div>
        <div class="code-dl-info">
          <div class="code-dl-name">${escH(fn)}</div>
          <div class="code-dl-size">${lang.toUpperCase()} · ${code.textContent.split('\n').length} lines</div>
        </div>
        <button class="code-dl-btn" onclick="dlCode(this)">⬇ Download</button>`;
      // Store code as JS property to avoid HTML-escaping issues
      dl.querySelector('.code-dl-btn')._code = code.textContent;
      dl.querySelector('.code-dl-btn')._file = fn;
      pre.after(dl);
    });
  }

  // Action buttons per agent type
  const actRows = {
    jobs:    `<button class="actn-btn primary" onclick="qs('Write me a tailored cold email for the top company from this list')">✉️ Cold email top pick</button>
              <button class="actn-btn" onclick="qs('Which of these am I most likely to get as a fresher?')">🎯 Best match for me</button>
              <button class="actn-btn" onclick="copyBubText(this)">📋 Copy all</button>`,

    plan:    `<button class="actn-btn primary" onclick="qs('Let us start Day 1 of this plan right now')">🚀 Start Day 1</button>
              <button class="actn-btn" onclick="qs('Make this plan more detailed with daily tasks')">📋 More detail</button>
              <button class="actn-btn" onclick="exportAsPDF(this)">📄 Export PDF</button>
              <button class="actn-btn" onclick="dlFromBub(this,'my_plan.md')">⬇ .md</button>`,

    write:   `<button class="actn-btn primary" onclick="copyBubText(this)">📋 Copy text</button>
              <button class="actn-btn" onclick="qs('Make this more concise')">✂️ Concise</button>
              <button class="actn-btn" onclick="qs('Make this more formal')">💼 Formal</button>
              <button class="actn-btn" onclick="qs('Write a completely different version')">🔄 New version</button>`,

    finance: `<button class="actn-btn primary" onclick="renderBudgetChart(this.closest('.bub').innerText)">📊 Chart this budget</button>
              <button class="actn-btn" onclick="qs('How do I start investing ₹500 per month as a student?')">📈 Start investing</button>
              <button class="actn-btn" onclick="qs('What should I do with my first salary? Give me exact allocation')">💰 First salary plan</button>
              <button class="actn-btn" onclick="exportAsPDF(this)">📄 Export PDF</button>`,

    hustle:  `<button class="actn-btn primary" onclick="qs('Give me my exact first 3 steps to start earning this week')">🚀 Start this week</button>
              <button class="actn-btn" onclick="qs('Write me a Fiverr/LinkedIn gig description for my skill')">✍️ Write my gig</button>
              <button class="actn-btn" onclick="qs('How do I get my first client with zero experience?')">🎯 Get first client</button>
              <button class="actn-btn" onclick="dlFromBub(this,'my_hustle_plan.md')">⬇ Download plan</button>`,

    health:  `<button class="actn-btn primary" onclick="qs('Give me a full week workout plan I can do in my hostel room')">🏋 Weekly workout</button>
              <button class="actn-btn" onclick="qs('Give me a healthy daily meal plan for ₹100 per day')">🥗 Meal plan</button>
              <button class="actn-btn" onclick="qs('Make me a 7-day sleep reset plan to fix my schedule')">😴 Fix my sleep</button>
              <button class="actn-btn" onclick="dlFromBub(this,'my_health_plan.md')">⬇ Download</button>`,

    debug:   `<button class="actn-btn primary" onclick="qs('Now explain how to prevent this type of bug in future')">🛡 Prevent this bug</button>
              <button class="actn-btn" onclick="qs('Are there any other potential bugs in my code?')">🔍 Check more bugs</button>
              <button class="actn-btn" onclick="qs('Write tests for this code so this never breaks again')">🧪 Write tests</button>
              <button class="actn-btn" onclick="copyBubText(this)">📋 Copy fix</button>`,

    mock:    `<button class="actn-btn primary" onclick="qs('Ask me the next interview question')">▶ Next question</button>
              <button class="actn-btn" onclick="qs('Give me my overall score and top 3 things to improve')">📊 My score</button>
              <button class="actn-btn" onclick="qs('What would a top candidate have said for that question?')">⭐ Ideal answer</button>
              <button class="actn-btn" onclick="exportAsPDF(this)">📄 Export PDF</button>`,

    social:  `<button class="actn-btn primary" onclick="qs('Write me the exact message to send right now')">💬 Write the message</button>
              <button class="actn-btn" onclick="qs('What should I NOT say in this situation?')">⚠️ What to avoid</button>
              <button class="actn-btn" onclick="qs('Give me a different approach if this does not work')">🔄 Alternative approach</button>`
  };

  if (actRows[agent]) {
    const div = document.createElement('div');
    div.style.cssText = 'margin-top:10px;display:flex;gap:6px;flex-wrap:wrap';
    div.innerHTML = actRows[agent];
    bub.appendChild(div);
  }
}

// ── Download Helpers ─────────────────────────────────────────
// Always revoke object URLs after use to prevent memory leaks.
function dlCode(btn) {
  const url = URL.createObjectURL(new Blob([btn._code || ''], { type: 'text/plain' }));
  const a   = document.createElement('a'); a.href = url; a.download = btn._file || 'code.txt'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast('Downloaded ' + (btn._file || 'code.txt'), 'ok');
}
function dlFromBub(btn, filename) {
  const text = btn.closest('.bub')?.innerText || '';
  const url  = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  const a    = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast('Downloaded!', 'ok');
}
function copyBubText(btn) {
  navigator.clipboard.writeText(btn.closest('.bub')?.innerText || '').then(() => toast('Copied!', 'ok'));
}

// ── Chart.js — render finance budget chart ───────────────────
// Called by Finance agent action buttons
// Parses the response text and renders a doughnut chart
function renderBudgetChart(text) {
  // Extract percentage lines like "50% → Rent" or "Rent: 40%"
  const lines   = text.split('\n');
  const labels  = [], data = [], colors = [
    '#8b7eff','#44d4be','#f472b6','#fbbf24','#4ade80','#f87171','#60a5fa','#a78bfa'
  ];
  const pctRe = /(\d+)%.*?([A-Za-z][\w ]*)|([A-Za-z][\w ]*).*?(\d+)%/; // [\w ]* not + to allow single-char labels
  lines.forEach(l => {
    const m = l.match(pctRe);
    if (!m) return;
    const pct  = parseInt(m[1] || m[4]);
    const name = (m[2] || m[3] || '').trim().replace(/[:\-→]/g,'').trim();
    if (pct > 0 && pct <= 100 && name) { data.push(pct); labels.push(name); }
  });
  if (data.length < 2) { toast('Could not find budget data to chart', 'tip'); return; }

  const c = document.getElementById('msgs');
  const wrap = document.createElement('div');
  wrap.style.cssText = 'background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:16px;margin:8px 0;max-width:400px';
  wrap.innerHTML = '<div style="font-size:12px;font-weight:600;color:#b0a4ff;margin-bottom:10px">📊 Budget Breakdown</div><canvas id="budget-chart" width="360" height="200"></canvas>';
  c.lastElementChild?.querySelector('.bub')?.appendChild(wrap);

  if (typeof Chart !== 'undefined') {
    new Chart(document.getElementById('budget-chart'), {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: colors.slice(0,data.length), borderWidth: 0 }] },
      options: {
        responsive: false,
        plugins: {
          legend: { position: 'right', labels: { color: '#8a8ca8', font: { size: 11, family: 'Plus Jakarta Sans' }, padding: 10 } }
        }
      }
    });
    toast('Budget chart rendered! 📊', 'ok');
  } else {
    toast('Chart.js not loaded yet — try again in a second', 'tip');
  }
}

// ── jsPDF — export any agent response as PDF ─────────────────
function exportAsPDF(btn) {
  const text = btn.closest('.bub')?.innerText || '';
  if (!text) { toast('Nothing to export', 'bad'); return; }

  if (typeof jspdf === 'undefined' && typeof window.jspdf === 'undefined') {
    toast('PDF library loading — try again in a second', 'tip');
    return;
  }

  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const chat = chats[activeId];
    const title = chat?.title || 'Arjun AI Export';

    // Header
    doc.setFont('helvetica','bold');
    doc.setFontSize(16);
    doc.setTextColor(80, 60, 200);
    doc.text('Arjun AI', 15, 18);

    doc.setFont('helvetica','normal');
    doc.setFontSize(11);
    doc.setTextColor(60, 60, 80);
    doc.text(title, 15, 26);

    doc.setFontSize(9);
    doc.setTextColor(150,150,150);
    doc.text('Generated: ' + new Date().toLocaleDateString('en-IN'), 15, 32);

    // Divider
    doc.setDrawColor(139, 126, 255);
    doc.setLineWidth(0.5);
    doc.line(15, 35, 195, 35);

    // Content — wrap long lines
    doc.setFont('helvetica','normal');
    doc.setFontSize(10);
    doc.setTextColor(30,30,50);
    const lines = doc.splitTextToSize(text, 175);
    doc.text(lines, 15, 43);

    // Footer
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(180,180,180);
      doc.text('Arjun AI · arjun-ai.app · Page ' + i + ' of ' + pageCount, 15, 290);
    }

    const filename = title.toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,40) + '.pdf';
    doc.save(filename);
    toast('PDF downloaded: ' + filename, 'ok');
  } catch(e) {
    console.error('[Arjun] PDF export failed:', e);
    toast('PDF export failed — try the ⬇ Download button instead', 'bad');
  }
}

// ── Bubble Renderer ──────────────────────────────────────────
function addBubble(role, text, time, anim, streaming = false, pinned = false) {
  const c   = document.getElementById('msgs');
  const msg = document.createElement('div');
  msg.className = 'msg ' + role + (pinned ? ' pinned' : '');
  if (!anim) msg.style.animation = 'none';

  const av       = document.createElement('div');
  av.className   = 'av ' + (role === 'bot' ? 'bav' : 'uav');
  av.textContent = role === 'bot' ? '🧠' : (userProfile().name || 'U').charAt(0).toUpperCase();

  const col = document.createElement('div'); col.className = 'mcol';

  if (pinned) {
    const pin = document.createElement('div'); pin.className = 'pin-indicator';
    pin.innerHTML = '📌 Pinned'; col.appendChild(pin);
  }

  const bub = document.createElement('div'); bub.className = 'bub';
  if (!streaming) { bub.innerHTML = fmt(text); addPreBtns(bub); }

  const meta = document.createElement('div'); meta.className = 'mmeta';
  meta.innerHTML = `<span class="mtime">${time || ''}</span>
    <button class="mact" onclick="cpBub(this)">📋 Copy</button>
    ${role === 'bot' ? `<button class="mact" onclick="regen(this)">🔄 Regen</button>
    <button class="mact" onclick="speakMsg(this)">🔊 Speak</button>` : ''}
    <button class="mact" onclick="editMsg(this)">✏️ Edit</button>
    <button class="mact pinned-btn${pinned ? ' active' : ''}" onclick="togglePin(this)">📌</button>`;

  col.appendChild(bub); col.appendChild(meta);
  msg.appendChild(av); msg.appendChild(col);
  c.appendChild(msg);
  if (document.getElementById('sa')?.checked) scrollBot();
  return msg;
}

function addPreBtns(bub) {
  bub.querySelectorAll('pre').forEach(pre => {
    if (pre.querySelector('.prehd')) return;
    const code = pre.querySelector('code');

    // Extract language from highlight.js class (hljs adds "language-xxx")
    // or from our own "lang-xxx" class (fallback parser)
    const cls  = code?.className || '';
    const lang = (cls.match(/language-(\w+)/) || cls.match(/lang-(\w+)/) || [])[1] || 'code';

    // Run button only makes sense for JS — browser can't execute other languages
    const jsLangs = ['javascript', 'js', 'typescript', 'ts'];
    const canRun  = jsLangs.includes(lang.toLowerCase());

    const h = document.createElement('div'); h.className = 'prehd';
    h.innerHTML = `<span class="prelang">${escH(lang)}</span>
      <div class="preacts">
        <button class="prebtn" onclick="cpCode(this)">📋 Copy</button>
        ${canRun
          ? `<button class="prebtn" onclick="runCode(this)">▶ Run</button>`
          : `<button class="prebtn" onclick="cantRun(this,'${escH(lang)}')" style="opacity:.5" title="Can only run JS in browser">▶ Run</button>`
        }
      </div>`;
    pre.insertBefore(h, pre.firstChild);

    // Apply highlight.js to the code block if not already highlighted
    if (typeof hljs !== 'undefined' && !code.classList.contains('hljs')) {
      hljs.highlightElement(code);
    }
  });
}

// ── Message Actions ──────────────────────────────────────────
function cpBub(btn) {
  const t = btn.closest('.mcol').querySelector('.bub').innerText;
  navigator.clipboard.writeText(t).then(() => { btn.textContent = '✅'; setTimeout(() => btn.textContent = '📋 Copy', 1600); });
}

function editMsg(btn) {
  const bub     = btn.closest('.mcol').querySelector('.bub');
  const msg     = btn.closest('.msg');
  const isUser  = msg.classList.contains('user');
  if (!isUser) { toast('Can only edit your own messages', 'tip'); return; }
  const original = bub.innerText;
  bub.setAttribute('contenteditable', 'true');
  bub.style.outline = '1px solid rgba(139,126,255,.5)';
  bub.focus();
  btn.textContent = '✅ Save';
  btn.onclick = () => {
    const newText = bub.innerText.trim();
    bub.removeAttribute('contenteditable'); bub.style.outline = '';
    btn.textContent = '✏️ Edit'; btn.onclick = () => editMsg(btn);
    if (newText && newText !== original) {
      const chat    = chats[activeId];
      const allMsgs = Array.from(document.getElementById('msgs').querySelectorAll('.msg'));
      const idx     = allMsgs.indexOf(msg);
      if (idx >= 0 && idx < chat.messages.length) {
        chat.messages[idx].content = newText;
        chat.messages = chat.messages.slice(0, idx + 1);
        while (msg.nextElementSibling) msg.nextElementSibling.remove();
        bub.innerHTML = fmt(newText);
        chat.messages.pop();
        document.getElementById('ui').value = newText;
        send(); save();
      }
    }
  };
}

function togglePin(btn) {
  const msg     = btn.closest('.msg');
  const chat    = chats[activeId];
  const allMsgs = Array.from(document.getElementById('msgs').querySelectorAll('.msg'));
  const idx     = allMsgs.indexOf(msg);
  if (idx >= 0 && idx < chat.messages.length) {
    chat.messages[idx].pinned = !chat.messages[idx].pinned;
    msg.classList.toggle('pinned', chat.messages[idx].pinned);
    btn.classList.toggle('active', chat.messages[idx].pinned);
    const ind = msg.querySelector('.pin-indicator');
    if (chat.messages[idx].pinned && !ind) {
      const p = document.createElement('div'); p.className = 'pin-indicator'; p.innerHTML = '📌 Pinned';
      msg.querySelector('.mcol').prepend(p);
    } else if (!chat.messages[idx].pinned && ind) { ind.remove(); }
    save();
    toast(chat.messages[idx].pinned ? 'Message pinned 📌' : 'Unpinned', 'tip');
  }
}

async function regen(btn) {
  const chat = chats[activeId]; if (!chat || loading) return;
  const ms   = chat.messages;
  if (ms[ms.length - 1]?.role === 'assistant') ms.pop();
  btn.closest('.msg').remove();
  const last = ms[ms.length - 1]; if (!last) return;
  if (!getApiKey()) { showKeySetup(); return; }
  const ts      = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateStr = formatDate(new Date());
  const tid     = showTyping(); loading = true; disableSend();
  document.getElementById('stop-btn').style.display = '';
  abortCtrl = new AbortController();
  try {
    const m = ms.map(x => ({ role: x.role, content: x.content }));
    await streamResp(getPrompt(), m, parseInt(document.getElementById('stok').value), tid, ts, dateStr, chat);
  } catch (e) {
    if (e.name !== 'AbortError') { rmTyping(tid); toast('Regen failed.', 'bad'); }
  } finally { loading = false; enableSend(); document.getElementById('stop-btn').style.display = 'none'; abortCtrl = null; save(); }
}

function speakMsg(btn) {
  const t = btn.closest('.mcol').querySelector('.bub').innerText;
  if (speechSynthesis.speaking) { speechSynthesis.cancel(); btn.textContent = '🔊 Speak'; return; }
  const u = new SpeechSynthesisUtterance(t); speechSynthesis.speak(u);
  btn.textContent = '⏹ Stop'; u.onend = () => btn.textContent = '🔊 Speak';
}

function cpCode(btn) {
  const code = btn.closest('pre').querySelector('code');
  navigator.clipboard.writeText(code.textContent).then(() => { btn.textContent = '✅'; setTimeout(() => btn.textContent = '📋 Copy', 1600); });
}
function runCode(btn) {
  const pre  = btn.closest('pre');
  const code = pre.querySelector('code');
  const lang = (code?.className?.match(/lang-(\w+)/) || [])[1] || 'js';
  const jsLangs = ['javascript', 'js', 'typescript', 'ts'];

  // Safety check — should never reach here for non-JS, but just in case
  if (!jsLangs.includes(lang.toLowerCase())) {
    cantRun(btn, lang);
    return;
  }

  try {
    const result = eval(code.textContent);
    const display = result === undefined ? '✅ Ran successfully (no return value)' : 'Result: ' + String(result).slice(0, 120);
    toast(display, 'ok');
  } catch (e) {
    toast('❌ JS Error: ' + e.message, 'bad');
  }
}

function cantRun(btn, lang) {
  // Explain clearly why this language can't run in the browser
  const msgs = {
    python:     '🐍 Python needs a Python interpreter — copy the code and run it in your terminal or replit.com',
    py:         '🐍 Python needs a Python interpreter — copy the code and run it in your terminal or replit.com',
    java:       '☕ Java needs the JDK installed — copy and run in your IDE or replit.com',
    cpp:        '⚙️ C++ needs a compiler — copy and run in your IDE or replit.com',
    c:          '⚙️ C needs a compiler — copy and run in your IDE or replit.com',
    bash:       '💻 Bash runs in a terminal — copy and paste it in your terminal',
    shell:      '💻 Shell runs in a terminal — copy and paste it in your terminal',
    sh:         '💻 Shell runs in a terminal — copy and paste it in your terminal',
    sql:        '🗄️ SQL needs a database — try it on db-fiddle.com',
    go:         '🐹 Go needs the Go compiler — try it on go.dev/play',
    rust:       '🦀 Rust needs the Rust compiler — try it on play.rust-lang.org',
    kotlin:     '📱 Kotlin needs the JVM — try it on play.kotlinlang.org',
    swift:      '🍎 Swift needs Xcode — try it on swift.godbolt.org',
    php:        '🐘 PHP needs a PHP server — try it on onlinephp.io',
    ruby:       '💎 Ruby needs a Ruby interpreter — try it on replit.com',
    r:          '📊 R needs an R interpreter — try it on rdrr.io',
  };
  const key = (lang || '').toLowerCase();
  const msg = msgs[key] || `⚠️ "${lang}" can't run in the browser — copy the code and run it in the right environment`;
  toast(msg, 'tip');
}

// ── Voice Input ──────────────────────────────────────────────
function toggleVoice() {
  const btn = document.getElementById('micbtn');
  if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) { toast('Voice requires Chrome!', 'bad'); return; }
  if (recording) { recog?.stop(); return; }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  recog = new SR(); recog.lang = 'en-IN'; recog.interimResults = true;
  recog.onstart  = () => { recording = true;  btn.classList.add('rec');    toast('🎙 Listening…', 'tip'); };
  recog.onresult = e  => { document.getElementById('ui').value = Array.from(e.results).map(r => r[0].transcript).join(''); };
  recog.onend    = () => { recording = false; btn.classList.remove('rec'); };
  recog.onerror  = () => { recording = false; btn.classList.remove('rec'); toast('Voice error.', 'bad'); };
  recog.start();
}

// ── File Upload ──────────────────────────────────────────────
function handleFiles(input) {
  Array.from(input.files).forEach(f => {
    const r = new FileReader();
    r.onload = e => { attachedFiles.push({ name: f.name, content: e.target.result }); renderFileTray(); };
    r.readAsText(f);
  });
  input.value = '';
}
function renderFileTray() {
  const p = document.getElementById('ftray'); p.innerHTML = '';
  attachedFiles.forEach((f, i) => {
    const t = document.createElement('div'); t.className = 'ftag';
    t.innerHTML = `📄 ${escH(f.name)} <button class="ftagrm" onclick="rmFile(${i})">×</button>`;
    p.appendChild(t);
  });
  p.classList.toggle('on', attachedFiles.length > 0);
}
function rmFile(i) { attachedFiles.splice(i, 1); renderFileTray(); }

// ── Image Analysis ───────────────────────────────────────────
function resetImgDrop() {
  document.getElementById('imgdrop').innerHTML =
    `<div style="font-size:28px">🖼</div><div style="font-size:13px;color:var(--s)">Click or paste (Ctrl+V) to upload</div><div style="font-size:11px;color:var(--d)">JPG · PNG · GIF · WEBP</div>`;
  const fi = document.getElementById('imgfile'); if (fi) fi.value = '';
  document.getElementById('imgq').value = '';
}
function previewImg(input) { const f = input.files[0]; if (!f) return; processImgFile(f); }
function analyzeImg() {
  if (!imgData) { toast('Upload an image first!', 'bad'); return; }
  const q = document.getElementById('imgq').value.trim() || 'Describe and analyze this image in detail.';
  document.getElementById('ui').value = q;
  closeM('imgm'); send();
}

// ── Search ───────────────────────────────────────────────────
function toggleSearch() {
  const w = document.getElementById('srchwrap');
  w.classList.toggle('on');
  if (w.classList.contains('on')) document.getElementById('srchin').focus();
  else { document.getElementById('srchin').value = ''; clearHL(); }
}
// Debounced search — waits 300ms after user stops typing before running
// Prevents janky DOM manipulation on every single keystroke
const doSearch = debounce(function(q) {
  clearHL(); if (!q.trim()) return;
  const re = new RegExp(`(${escRe(q)})`, 'gi'); let n = 0;
  document.querySelectorAll('.bub').forEach(b => {
    if (b.textContent.toLowerCase().includes(q.toLowerCase())) {
      b.innerHTML = b.innerHTML.replace(re, '<mark class="hl">$1</mark>'); n++;
    }
  });
  document.querySelector('mark.hl')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  toast(`Found in ${n} message(s)`, n > 0 ? 'ok' : 'tip');
}, 300);
function clearHL() {
  document.querySelectorAll('mark.hl').forEach(m => {
    const p = m.parentNode; if (!p) return;
    p.replaceChild(document.createTextNode(m.textContent), m); p.normalize();
  });
}

// ── Export Chat ──────────────────────────────────────────────
function exportChat(format = 'md') {
  const chat = chats[activeId];
  if (!chat || !chat.messages.length) { toast('Nothing to export!', 'bad'); return; }

  let blob, filename;

  if (format === 'json') {
    // JSON export — useful for developers, data analysis, re-importing
    const data = {
      title:     chat.title,
      exported:  new Date().toISOString(),
      model:     typeof MODEL !== 'undefined' ? MODEL : 'groq',
      agent:     chat.agent || null,
      mode:      chat.mode  || 'chat',
      messages:  chat.messages.map(m => ({
        role:    m.role,
        content: m.content,
        time:    m.time  || '',
        date:    m.date  || '',
        pinned:  m.pinned || false
      }))
    };
    blob     = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    filename = `arjun-${Date.now()}.json`;
  } else {
    // Markdown export — human-readable
    let md = `# ${chat.title}\n_Arjun AI v7.0 · ${new Date().toLocaleDateString('en-IN')}_\n\n`;
    chat.messages.forEach(m => {
      md += `## ${m.role === 'user' ? '👤 You' : '🧠 Arjun'} · ${m.time || ''}\n${m.content}\n\n---\n\n`;
    });
    blob     = new Blob([md], { type: 'text/markdown' });
    filename = `arjun-${Date.now()}.md`;
  }

  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast(`Exported as ${filename}`, 'ok');
}

async function clearAll() {
  if (!confirm('Clear all chats? This cannot be undone.')) return;
  await clearAllChats();  // clears IndexedDB + chats object
  totalTok = 0; updateTok(); newChat(); save(); toast('Cleared.', 'tip');
}

// ── DOM Helpers ──────────────────────────────────────────────
function showTyping() {
  const id = 't' + Date.now(), c = document.getElementById('msgs');
  const el = document.createElement('div'); el.className = 'msg bot'; el.id = id;
  el.innerHTML = `<div class="av bav">🧠</div><div class="mcol"><div class="bub">
    <div class="typing"><span></span><span></span><span></span>
    <span class="typing-time" id="tt-${id}">0s</span></div></div></div>`;
  c.appendChild(el); scrollBot();
  typingStart = Date.now();
  typingTimer = setInterval(() => {
    const el2 = document.getElementById('tt-' + id);
    if (el2) el2.textContent = Math.floor((Date.now() - typingStart) / 1000) + 's';
  }, 1000);
  return id;
}
function rmTyping(id) {
  document.getElementById(id)?.remove();
  if (typingTimer) { clearInterval(typingTimer); typingTimer = null; }
}
function scrollBot()    { const c = document.getElementById('msgs'); c.scrollTop = c.scrollHeight; onMsgsScroll(); }
function enableSend()   { const b = document.getElementById('sndbtn'); if (b) b.disabled = false; }
function disableSend()  { const b = document.getElementById('sndbtn'); if (b) b.disabled = true;  }
function openM(id)      { document.getElementById(id)?.classList.add('on');    }
function closeM(id)     { document.getElementById(id)?.classList.remove('on'); }
function onKey(e)       { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }
function onInp(el)      { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 140) + 'px'; updateCharCount(el.value.length); }
function updateCharCount(n) {
  const el = document.getElementById('charct'); if (!el) return;
  el.textContent = n + ' / 4000'; el.classList.toggle('on', n > 0);
  el.style.color = n > 3500 ? 'var(--err)' : 'var(--d)';
}
function updateTok() {
  const el = document.getElementById('tokpill'); if (!el) return;
  el.textContent = (totalTok > 999 ? (totalTok / 1000).toFixed(1) + 'k' : totalTok) + ' tokens';
}
function chime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o   = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = 880; g.gain.setValueAtTime(.07, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .25);
    o.start(); o.stop(ctx.currentTime + .25);
  } catch (e) { /* Audio not available */ }
}
function toast(msg, type = 'tip') {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'toast show ' + type;
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 3000);
}

// ── Utility Functions ────────────────────────────────────────
function escH(s)  { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// debounce — delays fn execution until user stops calling it for `ms` milliseconds
// Used for search to avoid firing on every keystroke
function debounce(fn, ms) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}

// ── Global Error Boundary ────────────────────────────────────
// Catches unhandled JS errors and promise rejections
// so the app doesn't silently break
window.onerror = function(msg, src, line, col, err) {
  console.error('[Arjun] Unhandled error:', err || msg);
  toast('Something went wrong — check the console (F12)', 'bad');
  return false; // don't suppress default browser error handling
};
window.onunhandledrejection = function(e) {
  if (e.reason?.name === 'AbortError') return; // ignore intentional abort
  console.error('[Arjun] Unhandled promise rejection:', e.reason);
};

// ── Markdown Parser — powered by marked.js + highlight.js ────
// Replaces the old 50-line custom parser.
// marked.js: battle-tested, handles all edge cases correctly
// highlight.js: real syntax highlighting for 190+ languages
(function setupMarked() {
  if (typeof marked === 'undefined') return;
  // marked v9 removed setOptions({highlight}) — must use marked.setOptions without highlight
  // Syntax highlighting is applied AFTER rendering via hljs.highlightElement in addPreBtns
  marked.setOptions({
    breaks:   true,   // single newline = <br>
    gfm:      true,   // GitHub-flavoured markdown
    pedantic: false
    // NOTE: highlight option was removed in marked v9.
    // We apply hljs.highlightElement() in addPreBtns() instead — correct approach.
  });
})();

function fmt(text) {
  if (!text) return '';

  // Use marked.js if available (loaded from CDN)
  if (typeof marked !== 'undefined') {
    try { return marked.parse(text); } catch (_) { /* fall through */ }
  }

  // Fallback: minimal parser if CDN is unavailable (offline mode)
  const escH = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const blocks = [];
  let s = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    blocks.push({ lang: lang || 'text', code: code.trim() });
    return '\x00C' + (blocks.length - 1) + '\x00';
  });
  s = escH(s);
  s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
  s = s.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  s = s.replace(/^\d+\. (.+)$/gm, '<OLI>$1</OLI>');
  s = s.replace(/^[•\-\*] (.+)$/gm, '<ULI>$1</ULI>');
  s = s.replace(/(<OLI>[\s\S]*?<\/OLI>)(\s*<OLI>[\s\S]*?<\/OLI>)*/g, m =>
    '<ol>' + m.replace(/<OLI>([\s\S]*?)<\/OLI>/g, '<li>$1</li>') + '</ol>');
  s = s.replace(/(<ULI>[\s\S]*?<\/ULI>)(\s*<ULI>[\s\S]*?<\/ULI>)*/g, m =>
    '<ul>' + m.replace(/<ULI>([\s\S]*?)<\/ULI>/g, '<li>$1</li>') + '</ul>');
  s = s.replace(/\x00C(\d+)\x00/g, (_, i) => {
    const { lang, code } = blocks[parseInt(i)];
    return '<pre><code class="lang-' + escH(lang) + '">' + escH(code) + '</code></pre>';
  });
  return s;
}
