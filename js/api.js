// ============================================================
// api.js
// All Groq API communication.
//
// Groq uses the OpenAI-compatible API format:
//   - Same endpoint structure as OpenAI
//   - messages array with { role, content }
//   - system prompt goes as first message with role: "system"
//   - Streaming via SSE with delta.content chunks
//
// FREE tier limits (as of 2025):
//   llama3-8b-8192   → 30 req/min, 14,400 req/day
//   llama3-70b-8192  → 30 req/min, 14,400 req/day
// ============================================================

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

// ── Frontend Rate Limiter ───────────────────────────────────
// Groq free tier: 30 requests/minute
// We cap at 28 to leave a 2-request safety buffer.
// Uses a sliding window — tracks timestamps of last 60 seconds.
const _reqLog = [];
const RATE_LIMIT = 28; // requests per 60s

function checkRateLimit() {
  const now = Date.now();
  // Remove entries older than 60 seconds
  while (_reqLog.length && now - _reqLog[0] > 60000) _reqLog.shift();

  if (_reqLog.length >= RATE_LIMIT) {
    const waitSec = Math.ceil((60000 - (now - _reqLog[0])) / 1000);
    toast(`Rate limit — wait ${waitSec}s (Groq allows 30 req/min)`, 'bad');
    return false;
  }
  _reqLog.push(now);
  return true;
}

// ── Build headers ───────────────────────────────────────────
function apiHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${getApiKey()}`   // Groq uses Bearer token
  };
}

// ── Build messages array for Groq ───────────────────────────
// Groq uses the OpenAI format:
// system prompt → first message with role "system"
// then all conversation messages
function buildGroqMessages(sys, msgs) {
  return [
    { role: 'system', content: sys },  // system prompt as first message
    ...msgs                             // rest of conversation
  ];
}

// ── Streaming Response ──────────────────────────────────────
// Groq streams using OpenAI SSE format:
// each chunk has: choices[0].delta.content
async function streamResp(sys, msgs, max, tid, ts, dateStr, chat) {
  if (!checkRateLimit()) { rmTyping(tid); chat.messages.pop(); return ''; }
  const res = await fetch(GROQ_URL, {
    method:  'POST',
    signal:  abortCtrl.signal,
    headers: apiHeaders(),
    body: JSON.stringify({
      model:       MODEL,
      max_tokens:  max,
      messages:    buildGroqMessages(sys, msgs),
      stream:      true,
      temperature: 0.7
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    rmTyping(tid);
    if (res.status === 401) toast('Invalid API key — check your Groq key.', 'bad');
    else if (res.status === 429) toast('Rate limit hit — wait 30s and try again.', 'bad');
    else toast(err?.error?.message || `API Error ${res.status}`, 'bad');
    chat.messages.pop();
    return '';
  }

  rmTyping(tid);
  const msgEl = addBubble('bot', '', ts, true, /*streaming=*/true, false);
  const bub   = msgEl.querySelector('.bub');
  let full    = '';
  typingStart = Date.now();

  const reader  = res.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    for (const line of decoder.decode(value, { stream: true }).split('\n')) {
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice(6).trim();
      if (raw === '[DONE]') break;

      try {
        const j = JSON.parse(raw);
        // Groq/OpenAI streaming format: choices[0].delta.content
        const chunk = j.choices?.[0]?.delta?.content;
        if (chunk) {
          full += chunk;
          bub.innerHTML = fmt(full);
          addPreBtns(bub);
          if (document.getElementById('sa').checked) scrollBot();
        }
        // Token usage (sent in last chunk)
        if (j.usage?.completion_tokens) {
          totalTok += j.usage.completion_tokens;
          updateTok();
        }
      } catch (_) { /* partial chunk — skip */ }
    }
  }

  chat.messages.push({ role: 'assistant', content: full, time: ts, date: dateStr });
  return full;
}

// ── Normal (Non-Streaming) Response ────────────────────────
async function normResp(sys, msgs, max, tid, ts, dateStr, chat) {
  if (!checkRateLimit()) { rmTyping(tid); chat.messages.pop(); return ''; }
  const res = await fetch(GROQ_URL, {
    method:  'POST',
    signal:  abortCtrl.signal,
    headers: apiHeaders(),
    body: JSON.stringify({
      model:       MODEL,
      max_tokens:  max,
      messages:    buildGroqMessages(sys, msgs),
      temperature: 0.7
    })
  });

  rmTyping(tid);

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    if (res.status === 401) toast('Invalid API key — check your Groq key.', 'bad');
    else if (res.status === 429) toast('Rate limit — wait 30s and retry.', 'bad');
    else toast(err?.error?.message || `API Error ${res.status}`, 'bad');
    chat.messages.pop();
    return '';
  }

  const data  = await res.json();
  // Groq/OpenAI format: choices[0].message.content
  const reply = data.choices?.[0]?.message?.content || 'Kuch gadbad ho gayi yaar 😅';

  if (data.usage?.completion_tokens) {
    totalTok += data.usage.completion_tokens;
    updateTok();
  }

  addBubble('bot', reply, ts, true, false, false);
  chat.messages.push({ role: 'assistant', content: reply, time: ts, date: dateStr });
  return reply;
}

// ── Summary Generation ──────────────────────────────────────
async function genSummary() {
  const chat = chats[activeId];
  if (!chat || !chat.messages.length) { toast('No messages to summarize!', 'bad'); return; }
  if (!getApiKey()) { toast('Set your Groq API key first!', 'bad'); return; }

  document.getElementById('sumbody').innerHTML =
    '<div class="typing" style="padding:0"><span></span><span></span><span></span></div>';

  const convo = chat.messages
    .map(m => `${m.role === 'user' ? 'Student' : 'Arjun'}: ${m.content.slice(0, 600)}`)
    .join('\n\n');

  try {
    const res = await fetch(GROQ_URL, {
      method:  'POST',
      headers: apiHeaders(),
      body: JSON.stringify({
        model:      MODEL,
        max_tokens: 400,
        messages: [
          { role: 'system', content: 'You are a helpful assistant that summarizes conversations.' },
          { role: 'user',   content: `Summarize this conversation in 5-7 bullet points. Highlight key advice and action items:\n\n${convo}` }
        ]
      })
    });
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || 'Could not generate summary.';
    document.getElementById('sumbody').innerHTML = fmt(text);
  } catch (e) {
    document.getElementById('sumbody').textContent = 'Error generating summary. Check your connection.';
  }
}
