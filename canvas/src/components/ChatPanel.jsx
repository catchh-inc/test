/**
 * Chat panel — message list, streaming input, LLM wiring.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { useStore } from '../lib/store';
import { SYSTEM_PROMPT, buildUserMessage, streamCompletion } from '../lib/llm';
import { applyLlmResponse } from '../lib/differ';
import { clearSelectionInIframe } from './PageFrame';
import SettingsModal from './SettingsModal';

export default function ChatPanel() {
  const {
    activePageId,
    pages,
    selectedElements,
    chatHistory,
    pushMessage,
    updateLastAssistantMessage,
    streaming,
    setStreaming,
    updatePageHtml,
    clearSelection,
    llmConfig,
  } = useStore();

  const [input, setInput] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const messagesEndRef = useRef(null);
  const abortRef = useRef(null);
  const inputRef = useRef(null);

  const currentHistory = chatHistory[activePageId] ?? [];
  const page = pages.find((p) => p.id === activePageId);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentHistory, streaming]);

  // Reset input when page changes
  useEffect(() => {
    setInput('');
  }, [activePageId]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || !page) return;

    setInput('');
    setStreaming(true);

    // Snapshot selected elements before the async call
    const selSnapshot = [...selectedElements];

    // Add user message
    pushMessage(activePageId, { role: 'user', content: text });

    // Build API messages (exclude system from stored history)
    const historyForApi = (chatHistory[activePageId] ?? []).map((m) => ({
      role: m.role,
      content: m.content,
    }));
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...historyForApi,
      { role: 'user', content: buildUserMessage(text, selSnapshot, page.html) },
    ];

    // Add placeholder assistant message
    pushMessage(activePageId, { role: 'assistant', content: '' });

    abortRef.current = new AbortController();

    try {
      let accumulated = '';
      await streamCompletion({
        messages,
        llmConfig,
        signal: abortRef.current.signal,
        onToken: (chunk) => {
          accumulated += chunk;
          updateLastAssistantMessage(activePageId, accumulated);
        },
      });

      // Apply diff / full HTML to the page
      const { newHtml, type } = applyLlmResponse(page.html, accumulated);
      if (type !== 'noop') {
        updatePageHtml(activePageId, newHtml);
        clearSelectionInIframe(activePageId);
        clearSelection();
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        updateLastAssistantMessage(activePageId, `**Error:** ${err.message}`);
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
      inputRef.current?.focus();
    }
  }, [
    input,
    page,
    activePageId,
    selectedElements,
    chatHistory,
    llmConfig,
    pushMessage,
    updateLastAssistantMessage,
    setStreaming,
    updatePageHtml,
    clearSelection,
  ]);

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      streaming ? handleStop() : handleSend();
    }
  };

  return (
    <div className="chat-panel">
      {/* Header */}
      <div className="chat-header">
        <span className="chat-title">AI Chat</span>
        <button
          className="icon-btn"
          title="LLM Settings"
          onClick={() => setShowSettings(true)}
        >
          <GearIcon />
        </button>
      </div>

      {/* Selection context bar */}
      {selectedElements.length > 0 && (
        <div className="chat-context-bar">
          <span className="chat-context-text">
            {selectedElements.length} element
            {selectedElements.length > 1 ? 's' : ''} selected
          </span>
          <button
            className="chat-context-clear"
            onClick={() => {
              clearSelectionInIframe(activePageId);
              clearSelection();
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Messages */}
      <div className="chat-messages">
        {currentHistory.length === 0 && (
          <div className="chat-empty">
            <p>Select elements on the canvas, then describe what to change.</p>
          </div>
        )}
        {currentHistory.map((msg) => (
          <MessageBubble
            key={msg.id}
            msg={msg}
            isStreaming={
              streaming &&
              msg === currentHistory[currentHistory.length - 1] &&
              msg.role === 'assistant'
            }
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="chat-input-area">
        <textarea
          ref={inputRef}
          className="chat-input"
          placeholder="Describe changes… (Shift+Enter for newline)"
          rows={3}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={false}
        />
        <button
          className={`chat-send-btn${streaming ? ' stop' : ''}`}
          title={streaming ? 'Stop' : 'Send (Enter)'}
          onClick={streaming ? handleStop : handleSend}
        >
          {streaming ? <StopIcon /> : <SendIcon />}
        </button>
      </div>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}

// ── Message bubble ───────────────────────────────────────────────────────────
function MessageBubble({ msg, isStreaming }) {
  return (
    <div className={`chat-bubble chat-bubble-${msg.role}`}>
      {msg.role === 'assistant' ? (
        <AssistantContent content={msg.content} isStreaming={isStreaming} />
      ) : (
        <p>{msg.content}</p>
      )}
    </div>
  );
}

function AssistantContent({ content, isStreaming }) {
  return (
    <div
      className="chat-md"
      dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
    />
  );
}

// Very minimal markdown → HTML (runs client-side, no deps)
function renderMarkdown(text) {
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  // Code blocks
  html = html.replace(
    /```(\w*)\n?([\s\S]*?)```/g,
    (_, lang, code) => `<pre class="md-pre"><code>${code.trim()}</code></pre>`,
  );
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="md-code">$1</code>');
  // Bold / italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Headings
  html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^# (.+)$/gm, '<h2>$1</h2>');
  // Lists
  html = html.replace(/^[-*] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>');
  // Paragraphs
  html = html
    .split(/\n{2,}/)
    .map((b) =>
      b.startsWith('<') || !b.trim() ? b : `<p>${b.replace(/\n/g, '<br>')}</p>`,
    )
    .join('\n');
  return html;
}

// ── Icons ────────────────────────────────────────────────────────────────────
function GearIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <circle cx="10" cy="10" r="3" />
      <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.2 4.2l1.4 1.4M14.4 14.4l1.4 1.4M4.2 15.8l1.4-1.4M14.4 5.6l1.4-1.4" />
    </svg>
  );
}
function SendIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor">
      <path d="M17.5 10L3 3.5l2.5 6.2L3 16.5z" />
    </svg>
  );
}
function StopIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor">
      <rect x="5" y="5" width="10" height="10" rx="1" />
    </svg>
  );
}
