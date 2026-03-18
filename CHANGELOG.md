# Changelog

All notable changes to Arjun AI are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [v7.0] — Optimized + Tested Edition

### Added
- **IndexedDB** replaces localStorage for chat data — no more 5 MB limit, async writes never block the UI
- **PWA support** — `manifest.json` + Service Worker (`sw.js`) — installable as phone/desktop app, works offline
- **Chart.js** — Finance agent renders live budget doughnut charts from response data
- **jsPDF** — Export any agent response (plans, mock interview feedback, budgets) as a real PDF
- **122 automated tests** — `node tests/arjun.test.js` — covers XSS, markdown, debounce, chat state, Groq format, budget parser, storage, PWA, and more
- **Frontend rate limiting** — stays under Groq's 30 req/min limit with a clear countdown toast
- **Retry on network failure** — one automatic retry after 2 seconds on transient errors
- **System theme detection** — respects OS dark/light preference on first visit
- **Message count badge** — each conversation in the sidebar shows message count
- **JSON export** — export full conversation as `.json` in addition to `.md`
- **Keyboard shortcuts for agents** — `Alt+1` through `Alt+0` switch agents instantly
- **`.gitignore`** — excludes `node_modules`, `.DS_Store`, `.zip`, `.env`

### Fixed
- **Bug: duplicate chat IDs** — `newChat()` used only `Date.now()` which could collide if called twice in same millisecond. Fixed with `_chatCounter` suffix.
- **Bug: deprecated model** — `llama3-8b-8192` was decommissioned by Groq. Updated to `llama-3.1-8b-instant`.
- **Bug: Run button crashed on non-JS** — clicking ▶ Run on Python/Bash/SQL code gave `JS Error: Unexpected identifier`. Now shows a helpful message pointing to the right environment.
- **Bug: memory leak on downloads** — `URL.createObjectURL` was never revoked. Fixed with `setTimeout(() => revokeObjectURL(), 2000)`.

---

## [v6.0] — Optimized Edition

### Added
- **marked.js** — replaces the 50-line custom markdown parser with a battle-tested library (same one GitHub uses)
- **highlight.js** — real syntax highlighting for 190+ languages (Python, Java, SQL, Bash, etc.)
- **Debounced search** — waits 300ms after typing stops before searching, prevents janky DOM on every keystroke
- **Global error boundary** — `window.onerror` and `window.onunhandledrejection` catch silent crashes
- **Preconnect headers** — browser opens connections to Groq + CDN on page load, saves 100–300ms
- **Meta tags** — `og:title`, `og:description`, `twitter:card` for proper social sharing previews
- **`atom-one-dark` theme** — code blocks match VS Code dark theme

---

## [v5.1] — Structured Edition

### Added
- **9-file project structure** — split from single 1800-line HTML into `index.html` + `css/` + `js/` modules
- **`css/variables.css`** — design tokens system (all colors, fonts, spacing in one place)
- **`css/layout.css`** — app shell, sidebar, topbar, search bar
- **`css/components.css`** — all UI components
- **`js/config.js`** — API key, model, all 13 system prompts, chips, suggestions
- **`js/storage.js`** — localStorage operations, schema migration, profile, preferences
- **`js/api.js`** — Anthropic/Groq API calls (stream, normal, summary)
- **`js/app.js`** — all UI logic, state, rendering, agent cards
- **`README.md`** — professional project documentation for recruiters
- **`START.bat`** — Windows double-click server launcher
- **`start.sh`** — Mac/Linux server launcher

---

## [v5.0] — Senior Edition

### Added
- **30 senior dev fixes** including localStorage quota guard, AbortController stop button, schema migration, context trimming (MAX_CTX_MSGS=40), rate limit handling, URL leak prevention
- **User profile** — name, year/branch, goal, city injected into every system prompt
- **Light/dark theme** with persistence
- **Font size preference** — Small / Medium / Large
- **Sidebar toggle** — `Ctrl+B`
- **Keyboard shortcuts** — `Ctrl+K`, `Ctrl+N`, `Ctrl+B`, `Ctrl+F`, `Esc`
- **Scroll-to-bottom FAB** — appears when scrolled up mid-conversation
- **Date separators** — Today / Yesterday / formatted date
- **Edit message** — inline edit any user message, re-sends from that point
- **Pin messages** — bookmark important responses, persisted
- **Regenerate** — retry any bot response
- **Text-to-Speech** — speak any message
- **Search** — `Ctrl+F`, highlights matches
- **AI Summary** — 5-7 bullet summary of any conversation
- **Storage usage bar** — live KB/MB display in sidebar
- **Typing elapsed timer** — shows seconds since Arjun started thinking
- **Drag & drop** file upload
- **Paste image** — `Ctrl+V` pastes clipboard screenshots

---

## [v4.0] — Agent Edition

### Added
- **10 specialized agents** — Code, Jobs, Plan, Write, Finance, Hustle, Health, Debug, Mock Interview, Social
- Each agent has: dedicated system prompt, quick-ask chips, suggestion pills, post-response action buttons
- **Code Agent** — auto-adds ⬇ Download button for every code block
- **Finance Agent** — budget breakdowns in ₹ with Indian app recommendations
- **Mock Interview Agent** — scores answers /10 with ideal answer explanations
- **Groq API** migration from Anthropic (free, no credit card needed)
- **Onboarding screen** — API key entered in-app, never in source code

---

## [v1.0] — Initial Release

### Added
- Single-file AI chatbot (`index.html`)
- 3 chat modes: Chat, Study, Career
- Streaming responses via SSE
- Voice input (Web Speech API, `en-IN`)
- File upload (13 file types)
- Image analysis (multimodal Claude Vision)
- Multiple conversations with rename and delete
- Export to `.md`
- localStorage persistence
