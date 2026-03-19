# 🧠 Arjun AI — Personal Agent for College Students

> A production-grade AI agent platform for Indian college students — powered by **Groq (100% free)**.

![Arjun AI Screenshot](https://raw.githubusercontent.com/YOUR_USERNAME/arjun-ai/main/screenshot.png)

<!-- Add your own screenshot: take a screenshot → save as screenshot.png in the project root → push to GitHub -->

[![Tests](https://img.shields.io/badge/tests-122%20passing-brightgreen)](#-running-tests)
[![Free](https://img.shields.io/badge/API-Groq%20Free-blue)](https://console.groq.com)
[![PWA](https://img.shields.io/badge/PWA-installable-purple)](#-setup)
[![License](https://img.shields.io/badge/license-MIT-green)](#)

---

## 🚀 Live Demo

Open `index.html` in any browser after setting your API key. No build step, no framework, no server required.

---

## ✨ Features

### Core Chat
- **3 Chat Modes** — General, Study Tutor, Career Coach
- **10 Specialized Agents** — each with a dedicated system prompt and follow-up action buttons
- **Streaming responses** — real-time token-by-token output using SSE
- **Conversation memory** — full multi-turn context sent with every request
- **Multiple chats** — create, rename, delete, switch between conversations

### Input & Media
- **Voice input** — Web Speech API with Indian English support (`en-IN`)
- **File upload** — attach `.py`, `.js`, `.html`, `.json`, `.csv`, and 10+ more types
- **Image analysis** — multimodal Claude Vision for screenshots, diagrams, code photos
- **Drag & drop** — drop files directly onto the input box
- **Paste image** — Ctrl+V pastes clipboard screenshots

### Agent System
| Agent | What it produces |
|-------|-----------------|
| 💻 Code | Complete production-ready code + ⬇ download button per file |
| 🎯 Jobs | 5–8 real companies + CTC ranges + cold email template |
| 📋 Plan | Weekly/daily roadmaps + Start Day 1 / Download actions |
| ✍️ Write | Full final drafts (not templates) + Copy / Refine actions |
| 💰 Finance | Budget breakdown in ₹ + SIP setup + tax basics |
| 🚀 Hustle | Realistic side-income paths + first ₹5,000 roadmap |
| 🧘 Health | Hostel-friendly workouts + ₹100/day meal plans |
| 🐛 Debug | Identify → Explain → Fix → Prevent cycle |
| 🎤 Mock | Real mock interviews scored /10 with ideal answers |
| 💬 Social | Exact message scripts for any social situation |

### UX & Polish
- **Light/Dark theme** — persisted to localStorage
- **Font size preference** — Small / Medium / Large
- **Sidebar toggle** — collapse for more chat space
- **Scroll-to-bottom FAB** — appears when scrolled up mid-conversation
- **Date separators** — Today / Yesterday / date in conversation
- **Edit message** — inline edit + re-send any user message
- **Pin messages** — bookmark important responses (persisted)
- **Regenerate** — retry any bot response
- **Text-to-Speech** — speak any message with stop button
- **Stop generation** — cancel mid-stream with AbortController
- **Search** — highlight matches across all messages (Ctrl+F)
- **Summary** — AI-powered 5-7 bullet summary of any conversation
- **Export** — download full chat as `.md` file

### Developer Quality
- **localStorage quota guard** — auto-prunes oldest chat when full
- **Schema migration** — safely upgrades old data on version bump
- **Context trimming** — keeps last 40 messages to prevent API 400 overflow
- **Rate limit handling** — friendly message on 429 errors
- **Abort controller** — cancellable fetch with Stop button
- **URL leak prevention** — `revokeObjectURL` after every download
- **Settings persistence** — all toggles survive page refresh
- **User profile** — name/year/goal/city injected into every system prompt
- **Typing elapsed timer** — shows seconds since Arjun started thinking
- **Storage usage bar** — live KB/MB display in sidebar

---

## 🗂 Project Structure

```
arjun-ai/
│
├── index.html          # HTML structure — no logic, just markup + script tags
│
├── css/
│   ├── variables.css   # Design tokens (all colors, fonts, spacing)
│   ├── layout.css      # App shell, sidebar, topbar, search bar
│   └── components.css  # UI components (pills, bubbles, modals, input, toast)
│
└── js/
    ├── config.js       # API key, model, system prompts, chips, suggestions
    ├── storage.js      # localStorage — chat state, profile, preferences, migration
    ├── api.js          # Anthropic API calls — stream, normal, summary
    └── app.js          # All UI logic, state, rendering, agent cards, utilities
```

---

## ⚙️ Setup

**1. Get an API key**
Sign up at [console.anthropic.com](https://console.anthropic.com) → API Keys → Create key.

**2. Get a free API key**
Sign up at [console.anthropic.com](https://console.anthropic.com) → API Keys → Create key.

**3. Enter your key in the app**
Open `index.html` → an onboarding screen appears → paste your key → click Start.

Your key is saved in **your browser's localStorage only**. It never touches any server or appears in any file. The repo stays 100% safe to push publicly.

**3. Open in browser**
```bash
open index.html
# or just double-click the file
```
No `npm install`. No build step. No server. It just works.

---

## 🧪 Running Tests

```bash
node tests/arjun.test.js
```

122 tests across 16 sections — no `npm install` needed. Tests cover:
XSS prevention, markdown parser, debounce, chat state, context trimming,
API key validation, Groq message format, budget chart parser, PWA, storage, and more.

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| UI Framework | Vanilla JavaScript (no React/Vue/Angular) |
| Styling | Pure CSS with CSS custom properties (variables) |
| AI Model | Anthropic Claude Sonnet (claude-sonnet-4-20250514) |
| API Integration | Fetch API with Server-Sent Events for streaming |
| Storage | Browser localStorage with quota guard |
| Voice | Web Speech API (SpeechRecognition) |
| Audio | Web Audio API (chime on reply) |
| Fonts | Plus Jakarta Sans + JetBrains Mono (Google Fonts) |

---

## 🔑 Key Technical Decisions

**Why vanilla JS?**
Shows fundamental DOM manipulation, event handling, and async programming without framework abstraction. More impressive to recruiters than "I used React".

**Why SSE streaming?**
Real-time token rendering requires reading a `ReadableStream` with `getReader()` and parsing SSE format manually — a non-trivial API integration.

**Why separate CSS files?**
`variables.css` → `layout.css` → `components.css` mirrors how production design systems are structured (design tokens → layout → components).

**Why 4 JS modules?**
Separation of concerns: `config.js` (data), `storage.js` (persistence), `api.js` (network), `app.js` (UI). Any module can be changed without touching the others.

---

## 📄 Adding a New Agent

1. **Add the system prompt** in `js/config.js` → `PROMPTS` object:
```js
myagent: () => buildBase() + `\n\nMY AGENT: ...your instructions...`
```

2. **Add chips and suggestions** in `js/config.js`:
```js
// In CHIPS:
myagent: ['Chip 1', 'Chip 2', 'Chip 3'],
// In SUGGESTIONS:
myagent: ['Suggestion 1', 'Suggestion 2'],
```

3. **Add the pill button** in `index.html`:
```html
<button class="agpill" onclick="toggleAgent('myagent',this)">🆕 MyAgent</button>
```

4. **Add action buttons** in `js/app.js` → `renderAgentCard()` → `actRows` object:
```js
myagent: `<button class="actn-btn primary" onclick="qs('follow up question')">Action</button>`
```

5. Add `'myagent'` to the `ALL_AGENTS` array in `js/app.js`.

---

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to add new agents, run tests, and submit changes.

---

## 📋 Changelog

See [CHANGELOG.md](CHANGELOG.md) for the full version history.

---

## 👤 Author

Built as a learning project to demonstrate AI engineering fundamentals — prompt engineering, LLM API integration, streaming, and frontend architecture.

---

## 📄 License

MIT — free to use, modify, and distribute. If you build something cool with it, share it!
