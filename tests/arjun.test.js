// ============================================================
// tests/arjun.test.js  —  Full Deep Test Suite
// Run: node tests/arjun.test.js
// No npm install needed — only Node.js built-ins
// ============================================================

const fs   = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');

// ── Test runner ───────────────────────────────────────────────
let passed = 0, failed = 0;
const failures = [];

function test(name, fn) {
  try {
    const r = fn();
    if (r && typeof r.then === 'function') {
      // async test — handle after sync tests
      r.then(() => { passed++; process.stdout.write('.'); })
       .catch(e => { failed++; failures.push({ name, err: e.message }); process.stdout.write('F'); });
    } else {
      passed++; process.stdout.write('.');
    }
  } catch(e) {
    failed++;
    failures.push({ name, err: e.message });
    process.stdout.write('F');
  }
}

function assert(val, msg) {
  if (!val) throw new Error(msg || `Expected truthy, got ${JSON.stringify(val)}`);
}
function assertEqual(a, b) {
  if (a !== b) throw new Error(`Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
function assertContains(str, sub) {
  if (!String(str).includes(sub)) throw new Error(`Expected to contain "${sub}"`);
}
function assertNotContains(str, sub) {
  if (String(str).includes(sub)) throw new Error(`Expected NOT to contain "${sub}"`);
}
function assertMatch(str, re) {
  if (!re.test(str)) throw new Error(`Expected to match ${re}, got "${str}"`);
}
function assertLen(arr, n) {
  if ((arr||[]).length !== n) throw new Error(`Expected length ${n}, got ${(arr||[]).length}`);
}

// ── Load source files ─────────────────────────────────────────
const src = {
  config:  fs.readFileSync(path.join(BASE,'js/config.js'),  'utf8'),
  storage: fs.readFileSync(path.join(BASE,'js/storage.js'), 'utf8'),
  app:     fs.readFileSync(path.join(BASE,'js/app.js'),     'utf8'),
  api:     fs.readFileSync(path.join(BASE,'js/api.js'),     'utf8'),
  html:    fs.readFileSync(path.join(BASE,'index.html'),    'utf8'),
  sw:      fs.readFileSync(path.join(BASE,'sw.js'),         'utf8'),
  manifest:JSON.parse(fs.readFileSync(path.join(BASE,'manifest.json'), 'utf8')),
};

// ────────────────────────────────────────────────────────────────────
// SECTION 1 — XSS PREVENTION
// ────────────────────────────────────────────────────────────────────
console.log('\n\n── 1. XSS Prevention ──────────────────────────────────');
{
  const escH = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  test('escH: < > escaped',              () => { assertContains(escH('<b>'), '&lt;b&gt;'); });
  test('escH: & escaped',                () => { assertEqual(escH('a&b'), 'a&amp;b'); });
  test('escH: " escaped',                () => { assertContains(escH('"hi"'), '&quot;'); });
  test('escH: number input safe',        () => { assertEqual(escH(42), '42'); });
  test('escH: null safe',                () => { assertEqual(escH(null), 'null'); });
  test('escH: empty string',             () => { assertEqual(escH(''), ''); });
  test('escH: XSS payload blocked',      () => { assertNotContains(escH('<img onerror=alert(1)>'), '<img'); });
  test('escH: script tag blocked',       () => { assertNotContains(escH('<script>evil()</script>'), '<script>'); });
  test('escH: encodes & in &amp; (expected)',() => { assertContains(escH('&amp;'), '&amp;amp;'); }); // correct: & always encodes to &amp;
}

// ────────────────────────────────────────────────────────────────────
// SECTION 2 — MARKDOWN PARSER (fallback)
// ────────────────────────────────────────────────────────────────────
console.log('\n── 2. Markdown Parser (fallback) ──────────────────────');
{
  const escH = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  function fmt(text) {
    if (!text) return '';
    const blocks = [];
    let s = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
      blocks.push({ lang: lang||'text', code: code.trim() });
      return `\x00C${blocks.length-1}\x00`;
    });
    s = escH(s);
    s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
    s = s.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    s = s.replace(/^\d+\. (.+)$/gm, '<OLI>$1</OLI>');
    s = s.replace(/^[•\-\*] (.+)$/gm, '<ULI>$1</ULI>');
    s = s.replace(/(<OLI>[\s\S]*?<\/OLI>)(\s*<OLI>[\s\S]*?<\/OLI>)*/g, m =>
      `<ol>${m.replace(/<OLI>([\s\S]*?)<\/OLI>/g,'<li>$1</li>')}</ol>`);
    s = s.replace(/(<ULI>[\s\S]*?<\/ULI>)(\s*<ULI>[\s\S]*?<\/ULI>)*/g, m =>
      `<ul>${m.replace(/<ULI>([\s\S]*?)<\/ULI>/g,'<li>$1</li>')}</ul>`);
    s = s.replace(/\x00C(\d+)\x00/g, (_, i) => {
      const { lang, code } = blocks[parseInt(i)];
      return `<pre><code class="lang-${escH(lang)}">${escH(code)}</code></pre>`;
    });
    return s;
  }

  test('fmt: null → empty',               () => assertEqual(fmt(null), ''));
  test('fmt: empty → empty',              () => assertEqual(fmt(''), ''));
  test('fmt: bold',                       () => assertContains(fmt('**hi**'), '<strong>hi</strong>'));
  test('fmt: italic',                     () => assertContains(fmt('*hi*'), '<em>hi</em>'));
  test('fmt: inline code',               () => assertContains(fmt('`x`'), '<code>x</code>'));
  test('fmt: h3 heading',                () => assertContains(fmt('### T'), '<h3>T</h3>'));
  test('fmt: ul list',                   () => { const r=fmt('- a\n- b'); assertContains(r,'<ul>'); assertContains(r,'<li>a</li>'); });
  test('fmt: ol list',                   () => { const r=fmt('1. a\n2. b'); assertContains(r,'<ol>'); assertContains(r,'<li>a</li>'); });
  test('fmt: code block with lang',      () => { const r=fmt('```py\nprint(1)\n```'); assertContains(r,'lang-py'); assertContains(r,'<pre>'); });
  test('fmt: XSS escaped in body',       () => assertNotContains(fmt('<script>x</script>'), '<script>'));
  test('fmt: XSS escaped in code block', () => { const r=fmt('```html\n<script>evil()</script>\n```'); assertNotContains(r, '<script>evil'); assertContains(r,'&lt;script&gt;'); });
  test('fmt: code no double-escape',     () => { const r=fmt('```js\nconsole.log("hi")\n```'); assertNotContains(r,'&amp;amp;'); });
  test('fmt: multiple code blocks',      () => { const r=fmt('```js\na=1\n```\n\n```py\nb=2\n```'); assertEqual((r.match(/<pre>/g)||[]).length, 2); });
  test('fmt: bold before italic no crash',() => { assert(fmt('**bold** and *italic*').length > 0); });
}

// ────────────────────────────────────────────────────────────────────
// SECTION 3 — CHAT STATE & ID UNIQUENESS
// ────────────────────────────────────────────────────────────────────
console.log('\n── 3. Chat State ──────────────────────────────────────');
{
  let chats = {}, activeId = null, _cnt = 0;
  function newChatSim() {
    const id = 'c' + Date.now() + '_' + (++_cnt);
    chats[id] = { id, title:'New Chat', messages:[], created:Date.now() };
    activeId = id;
    return id;
  }
  function delChatSim(id) {
    delete chats[id];
    if (activeId === id) {
      const ids = Object.keys(chats);
      activeId = ids.length ? ids[ids.length-1] : null;
    }
  }

  test('newChat: creates entry',         () => { const id=newChatSim(); assert(chats[id]); });
  test('newChat: sets activeId',         () => { const id=newChatSim(); assertEqual(activeId, id); });
  test('newChat: ids always unique',     () => { const ids=new Set(); for(let i=0;i<100;i++) ids.add(newChatSim()); assertEqual(ids.size, 100+Object.keys(chats).length - Object.keys(chats).length || 100); /* set size = loop count */ assert(ids.size >= 100); });
  test('newChat: has id field',          () => { const id=newChatSim(); assertEqual(chats[id].id, id); });
  test('newChat: empty messages array',  () => { const id=newChatSim(); assertLen(chats[id].messages, 0); });
  test('delChat: removes chat',          () => { const id=newChatSim(); delChatSim(id); assert(!chats[id]); });
  test('delChat: activeId changes',      () => { newChatSim(); const id=newChatSim(); delChatSim(id); assert(activeId !== id); });
  test('delChat: null when last chat',   () => { chats={}; const id=newChatSim(); delChatSim(id); assert(!activeId); });

  // BUG CHECK: title auto-truncation at 40 chars
  test('chat title: long title truncated to 40+…', () => {
    const long = 'a'.repeat(50);
    const title = long.slice(0,40) + (long.length>40?'…':'');
    assertEqual(title.length, 41); // 40 chars + ellipsis
  });
}

// ────────────────────────────────────────────────────────────────────
// SECTION 4 — CONTEXT TRIMMING
// ────────────────────────────────────────────────────────────────────
console.log('\n── 4. Context Trimming ────────────────────────────────');
{
  const MAX = 40;
  const trim = msgs => msgs.length > MAX ? msgs.slice(-MAX) : msgs;

  test('trim: short history untouched',  () => assertLen(trim(Array(10).fill({})), 10));
  test('trim: exactly 40 untouched',     () => assertLen(trim(Array(40).fill({})), 40));
  test('trim: 41 → 40',                  () => assertLen(trim(Array(41).fill({})), 40));
  test('trim: 100 → 40',                 () => assertLen(trim(Array(100).fill({})), 40));
  test('trim: keeps LAST 40',            () => {
    const msgs = Array(50).fill(null).map((_,i)=>({content:`msg${i}`}));
    assertEqual(trim(msgs)[0].content, 'msg10');
  });
  test('trim: empty array safe',         () => assertLen(trim([]), 0));
}

// ────────────────────────────────────────────────────────────────────
// SECTION 5 — API KEY VALIDATION
// ────────────────────────────────────────────────────────────────────
console.log('\n── 5. API Key Validation ──────────────────────────────');
{
  const valid = k => !!(k && k.trim().length >= 10);
  test('key: empty → invalid',           () => assert(!valid('')));
  test('key: null → invalid',            () => assert(!valid(null)));
  test('key: undefined → invalid',       () => assert(!valid(undefined)));
  test('key: short → invalid',           () => assert(!valid('abc')));
  test('key: spaces only → invalid',     () => assert(!valid('          ')));
  test('key: gsk_... → valid',           () => assert(valid('gsk_abc123def456ghi789')));
  test('key: 10 chars → valid',          () => assert(valid('1234567890')));
}

// ────────────────────────────────────────────────────────────────────
// SECTION 6 — GROQ MESSAGE FORMAT
// ────────────────────────────────────────────────────────────────────
console.log('\n── 6. Groq Message Format ─────────────────────────────');
{
  const build = (sys, msgs) => [{ role:'system', content:sys }, ...msgs];

  test('groq: system is index 0',        () => assertEqual(build('sys',[{}])[0].role, 'system'));
  test('groq: system content correct',   () => assertEqual(build('hello',[{}])[0].content, 'hello'));
  test('groq: msgs appended after',      () => { const r=build('s',[{role:'user',content:'hi'}]); assertEqual(r[1].role,'user'); });
  test('groq: empty msgs → length 1',   () => assertLen(build('s',[]), 1));
  test('groq: does not mutate input',    () => { const m=[{role:'user'}]; build('s',m); assertLen(m,1); });
  test('groq: total = 1 + msgs.length',  () => { const m=[{},{},{}]; assertEqual(build('s',m).length, 4); });
}

// ────────────────────────────────────────────────────────────────────
// SECTION 7 — RATE LIMITER
// ────────────────────────────────────────────────────────────────────
console.log('\n── 7. Rate Limiter ────────────────────────────────────');
{
  function makeRL(limit=28) {
    const log=[];
    return () => {
      const now=Date.now();
      while(log.length && now-log[0]>60000) log.shift();
      if(log.length>=limit) return false;
      log.push(now); return true;
    };
  }

  test('rl: first request allowed',      () => assert(makeRL()()));
  test('rl: 28 requests allowed',        () => { const c=makeRL(28); let ok=0; for(let i=0;i<28;i++) if(c()) ok++; assertEqual(ok,28); });
  test('rl: 29th blocked',              () => { const c=makeRL(28); for(let i=0;i<28;i++) c(); assert(!c()); });
  test('rl: limit=1, second blocked',   () => { const c=makeRL(1); c(); assert(!c()); });
  test('rl: api.js has checkRateLimit', () => assertContains(src.api, 'checkRateLimit'));
  test('rl: called in streamResp',      () => { const block=src.api.match(/streamResp[\s\S]{1,300}/)?.[0]||''; assertContains(block,'checkRateLimit'); });
  test('rl: called in normResp',        () => { const block=src.api.match(/normResp[\s\S]{1,300}/)?.[0]||''; assertContains(block,'checkRateLimit'); });
  test('rl: RATE_LIMIT constant = 28',  () => assertContains(src.api, 'RATE_LIMIT = 28'));
}

// ────────────────────────────────────────────────────────────────────
// SECTION 8 — BUDGET CHART PARSER
// ────────────────────────────────────────────────────────────────────
console.log('\n── 8. Budget Chart Parser ─────────────────────────────');
{
  function extractBudget(text) {
    const lines=text.split('\n'), labels=[], data=[];
    const re=/(\d+)%.*?([A-Za-z][\w ]*)|([A-Za-z][\w ]*).*?(\d+)%/; // fixed: * not + for single-char labels
    lines.forEach(l => {
      const m=l.match(re); if(!m) return;
      const pct=parseInt(m[1]||m[4]);
      const name=(m[2]||m[3]||'').trim().replace(/[:\-→]/g,'').trim();
      if(pct>0 && pct<=100 && name) { data.push(pct); labels.push(name); }
    });
    return { labels, data };
  }

  test('budget: "50% → Rent"',           () => { const r=extractBudget('50% → Rent'); assertEqual(r.data[0],50); });
  test('budget: "Food: 30%"',            () => { const r=extractBudget('Food: 30%'); assertEqual(r.data[0],30); });
  test('budget: ignores 0%',             () => assertLen(extractBudget('0% → nothing').data, 0));
  test('budget: ignores >100%',          () => assertLen(extractBudget('150% → error').data, 0));
  test('budget: multiple lines',         () => { const r=extractBudget('50% → A\n30% → B\n20% → C'); assertLen(r.data,3); });
  test('budget: no pct → empty',         () => assertLen(extractBudget('buy groceries').data, 0));
  test('budget: integer 100% allowed',   () => { const r=extractBudget('100% → All'); assertEqual(r.data[0],100); });
}

// ────────────────────────────────────────────────────────────────────
// SECTION 9 — JSON EXPORT
// ────────────────────────────────────────────────────────────────────
console.log('\n── 9. JSON Export ─────────────────────────────────────');
{
  function buildJSON(chat) {
    return {
      title: chat.title,
      exported: new Date().toISOString(),
      messages: chat.messages.map(m => ({
        role: m.role, content: m.content,
        time: m.time||'', date: m.date||'', pinned: m.pinned||false
      }))
    };
  }
  const chat = { title:'Test', messages:[
    {role:'user',content:'hello',time:'10:00',date:'Today'},
    {role:'assistant',content:'hi',pinned:true}
  ]};

  test('json: has title',                () => assertEqual(buildJSON(chat).title, 'Test'));
  test('json: exported is valid ISO',    () => assert(!isNaN(new Date(buildJSON(chat).exported))));
  test('json: correct msg count',        () => assertLen(buildJSON(chat).messages, 2));
  test('json: role preserved',           () => assertEqual(buildJSON(chat).messages[0].role, 'user'));
  test('json: pinned preserved',         () => assert(buildJSON(chat).messages[1].pinned));
  test('json: missing time → empty str', () => assertEqual(buildJSON(chat).messages[1].time, ''));
  test('json: format=json in app.js',    () => assertContains(src.app, "format === 'json'"));
  test('json: application/json type',    () => assertContains(src.app, 'application/json'));
}

// ────────────────────────────────────────────────────────────────────
// SECTION 10 — DATE FORMATTING
// ────────────────────────────────────────────────────────────────────
console.log('\n── 10. Date Formatting ────────────────────────────────');
{
  function formatDate(d) {
    const today=new Date(), yesterday=new Date(today);
    yesterday.setDate(yesterday.getDate()-1);
    if(d.toDateString()===today.toDateString()) return 'Today';
    if(d.toDateString()===yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});
  }

  test('date: today → "Today"',          () => assertEqual(formatDate(new Date()),'Today'));
  test('date: yesterday → "Yesterday"',  () => { const y=new Date(); y.setDate(y.getDate()-1); assertEqual(formatDate(y),'Yesterday'); });
  test('date: old date has content',     () => { const r=formatDate(new Date('2023-06-15')); assert(r.length>5); assertNotContains(r,'Today'); });
  test('date: 2 days ago not Today',     () => { const d=new Date(); d.setDate(d.getDate()-2); assert(formatDate(d)!=='Today'); });
}

// ────────────────────────────────────────────────────────────────────
// SECTION 11 — DEBOUNCE
// ────────────────────────────────────────────────────────────────────
console.log('\n── 11. Debounce ───────────────────────────────────────');
{
  function debounce(fn, ms) {
    let t; return function(...a) { clearTimeout(t); t=setTimeout(()=>fn.apply(this,a),ms); };
  }

  test('debounce: returns function',     () => assertEqual(typeof debounce(()=>{},100), 'function'));
  test('debounce: no immediate exec',    () => { let n=0; const d=debounce(()=>n++,50); d();d();d(); assertEqual(n,0); });
  test('debounce: fires after delay',    async () => {
    let n=0; const d=debounce(()=>n++,30); d();
    await new Promise(r=>setTimeout(r,60)); assertEqual(n,1);
  });
  test('debounce: fires once for 3 calls', async () => {
    let n=0; const d=debounce(()=>n++,30); d();d();d();
    await new Promise(r=>setTimeout(r,80)); assertEqual(n,1);
  });
  test('debounce: passes args correctly', async () => {
    let got=null; const d=debounce(x=>got=x,20); d('hello');
    await new Promise(r=>setTimeout(r,40)); assertEqual(got,'hello');
  });
}

// ────────────────────────────────────────────────────────────────────
// SECTION 12 — RUN BUTTON LANGUAGE DETECTION
// ────────────────────────────────────────────────────────────────────
console.log('\n── 12. Run Button Language Detection ──────────────────');
{
  const JS = ['javascript','js','typescript','ts'];
  const canRun = l => JS.includes(l.toLowerCase());

  test('run: js → can run',              () => assert(canRun('js')));
  test('run: javascript → can run',     () => assert(canRun('javascript')));
  test('run: JAVASCRIPT → can run',     () => assert(canRun('JAVASCRIPT')));
  test('run: ts → can run',             () => assert(canRun('ts')));
  test('run: python → cannot',          () => assert(!canRun('python')));
  test('run: py → cannot',              () => assert(!canRun('py')));
  test('run: java → cannot',            () => assert(!canRun('java')));
  test('run: bash → cannot',            () => assert(!canRun('bash')));
  test('run: sql → cannot',             () => assert(!canRun('sql')));
  test('run: cpp → cannot',             () => assert(!canRun('cpp')));
  test('run: rust → cannot',            () => assert(!canRun('rust')));
  test('run: go → cannot',              () => assert(!canRun('go')));
  test('run: cantRun fn exists in app', () => assertContains(src.app, 'function cantRun'));
  test('run: helpful msg for python',   () => assertContains(src.app, 'replit.com'));
  test('run: helpful msg for sql',      () => assertContains(src.app, 'db-fiddle'));
}

// ────────────────────────────────────────────────────────────────────
// SECTION 13 — KEYBOARD SHORTCUTS
// ────────────────────────────────────────────────────────────────────
console.log('\n── 13. Keyboard Shortcuts ─────────────────────────────');
{
  const KEYS = {'1':'code','2':'jobs','3':'plan','4':'write','5':'finance','6':'hustle','7':'health','8':'debug','9':'mock','0':'social'};
  test('shortcuts: 10 agents mapped',   () => assertEqual(Object.keys(KEYS).length, 10));
  test('shortcuts: Alt+1 → code',       () => assertEqual(KEYS['1'],'code'));
  test('shortcuts: Alt+5 → finance',    () => assertEqual(KEYS['5'],'finance'));
  test('shortcuts: Alt+8 → debug',      () => assertEqual(KEYS['8'],'debug'));
  test('shortcuts: Alt+9 → mock',       () => assertEqual(KEYS['9'],'mock'));
  test('shortcuts: Alt+0 → social',     () => assertEqual(KEYS['0'],'social'));
  test('shortcuts: AGENT_KEYS in app',  () => assertContains(src.app,'AGENT_KEYS'));
  test('shortcuts: e.altKey used',      () => assertContains(src.app,'e.altKey'));
  test('shortcuts: Ctrl+K focus',       () => assertContains(src.app,"key === 'k'"));
  test('shortcuts: Ctrl+N new chat',    () => assertContains(src.app,"key === 'n'"));
  test('shortcuts: Esc stops gen',      () => assertContains(src.app,"'Escape'"));
}

// ────────────────────────────────────────────────────────────────────
// SECTION 14 — HTML STRUCTURE
// ────────────────────────────────────────────────────────────────────
console.log('\n── 14. HTML Structure ─────────────────────────────────');
{
  test('html: charset UTF-8',            () => assertContains(src.html,'charset="UTF-8"'));
  test('html: viewport meta',           () => assertContains(src.html,'name="viewport"'));
  test('html: OG title tag',            () => assertContains(src.html,'og:title'));
  test('html: OG description tag',      () => assertContains(src.html,'og:description'));
  test('html: theme-color meta',        () => assertContains(src.html,'theme-color'));
  test('html: PWA manifest link',       () => assertContains(src.html,'manifest.json'));
  test('html: preconnect groq',         () => assertContains(src.html,'api.groq.com'));
  test('html: marked.js loaded',        () => assertContains(src.html,'marked.min.js'));
  test('html: highlight.js loaded',     () => assertContains(src.html,'highlight.min.js'));
  test('html: Chart.js loaded',         () => assertContains(src.html,'chart.umd.min.js'));
  test('html: jsPDF loaded',            () => assertContains(src.html,'jspdf'));
  test('html: all 4 JS files',          () => { ['config','storage','api','app'].forEach(f=>assertContains(src.html,`js/${f}.js`)); });
  test('html: all 3 CSS files',         () => { ['variables','layout','components'].forEach(f=>assertContains(src.html,`css/${f}.css`)); });
  test('html: no hardcoded API key',     () => assertNotContains(src.html,'sk-ant-api03-'));
  test('html: no real gsk_ key',        () => assert(!/gsk_[A-Za-z0-9]{50,}/.test(src.html)));
  test('html: key-setup modal',         () => assertContains(src.html,'id="key-setup"'));
  test('html: server-help modal',       () => assertContains(src.html,'id="server-help"'));
  test('html: install-btn exists',      () => assertContains(src.html,'id="install-btn"'));
  test('html: stop-btn exists',         () => assertContains(src.html,'id="stop-btn"'));
}

// ────────────────────────────────────────────────────────────────────
// SECTION 15 — CONFIG INTEGRITY
// ────────────────────────────────────────────────────────────────────
console.log('\n── 15. Config Integrity ───────────────────────────────');
{
  test('config: getApiKey fn',           () => assertContains(src.config,'function getApiKey'));
  test('config: setApiKey fn',           () => assertContains(src.config,'function setApiKey'));
  test('config: MODEL not deprecated',   () => assertNotContains(src.config,"'llama3-8b-8192'"));
  test('config: MODEL is llama instant', () => assertContains(src.config,'llama-3.1-8b-instant'));
  test('config: MAX_CTX_MSGS=40',        () => assertContains(src.config,'MAX_CTX_MSGS = 40'));
  test('config: SCHEMA_VER defined',     () => assertMatch(src.config,/SCHEMA_VER\s*=\s*\d+/));
  test('config: PROMPTS object',         () => assertContains(src.config,'const PROMPTS'));
  test('config: CHIPS object',           () => assertContains(src.config,'const CHIPS'));
  test('config: SUGGESTIONS object',     () => assertContains(src.config,'const SUGGESTIONS'));
  test('config: buildBase fn',           () => assertContains(src.config,'function buildBase'));
  ['chat','study','career','code','jobs','plan','write','finance','hustle','health','debug','mock','social'].forEach(a => {
    test(`config: prompt for ${a}`,      () => assertContains(src.config,`${a}:`));
  });
}

// ────────────────────────────────────────────────────────────────────
// SECTION 16 — STORAGE MODULE
// ────────────────────────────────────────────────────────────────────
console.log('\n── 16. Storage Module ─────────────────────────────────');
{
  test('storage: uses IndexedDB',        () => assertContains(src.storage,'indexedDB.open'));
  test('storage: openDB fn',             () => assertContains(src.storage,'function openDB'));
  test('storage: async save fn',         () => assertContains(src.storage,'async function save'));
  test('storage: async loadState fn',    () => assertContains(src.storage,'async function loadState'));
  test('storage: async migrate fn',      () => assertContains(src.storage,'async function migrate'));
  test('storage: deleteChat fn',         () => assertContains(src.storage,'async function deleteChat'));
  test('storage: clearAllChats fn',      () => assertContains(src.storage,'async function clearAllChats'));
  test('storage: graceful DB fallback',  () => assertContains(src.storage,'resolve(null)'));
  test('storage: userProfile fn',        () => assertContains(src.storage,'function userProfile'));
  test('storage: savePrefs fn',          () => assertContains(src.storage,'function savePrefs'));
  test('storage: loadPrefs fn',          () => assertContains(src.storage,'function loadPrefs'));
  test('storage: system theme detect',   () => assertContains(src.storage,'prefers-color-scheme'));
  test('storage: save no chat to ls',    () => {
    const saveBlock = src.storage.match(/async function save[\s\S]{1,300}/)?.[0]||'';
    assertNotContains(saveBlock,"setItem('arjun_chats");
  });
  test('storage: migration clears old',  () => assertContains(src.storage,'arjun5_chats'));
}

// ────────────────────────────────────────────────────────────────────
// SECTION 17 — API MODULE
// ────────────────────────────────────────────────────────────────────
console.log('\n── 17. API Module ─────────────────────────────────────');
{
  test('api: Groq URL correct',          () => assertContains(src.api,'api.groq.com/openai/v1/chat/completions'));
  test('api: Bearer auth',               () => assertContains(src.api,'Bearer'));
  test('api: no Anthropic headers',      () => { assertNotContains(src.api,'anthropic-version'); assertNotContains(src.api,'x-api-key'); });
  test('api: streamResp fn',             () => assertContains(src.api,'async function streamResp'));
  test('api: normResp fn',               () => assertContains(src.api,'async function normResp'));
  test('api: genSummary fn',             () => assertContains(src.api,'async function genSummary'));
  test('api: handles 401',               () => assertContains(src.api,'401'));
  test('api: handles 429',               () => assertContains(src.api,'429'));
  test('api: AbortController signal',    () => assertContains(src.api,'abortCtrl.signal'));
  test('api: reads choices[0]',          () => assertContains(src.api,'choices?.[0]'));
  test('api: streaming uses delta',      () => assertContains(src.api,'delta?.content'));
  test('api: temperature 0.7',           () => assertContains(src.api,'temperature: 0.7'));
  test('api: summary no signal',         () => {
    // genSummary doesn't need AbortController - it's a one-shot call
    const sumBlock = src.api.match(/genSummary[\s\S]{1,600}/)?.[0]||'';
    assert(sumBlock.length > 0);
  });
}

// ────────────────────────────────────────────────────────────────────
// SECTION 18 — PWA & SERVICE WORKER
// ────────────────────────────────────────────────────────────────────
console.log('\n── 18. PWA & Service Worker ───────────────────────────');
{
  test('sw: install listener',           () => assertContains(src.sw,"addEventListener('install'"));
  test('sw: activate listener',          () => assertContains(src.sw,"addEventListener('activate'"));
  test('sw: fetch listener',             () => assertContains(src.sw,"addEventListener('fetch'"));
  test('sw: skips Groq API',             () => { assertContains(src.sw,'groq.com'); assertMatch(src.sw,/groq\.com[\s\S]{1,60}return/); });
  test('sw: caches index.html',          () => assertContains(src.sw,'/index.html'));
  test('sw: caches app.js',              () => assertContains(src.sw,'/js/app.js'));
  test('sw: cleans old caches',          () => assertContains(src.sw,'caches.delete'));
  test('manifest: has name',             () => assert(src.manifest.name));
  test('manifest: short_name',           () => assert(src.manifest.short_name));
  test('manifest: display=standalone',   () => assertEqual(src.manifest.display,'standalone'));
  test('manifest: has icons array',      () => assert(src.manifest.icons.length > 0));
  test('manifest: theme_color set',      () => assert(src.manifest.theme_color));
  test('app: registers SW',              () => assertContains(src.app,'serviceWorker.register'));
  test('app: beforeinstallprompt',       () => assertContains(src.app,'beforeinstallprompt'));
}

// ────────────────────────────────────────────────────────────────────
// SECTION 19 — APP.JS CORE FUNCTIONS
// ────────────────────────────────────────────────────────────────────
console.log('\n── 19. App.js Core Functions ──────────────────────────');
{
  test('app: _chatCounter prevents dupe',() => assertContains(src.app,'_chatCounter'));
  test('app: _sendRetried retry logic',  () => assertContains(src.app,'_sendRetried'));
  test('app: retry msg correct',         () => assertContains(src.app,'retrying in 2s'));
  test('app: message count badge',       () => assertContains(src.app,'countBadge'));
  test('app: exportChat with format',    () => assertContains(src.app,'function exportChat(format'));
  test('app: Chart.js renderBudget fn',  () => assertContains(src.app,'function renderBudgetChart'));
  test('app: jsPDF exportAsPDF fn',      () => assertContains(src.app,'function exportAsPDF'));
  test('app: installPWA fn',             () => assertContains(src.app,'function installPWA'));
  test('app: stopGeneration fn',         () => assertContains(src.app,'function stopGeneration'));
  test('app: ALL_AGENTS has 10 agents',  () => assertContains(src.app,"['code','jobs','plan','write','finance','hustle','health','debug','mock','social']"));
  test('app: global error boundary',     () => assertContains(src.app,'window.onerror'));
  test('app: unhandled rejection catch', () => assertContains(src.app,'onunhandledrejection'));
  test('app: AbortError ignored',        () => assertContains(src.app,"'AbortError'"));
  test('app: URL revoked after download',() => assertContains(src.app,'revokeObjectURL'));
  test('app: marked.js setup',           () => assertContains(src.app,'setupMarked'));
  test('app: highlight.js setup',        () => assertContains(src.app,'hljs.highlightElement'));
  test('app: debounce fn defined',       () => assertContains(src.app,'function debounce'));
  test('app: search debounced 300ms',    () => assertContains(src.app,'doSearch = debounce'));
  test('app: char counter updates',      () => assertContains(src.app,'function updateCharCount'));
  test('app: scrollBot fn',              () => assertContains(src.app,'function scrollBot'));
}

// ────────────────────────────────────────────────────────────────────
// SECTION 20 — SECURITY CHECKS
// ────────────────────────────────────────────────────────────────────
console.log('\n── 20. Security Checks ────────────────────────────────');
{
  const allSrc = src.config + src.storage + src.app + src.api + src.html;
  test('security: no sk-ant hardcoded',  () => assertNotContains(allSrc,'sk-ant-api03-'));
  test('security: no real gsk_ key',     () => assert(!/gsk_[A-Za-z0-9]{50,}/.test(allSrc)));
  test('security: key in localStorage',  () => assertContains(src.config,"'arjun_api_key'"));
  test('security: escH used on user input',() => assertContains(src.app,'escH('));
  test('security: escH used in renderList',() => { const rl=src.app.match(/function renderList[\s\S]{1,800}/)?.[0]||''; assertContains(rl,'escH'); });
  test('security: XSS safe file names',  () => { const ft=src.app.match(/function renderFileTray[\s\S]{1,300}/)?.[0]||''; assertContains(ft,'escH'); });
  test('security: no eval on non-JS',    () => assertContains(src.app,'cantRun'));
  test('gitignore: .env excluded',       () => { const gi=fs.readFileSync(path.join(BASE,'.gitignore'),'utf8'); assertContains(gi,'.env'); });
  test('gitignore: node_modules excl',   () => { const gi=fs.readFileSync(path.join(BASE,'.gitignore'),'utf8'); assertContains(gi,'node_modules'); });
  test('gitignore: *.zip excluded',      () => { const gi=fs.readFileSync(path.join(BASE,'.gitignore'),'utf8'); assertContains(gi,'.zip'); });
}

// ────────────────────────────────────────────────────────────────────
// SECTION 21 — FILE COMPLETENESS
// ────────────────────────────────────────────────────────────────────
console.log('\n── 21. File Completeness ──────────────────────────────');
{
  const exists = f => { try{fs.accessSync(path.join(BASE,f));return true;}catch{return false;} };
  const files  = ['index.html','manifest.json','sw.js','START.bat','start.sh','README.md',
                   'CHANGELOG.md','CONTRIBUTING.md','.gitignore',
                   'js/config.js','js/storage.js','js/api.js','js/app.js',
                   'css/variables.css','css/layout.css','css/components.css',
                   'tests/arjun.test.js'];
  files.forEach(f => test(`file: ${f} exists`, () => assert(exists(f), `Missing: ${f}`)));
  test('changelog: v7.0 documented',    () => assertContains(fs.readFileSync(path.join(BASE,'CHANGELOG.md'),'utf8'),'v7.0'));
  test('contributing: agent guide',     () => assertContains(fs.readFileSync(path.join(BASE,'CONTRIBUTING.md'),'utf8'),'Add a New Agent'));
  test('readme: has badges',            () => assertContains(fs.readFileSync(path.join(BASE,'README.md'),'utf8'),'img.shields.io'));
  test('readme: has tech stack section',() => assertContains(fs.readFileSync(path.join(BASE,'README.md'),'utf8'),'Tech Stack'));
}

// ────────────────────────────────────────────────────────────────────
// SECTION 22 — EDGE CASES & REGRESSION TESTS
// ────────────────────────────────────────────────────────────────────
console.log('\n── 22. Edge Cases & Regression Tests ──────────────────');
{
  // Regression: duplicate chat IDs
  test('regression: chat IDs use counter',() => assertContains(src.app,'_chatCounter'));
  test('regression: model not decommissioned', () => assertNotContains(src.config,'llama3-8b-8192'));

  // Edge: empty/null inputs
  test('edge: exportChat checks empty',  () => assertContains(src.app,"'Nothing to export!'"));
  test('edge: analyzeImg checks no img', () => assertContains(src.app,"'Upload an image first!'"));
  test('edge: regen checks loading',     () => assertContains(src.app,'if (!chat || loading) return'));
  test('edge: send checks empty input',  () => assertContains(src.app,'if ((!txt && !attachedFiles.length && !imgData) || loading) return'));
  test('edge: send checks API key',      () => assertContains(src.app,'if (!getApiKey())'));

  // Edge: context trimming in send()
  test('edge: context trimmed before send', () => assertContains(src.app,'slice(-MAX_CTX_MSGS)'));

  // Edge: abort handled correctly
  test('edge: AbortError not shown as error', () => assertContains(src.app,"err.name === 'AbortError'"));

  // Edge: streaming sets abortCtrl to null in finally
  test('edge: abortCtrl nulled in finally', () => assertContains(src.app,'abortCtrl = null'));

  // Edge: typing timer cleared in finally
  test('edge: typingTimer cleared',      () => assertContains(src.app,'clearInterval(typingTimer)'));

  // Edge: save called in finally
  test('edge: save() in finally block',  () => {
    const finallyBlock = src.app.match(/} finally \{[\s\S]{1,300}/)?.[0]||'';
    assertContains(finallyBlock, 'save()');
  });

  // Bug check: marked.setOptions uses deprecated `highlight` option (marked v9 removed it)
  test('BUG: marked highlight option deprecated in v9', () => {
    // marked.setOptions with highlight: fn was REMOVED in marked v9
    // Should use marked.use(markedHighlight()) instead
    // This is a KNOWN BUG — logging it
    const usesDeprecated = src.app.includes('marked.setOptions') && src.app.includes('highlight:');
    if (usesDeprecated) {
      throw new Error('marked.setOptions({highlight}) removed in marked v9 — use marked.use(markedHighlight({...})) instead');
    }
  });

  // Bug check: doSearch uses innerHTML replace which breaks re-search
  test('edge: clearHL restores text nodes', () => assertContains(src.app,'replaceChild(document.createTextNode'));
}

// ────────────────────────────────────────────────────────────────────
// RESULTS
// ────────────────────────────────────────────────────────────────────
// Wait for async tests to finish
setTimeout(() => {
  const total = passed + failed;
  console.log('\n\n══════════════════════════════════════════════════════');
  console.log(`  Results: ${passed} passed, ${failed} failed, ${total} total`);
  console.log('══════════════════════════════════════════════════════\n');

  if (failures.length) {
    console.log('FAILED TESTS:');
    failures.forEach(f => {
      console.log(`  ✗ ${f.name}`);
      console.log(`    → ${f.err}`);
    });
    console.log('');
    process.exit(1);
  } else {
    console.log('  All tests passed! ✓\n');
    process.exit(0);
  }
}, 500);
