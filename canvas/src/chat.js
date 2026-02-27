/**
 * Chat panel — message list, input, streaming response display,
 * and LLM invocation wiring.
 */

import {
  getState,
  getActivePage,
  getChatHistory,
  pushChatMessage,
  updatePageHtml,
  clearSelection,
  setLlmConfig,
  on,
} from './state.js';
import { buildSystemPrompt, buildUserMessage, sendChatMessage } from './llm.js';
import { applyLlmResponse } from './differ.js';
import { clearSelectionInIframe } from './canvas.js';

let _panelEl = null;
let _messagesEl = null;
let _inputEl = null;
let _sendBtn = null;
let _abortController = null;
let _isStreaming = false;

export function initChat(containerEl) {
  _panelEl = containerEl;
  _build();

  on('page:activated', ({ pageId }) => {
    _renderHistory(pageId);
  });
  on('chat:message', ({ pageId }) => {
    const { activePageId } = getState();
    if (pageId === activePageId) {
      // Messages are already appended live; just scroll
      _scrollToBottom();
    }
  });

  // Initial render
  const { activePageId } = getState();
  _renderHistory(activePageId);
}

function _build() {
  _panelEl.innerHTML = '';

  // Header
  const header = document.createElement('div');
  header.className = 'chat-header';
  header.innerHTML = `<span class="chat-title">AI Chat</span>`;

  const settingsBtn = document.createElement('button');
  settingsBtn.className = 'chat-settings-btn';
  settingsBtn.title = 'LLM Settings';
  settingsBtn.innerHTML = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
    <circle cx="10" cy="10" r="3"/>
    <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.42 1.42M14.36 14.36l1.42 1.42M4.22 15.78l1.42-1.42M14.36 5.64l1.42-1.42"/>
  </svg>`;
  settingsBtn.addEventListener('click', _showSettings);
  header.appendChild(settingsBtn);
  _panelEl.appendChild(header);

  // Selection context bar
  const contextBar = document.createElement('div');
  contextBar.className = 'chat-context-bar';
  contextBar.id = 'chat-context-bar';
  contextBar.style.display = 'none';
  _panelEl.appendChild(contextBar);

  // Update context bar on selection changes
  on('selection:changed', ({ elements }) => {
    if (elements.length === 0) {
      contextBar.style.display = 'none';
    } else {
      contextBar.style.display = 'flex';
      contextBar.innerHTML = '';
      const txt = document.createElement('span');
      txt.className = 'chat-context-text';
      txt.textContent = `${elements.length} element${elements.length > 1 ? 's' : ''} selected`;
      const clearBtn = document.createElement('button');
      clearBtn.className = 'chat-context-clear';
      clearBtn.textContent = '✕';
      clearBtn.title = 'Clear selection';
      clearBtn.addEventListener('click', () => {
        const { activePageId } = getState();
        clearSelectionInIframe(activePageId);
        clearSelection();
      });
      contextBar.appendChild(txt);
      contextBar.appendChild(clearBtn);
    }
  });

  // Messages area
  _messagesEl = document.createElement('div');
  _messagesEl.className = 'chat-messages';
  _panelEl.appendChild(_messagesEl);

  // Input area
  const inputArea = document.createElement('div');
  inputArea.className = 'chat-input-area';

  _inputEl = document.createElement('textarea');
  _inputEl.className = 'chat-input';
  _inputEl.placeholder = 'Describe changes... (Shift+Enter for new line)';
  _inputEl.rows = 3;
  _inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      _handleSend();
    }
  });

  _sendBtn = document.createElement('button');
  _sendBtn.className = 'chat-send-btn';
  _sendBtn.innerHTML = `<svg viewBox="0 0 20 20" fill="currentColor"><path d="M17.5 10L3 3.5l2.5 6.2L3 16.5z"/></svg>`;
  _sendBtn.title = 'Send (Enter)';
  _sendBtn.addEventListener('click', _handleSend);

  inputArea.appendChild(_inputEl);
  inputArea.appendChild(_sendBtn);
  _panelEl.appendChild(inputArea);
}

function _renderHistory(pageId) {
  _messagesEl.innerHTML = '';
  const history = getChatHistory(pageId);

  if (history.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'chat-empty';
    empty.innerHTML = `<p>Start a conversation to modify this page.<br/>Select elements first for targeted edits.</p>`;
    _messagesEl.appendChild(empty);
    return;
  }

  history.forEach((msg) => {
    if (msg.role === 'system') return;
    _appendMessageBubble(msg);
  });
  _scrollToBottom();
}

function _appendMessageBubble(msg) {
  // Remove empty state if present
  const empty = _messagesEl.querySelector('.chat-empty');
  if (empty) empty.remove();

  const bubble = document.createElement('div');
  bubble.className = `chat-bubble chat-bubble-${msg.role}`;
  bubble.dataset.msgId = msg.timestamp;

  if (msg.role === 'assistant') {
    // Render markdown-ish: code blocks, bold, etc.
    bubble.innerHTML = _renderMarkdown(msg.content);
  } else {
    const text = document.createElement('p');
    text.textContent = msg.content;
    bubble.appendChild(text);
  }

  _messagesEl.appendChild(bubble);
  return bubble;
}

function _appendStreamingBubble() {
  const empty = _messagesEl.querySelector('.chat-empty');
  if (empty) empty.remove();

  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble chat-bubble-assistant chat-bubble-streaming';
  bubble.id = '__streaming_bubble__';
  bubble.innerHTML = '<span class="chat-cursor"></span>';
  _messagesEl.appendChild(bubble);
  _scrollToBottom();
  return bubble;
}

function _updateStreamingBubble(bubble, text) {
  bubble.innerHTML =
    _renderMarkdown(text) + '<span class="chat-cursor"></span>';
  _scrollToBottom();
}

function _finaliseStreamingBubble(bubble, text) {
  bubble.classList.remove('chat-bubble-streaming');
  bubble.innerHTML = _renderMarkdown(text);
}

async function _handleSend() {
  if (_isStreaming) {
    // Abort ongoing stream
    _abortController?.abort();
    _isStreaming = false;
    _sendBtn.classList.remove('chat-send-stop');
    _sendBtn.innerHTML = `<svg viewBox="0 0 20 20" fill="currentColor"><path d="M17.5 10L3 3.5l2.5 6.2L3 16.5z"/></svg>`;
    return;
  }

  const text = _inputEl.value.trim();
  if (!text) return;

  const page = getActivePage();
  if (!page) return;

  const { selectedElements } = getState();

  _inputEl.value = '';
  _inputEl.disabled = true;
  _isStreaming = true;
  _sendBtn.classList.add('chat-send-stop');
  _sendBtn.innerHTML = `<svg viewBox="0 0 20 20" fill="currentColor"><rect x="5" y="5" width="10" height="10" rx="1"/></svg>`;
  _sendBtn.title = 'Stop generating';

  // Record user message
  pushChatMessage(page.id, { role: 'user', content: text });
  _appendMessageBubble({ role: 'user', content: text, timestamp: Date.now() });

  // Build messages array for API
  const history = getChatHistory(page.id).filter((m) => m.role !== 'system');
  const messages = [
    { role: 'system', content: buildSystemPrompt() },
    ...history.slice(0, -1).map((m) => ({ role: m.role, content: m.content })),
    {
      role: 'user',
      content: buildUserMessage(text, selectedElements, page.html),
    },
  ];

  const streamingBubble = _appendStreamingBubble();
  _abortController = new AbortController();
  let accumulated = '';

  try {
    await sendChatMessage({
      messages,
      signal: _abortController.signal,
      onToken: (chunk) => {
        accumulated += chunk;
        _updateStreamingBubble(streamingBubble, accumulated);
      },
      onError: (err) => {
        _finaliseStreamingBubble(streamingBubble, `**Error:** ${err.message}`);
        pushChatMessage(page.id, {
          role: 'assistant',
          content: `Error: ${err.message}`,
        });
      },
    });

    _finaliseStreamingBubble(streamingBubble, accumulated);
    pushChatMessage(page.id, { role: 'assistant', content: accumulated });

    // Apply changes to the page
    const { newHtml, type } = applyLlmResponse(page.html, accumulated);
    if (type !== 'noop') {
      updatePageHtml(page.id, newHtml);
      // Clear selection after update since DOM changed
      clearSelectionInIframe(page.id);
      clearSelection();
    }
  } catch (err) {
    if (err.name !== 'AbortError') {
      _finaliseStreamingBubble(streamingBubble, `**Error:** ${err.message}`);
      pushChatMessage(page.id, {
        role: 'assistant',
        content: `Error: ${err.message}`,
      });
    } else {
      _finaliseStreamingBubble(streamingBubble, accumulated || '*(cancelled)*');
      if (accumulated) {
        pushChatMessage(page.id, { role: 'assistant', content: accumulated });
        const { newHtml, type } = applyLlmResponse(page.html, accumulated);
        if (type !== 'noop') {
          updatePageHtml(page.id, newHtml);
          clearSelectionInIframe(page.id);
          clearSelection();
        }
      }
    }
  } finally {
    _isStreaming = false;
    _inputEl.disabled = false;
    _inputEl.focus();
    _sendBtn.classList.remove('chat-send-stop');
    _sendBtn.innerHTML = `<svg viewBox="0 0 20 20" fill="currentColor"><path d="M17.5 10L3 3.5l2.5 6.2L3 16.5z"/></svg>`;
    _sendBtn.title = 'Send (Enter)';
  }
}

function _scrollToBottom() {
  requestAnimationFrame(() => {
    _messagesEl.scrollTop = _messagesEl.scrollHeight;
  });
}

// ─── Minimal markdown renderer ───────────────────────────────────────────────
function _renderMarkdown(text) {
  // Escape HTML first
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Code blocks (```lang ... ```)
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre class="chat-code-block"><code class="lang-${lang}">${code.trim()}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="chat-inline-code">$1</code>');

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Italic
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Headings
  html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^# (.+)$/gm, '<h2>$1</h2>');

  // Unordered lists
  html = html.replace(/^\- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

  // Paragraphs (double newlines)
  html = html
    .split(/\n{2,}/)
    .map((block) => {
      if (block.startsWith('<') || block.trim() === '') return block;
      return `<p>${block.replace(/\n/g, '<br/>')}</p>`;
    })
    .join('\n');

  return html;
}

// ─── Settings modal ──────────────────────────────────────────────────────────
function _showSettings() {
  const { llmConfig } = getState();

  // Remove existing modal if any
  document.getElementById('settings-modal')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'settings-modal';
  overlay.className = 'modal-overlay';
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-header">
      <h2>LLM Settings</h2>
      <button class="modal-close" id="modal-close-btn">✕</button>
    </div>
    <div class="modal-body">
      <label class="modal-label">API Key
        <input id="cfg-apikey" type="password" class="modal-input" placeholder="sk-..." value="${llmConfig.apiKey}"/>
      </label>
      <label class="modal-label">Base URL
        <input id="cfg-baseurl" type="text" class="modal-input" value="${llmConfig.baseUrl}"/>
      </label>
      <label class="modal-label">Model
        <input id="cfg-model" type="text" class="modal-input" value="${llmConfig.model}"/>
      </label>
      <div class="modal-hints">
        <p>Works with any OpenAI-compatible API:</p>
        <ul>
          <li><strong>OpenAI:</strong> https://api.openai.com/v1 / gpt-4o</li>
          <li><strong>Anthropic (proxy):</strong> use a compatible proxy</li>
          <li><strong>Ollama:</strong> http://localhost:11434/v1 / llama3.2</li>
          <li><strong>Gemini:</strong> https://generativelanguage.googleapis.com/v1beta/openai</li>
        </ul>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn-secondary" id="modal-cancel-btn">Cancel</button>
      <button class="btn-primary" id="modal-save-btn">Save</button>
    </div>`;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  document
    .getElementById('modal-close-btn')
    .addEventListener('click', () => overlay.remove());
  document
    .getElementById('modal-cancel-btn')
    .addEventListener('click', () => overlay.remove());
  document.getElementById('modal-save-btn').addEventListener('click', () => {
    const apiKey = document.getElementById('cfg-apikey').value.trim();
    const baseUrl = document.getElementById('cfg-baseurl').value.trim();
    const model = document.getElementById('cfg-model').value.trim();
    setLlmConfig({ apiKey, baseUrl, model });
    overlay.remove();
  });

  document.getElementById('cfg-apikey').focus();
}
