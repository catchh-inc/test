/**
 * Central state store — single source of truth.
 * Everything is plain JS objects; no framework.
 * Subscribers get notified on any mutation via the `emit` mechanism.
 */

const _listeners = {};

export function on(event, fn) {
  if (!_listeners[event]) _listeners[event] = [];
  _listeners[event].push(fn);
}

export function off(event, fn) {
  if (!_listeners[event]) return;
  _listeners[event] = _listeners[event].filter((f) => f !== fn);
}

function emit(event, data) {
  (_listeners[event] || []).forEach((fn) => fn(data));
  (_listeners['*'] || []).forEach((fn) => fn({ event, data }));
}

// ─── Page model ─────────────────────────────────────────────────────────────
// page: { id, name, html }
let _pageIdCounter = 1;

function createPage(name = 'Page 1', html = DEFAULT_HTML) {
  return { id: `page-${_pageIdCounter++}`, name, html };
}

const DEFAULT_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Page</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: system-ui, sans-serif;
      background: #ffffff;
      color: #111111;
      padding: 40px;
    }
    h1 { font-size: 2rem; margin-bottom: 16px; color: #1a1a2e; }
    p  { font-size: 1rem; line-height: 1.6; color: #444; max-width: 600px; }
    .card {
      margin-top: 32px;
      padding: 24px;
      border-radius: 12px;
      background: #f5f7ff;
      border: 1px solid #e0e4ff;
      max-width: 400px;
    }
    .card h2 { font-size: 1.25rem; margin-bottom: 8px; color: #3a3aff; }
    .btn {
      margin-top: 20px;
      display: inline-block;
      padding: 10px 24px;
      background: #3a3aff;
      color: #fff;
      border-radius: 8px;
      font-size: 0.95rem;
      cursor: pointer;
      border: none;
    }
  </style>
</head>
<body>
  <h1>Hello, Canvas!</h1>
  <p>This is your first HTML page. Select any element and use the chat to ask the AI to modify it.</p>
  <div class="card">
    <h2>Getting Started</h2>
    <p>Click on any element to select it, then describe your changes in the chat panel.</p>
    <button class="btn">Click me</button>
  </div>
</body>
</html>`;

// ─── App state ───────────────────────────────────────────────────────────────
const state = {
  pages: [createPage()],
  activePageId: null,

  // canvas viewport
  viewport: { x: 0, y: 0, zoom: 1 },

  // selection: array of { xpath, selector, outerHTML, computedStyles }
  selectedElements: [],

  // chat messages per page: { [pageId]: Message[] }
  // Message: { role: 'user'|'assistant'|'system', content: string, timestamp }
  chatHistory: {},

  // LLM config (user-configurable)
  llmConfig: {
    apiKey: localStorage.getItem('canvas_api_key') || '',
    baseUrl:
      localStorage.getItem('canvas_base_url') || 'https://api.openai.com/v1',
    model: localStorage.getItem('canvas_model') || 'gpt-4o',
  },
};

state.activePageId = state.pages[0].id;

// ─── Accessors ───────────────────────────────────────────────────────────────
export function getState() {
  return state;
}

export function getActivePage() {
  return state.pages.find((p) => p.id === state.activePageId) || null;
}

// ─── Page mutations ──────────────────────────────────────────────────────────
export function addPage(name) {
  const page = createPage(name || `Page ${state.pages.length + 1}`);
  state.chatHistory[page.id] = [];
  state.pages.push(page);
  emit('pages:changed', { pages: state.pages });
  return page;
}

export function deletePage(id) {
  if (state.pages.length === 1) return; // always keep one page
  state.pages = state.pages.filter((p) => p.id !== id);
  delete state.chatHistory[id];
  if (state.activePageId === id) {
    state.activePageId = state.pages[0].id;
    // Ensure chat history is initialised for the first page
    state.chatHistory[state.activePageId] = [];
    emit('page:activated', { pageId: state.activePageId });
  }
  emit('pages:changed', { pages: state.pages });
}

export function renamePage(id, name) {
  const page = state.pages.find((p) => p.id === id);
  if (page) {
    page.name = name;
    emit('pages:changed', { pages: state.pages });
  }
}

export function setActivePage(id) {
  if (state.activePageId === id) return;
  state.activePageId = id;
  state.selectedElements = [];
  emit('page:activated', { pageId: id });
  emit('selection:changed', { elements: [] });
}

export function updatePageHtml(id, html) {
  const page = state.pages.find((p) => p.id === id);
  if (page) {
    page.html = html;
    emit('page:html:updated', { pageId: id, html });
  }
}

// ─── Selection mutations ─────────────────────────────────────────────────────
export function setSelection(elements) {
  state.selectedElements = elements;
  emit('selection:changed', { elements });
}

export function clearSelection() {
  state.selectedElements = [];
  emit('selection:changed', { elements: [] });
}

// ─── Chat mutations ──────────────────────────────────────────────────────────
export function getChatHistory(pageId) {
  if (!state.chatHistory[pageId]) state.chatHistory[pageId] = [];
  return state.chatHistory[pageId];
}

export function pushChatMessage(pageId, message) {
  if (!state.chatHistory[pageId]) state.chatHistory[pageId] = [];
  const msg = { ...message, timestamp: Date.now() };
  state.chatHistory[pageId].push(msg);
  emit('chat:message', { pageId, message: msg });
  return msg;
}

// ─── LLM config mutations ────────────────────────────────────────────────────
export function setLlmConfig(config) {
  Object.assign(state.llmConfig, config);
  localStorage.setItem('canvas_api_key', state.llmConfig.apiKey);
  localStorage.setItem('canvas_base_url', state.llmConfig.baseUrl);
  localStorage.setItem('canvas_model', state.llmConfig.model);
  emit('llm:config:changed', state.llmConfig);
}

// ─── Viewport mutations ──────────────────────────────────────────────────────
export function setViewport(vp) {
  Object.assign(state.viewport, vp);
  emit('viewport:changed', state.viewport);
}
