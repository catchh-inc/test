/**
 * Zustand store — single source of truth.
 *
 * Fixes applied:
 *  - streamingPageId (null | pageId) replaces boolean streaming — tracks WHICH page streams
 *  - addPage is a single atomic set() call
 *  - activePageId initialised inline, no separate setState patch
 */
import { create } from 'zustand';

let _pageIdCounter = 1;
const newPageId = () => `page-${_pageIdCounter++}`;

export const DEFAULT_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>My Page</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: system-ui, sans-serif;
      background: #ffffff;
      color: #111;
      padding: 48px;
      min-height: 100vh;
    }
    h1 { font-size: 2rem; font-weight: 700; margin-bottom: 16px; color: #1a1aff; }
    p  { font-size: 1rem; line-height: 1.65; color: #444; max-width: 580px; }
    .card {
      margin-top: 36px;
      padding: 28px;
      border-radius: 14px;
      background: #f4f5ff;
      border: 1px solid #dde0ff;
      max-width: 420px;
    }
    .card h2 { font-size: 1.2rem; margin-bottom: 10px; color: #3a3aff; }
    .card p  { font-size: 0.93rem; }
    .btn {
      margin-top: 22px;
      display: inline-block;
      padding: 11px 28px;
      background: #3a3aff;
      color: #fff;
      border-radius: 10px;
      font-size: 0.95rem;
      font-weight: 600;
      cursor: pointer;
      border: none;
      transition: background 0.2s;
    }
    .btn:hover { background: #5555ff; }
  </style>
</head>
<body>
  <h1>Hello, Canvas!</h1>
  <p>This is your first HTML page. Click any element to select it, then use the chat to ask the AI to modify it.</p>
  <div class="card">
    <h2>Getting Started</h2>
    <p>Select one or more elements, describe what you want changed, and the AI will apply a surgical diff — not a full rewrite.</p>
    <button class="btn">Click me</button>
  </div>
</body>
</html>`;

function createPage(name, html) {
  return {
    id: newPageId(),
    name: name ?? 'Page 1',
    html: html ?? DEFAULT_HTML,
  };
}

// Build the first page synchronously so activePageId is never null
const _firstPage = createPage();

export const useStore = create((set, get) => ({
  pages: [_firstPage],
  activePageId: _firstPage.id,

  // Viewport
  viewport: { x: 0, y: 0, zoom: 1 },

  // Selection
  selectedElements: [],

  // Chat history  { [pageId]: Message[] }
  // Message: { id, role: 'user'|'assistant', content }
  chatHistory: { [_firstPage.id]: [] },

  // null while idle, pageId while that page's LLM is streaming
  streamingPageId: null,

  // LLM config
  llmConfig: {
    apiKey: localStorage.getItem('canvas_api_key') ?? '',
    baseUrl:
      localStorage.getItem('canvas_base_url') ?? 'https://api.openai.com/v1',
    model: localStorage.getItem('canvas_model') ?? 'gpt-4o',
  },

  // ── Page actions ───────────────────────────────────────────────────────────
  addPage: () => {
    const { pages } = get();
    const page = createPage(`Page ${pages.length + 1}`);
    // Single atomic set — no window where chatHistory[page.id] is undefined
    set((s) => ({
      pages: [...s.pages, page],
      activePageId: page.id,
      chatHistory: { ...s.chatHistory, [page.id]: [] },
      selectedElements: [],
    }));
    return page;
  },

  deletePage: (id) => {
    const { pages, activePageId } = get();
    if (pages.length === 1) return;
    const remaining = pages.filter((p) => p.id !== id);
    const newHistory = { ...get().chatHistory };
    delete newHistory[id];
    set({
      pages: remaining,
      chatHistory: newHistory,
      activePageId: activePageId === id ? remaining[0].id : activePageId,
      selectedElements: activePageId === id ? [] : get().selectedElements,
    });
  },

  renamePage: (id, name) =>
    set((s) => ({
      pages: s.pages.map((p) => (p.id === id ? { ...p, name } : p)),
    })),

  setActivePage: (id) => set({ activePageId: id, selectedElements: [] }),

  updatePageHtml: (id, html) =>
    set((s) => ({
      pages: s.pages.map((p) => (p.id === id ? { ...p, html } : p)),
    })),

  // ── Selection ──────────────────────────────────────────────────────────────
  setSelection: (elements) => set({ selectedElements: elements }),
  clearSelection: () => set({ selectedElements: [] }),

  // ── Chat ───────────────────────────────────────────────────────────────────
  pushMessage: (pageId, message) => {
    const msg = {
      ...message,
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    };
    set((s) => ({
      chatHistory: {
        ...s.chatHistory,
        [pageId]: [...(s.chatHistory[pageId] ?? []), msg],
      },
    }));
    return msg;
  },

  updateLastAssistantMessage: (pageId, content) =>
    set((s) => {
      const history = [...(s.chatHistory[pageId] ?? [])];
      for (let i = history.length - 1; i >= 0; i--) {
        if (history[i].role === 'assistant') {
          history[i] = { ...history[i], content };
          break;
        }
      }
      return { chatHistory: { ...s.chatHistory, [pageId]: history } };
    }),

  setStreamingPage: (pageId) => set({ streamingPageId: pageId }),

  // ── Viewport ───────────────────────────────────────────────────────────────
  setViewport: (patch) =>
    set((s) => ({ viewport: { ...s.viewport, ...patch } })),

  // ── LLM config ─────────────────────────────────────────────────────────────
  setLlmConfig: (patch) => {
    const next = { ...get().llmConfig, ...patch };
    localStorage.setItem('canvas_api_key', next.apiKey);
    localStorage.setItem('canvas_base_url', next.baseUrl);
    localStorage.setItem('canvas_model', next.model);
    set({ llmConfig: next });
  },
}));
