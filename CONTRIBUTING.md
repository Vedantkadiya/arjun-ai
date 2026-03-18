# Contributing to Arjun AI

Thanks for wanting to contribute! This guide explains how the project is structured and how to add new features.

---

## Project Structure

```
arjun-ai/
├── index.html          ← HTML only — no logic
├── manifest.json       ← PWA config
├── sw.js               ← Service Worker (offline/caching)
├── css/
│   ├── variables.css   ← Design tokens — change colors/fonts here
│   ├── layout.css      ← App shell, sidebar, topbar
│   └── components.css  ← All UI components
├── js/
│   ├── config.js       ← API key, model, ALL system prompts, chips
│   ├── storage.js      ← IndexedDB + localStorage operations
│   ├── api.js          ← Groq API calls (stream, normal, summary)
│   └── app.js          ← All UI logic and state
└── tests/
    └── arjun.test.js   ← 122 automated tests (no dependencies)
```

---

## Running the Project

```bash
# Requires a local server (not file://)
python3 -m http.server 3000
# Open http://localhost:3000

# Or double-click START.bat on Windows
```

## Running Tests

```bash
node tests/arjun.test.js
```

No `npm install` needed — tests use only Node.js built-ins.

---

## How to Add a New Agent

### 1. Add the system prompt — `js/config.js`

```js
const PROMPTS = {
  // ... existing agents ...

  myagent: () => buildBase() + `\n\nMY AGENT: Instructions here.
  1. Rule one
  2. Rule two
  Always end with: "Next step:"`
};
```

### 2. Add quick-ask chips — `js/config.js`

```js
const CHIPS = {
  // ... existing ...
  myagent: ['🎯 Chip one', '📋 Chip two', '💡 Chip three'],
};
```

### 3. Add suggestion pills — `js/config.js`

```js
const SUGGESTIONS = {
  // ... existing ...
  myagent: ['First suggestion', 'Second suggestion'],
};
```

### 4. Add the button — `index.html`

Find the Agent Tasks section and add a button:

```html
<div class="agent-row" style="margin-top:4px">
  <!-- existing buttons -->
  <button class="agpill" onclick="toggleAgent('myagent',this)">🎯 My Agent</button>
</div>
```

### 5. Register the agent — `js/app.js`

Add to the `ALL_AGENTS` array:

```js
const ALL_AGENTS = ['code','jobs','plan','write','finance','hustle','health','debug','mock','social','myagent'];
```

Add the activation toast label:

```js
const labels = {
  // ... existing ...
  myagent: '🎯 My Agent — tell me what you need!',
};
```

### 6. Add action buttons — `js/app.js`

Find `renderAgentCard()` and add to `actRows`:

```js
const actRows = {
  // ... existing ...
  myagent: `<button class="actn-btn primary" onclick="qs('follow up prompt')">🎯 Action</button>
            <button class="actn-btn" onclick="copyBubText(this)">📋 Copy</button>`
};
```

### 7. Add to tests — `tests/arjun.test.js`

In Section 13, add your agent to the agents array:

```js
const agents = ['chat','study','career','code','jobs','plan','write',
                'finance','hustle','health','debug','mock','social','myagent'];
```

---

## Code Style

- **Plain JavaScript** — no TypeScript, no build step
- **No frameworks** — vanilla JS only
- **Comments** — explain WHY, not WHAT
- **CSS variables** — always use `var(--v)` etc., never hardcode colors
- **Error handling** — every async function needs try/catch
- **Tests** — add tests for any pure function you write

---

## Submitting Changes

1. Fork the repo
2. Create a branch: `git checkout -b feature/my-agent`
3. Make your changes
4. Run tests: `node tests/arjun.test.js` — all must pass
5. Open a Pull Request with a clear description

---

## Reporting Bugs

Open an issue with:
- What you expected to happen
- What actually happened
- Browser and OS
- Steps to reproduce
