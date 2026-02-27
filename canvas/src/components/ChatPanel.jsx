/**
 * ChatPanel — streaming chat UI with correct LLM message history.
 *
 * Key correctness rules applied here:
 * 1. Build historyForApi BEFORE pushing the new user message, so no duplicate.
 * 2. Read page.html from getState() at diff-apply time, not from a stale closure.
 * 3. streaming is tracked per-page in the store (streamingPageId).
 * 4. outerHTML sent to LLM has internal bridge classes stripped.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { useStore } from '../lib/store';
import { SYSTEM_PROMPT, buildUserMessage, streamCompletion } from '../lib/llm';
import { applyLlmResponse } from '../lib/differ';
import { clearSelectionInIframe } from './PageFrame';
import SettingsModal from './SettingsModal';

export default function ChatPanel() {
  const activePageId = useStore((s) => s.activePageId);
  const pages = useStore((s) => s.pages);
  const selectedElements = useStore((s) => s.selectedElements);
  const chatHistory = useStore((s) => s.chatHistory);
  const streamingPageId = useStore((s) => s.streamingPageId);
  const llmConfig = useStore((s) => s.llmConfig);

  const {
    pushMessage,
    updateLastAssistantMessage,
    setStreamingPage,
    updatePageHtml,
    clearSelection,
  } = useStore.getState();

  const [input, setInput] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const messagesEndRef = useRef(null);
  const abortRef = useRef(null);
  const inputRef = useRef(null);

  const isStreaming = streamingPageId === activePageId;
  const currentHistory = chatHistory[activePageId] ?? [];
  const page = pages.find((p) => p.id === activePageId);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentHistory.length, isStreaming]);

  // Reset input when switching pages
  useEffect(() => {
    setInput('');
  }, [activePageId]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || !page || streamingPageId !== null) return;

    // ── Step 1: Capture everything from state BEFORE any mutations ──────────
    const { chatHistory: currentChatHistory, activePageId: pid } =
      useStore.getState();

    // Build history for API from the CURRENT history (before we push the new msg)
    const historyForApi = (currentChatHistory[pid] ?? []).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // Snapshot selected elements — strip internal bridge CSS classes from outerHTML
    const selSnapshot = selectedElements.map((el) => ({
      ...el,
      outerHTML: el.outerHTML
        .replace(/\s*__cs__/g, '')
        .replace(/\s*__ch__/g, '')
        .replace(/class=""/g, '')
        .trim(),
    }));

    // ── Step 2: Update UI ───────────────────────────────────────────────────
    setInput('');
    pushMessage(pid, { role: 'user', content: text });
    pushMessage(pid, { role: 'assistant', content: '' }); // placeholder
    setStreamingPage(pid);

    // ── Step 3: Build messages array ────────────────────────────────────────
    // Get current page HTML fresh from state (not from stale closure)
    const currentHtml =
      useStore.getState().pages.find((p) => p.id === pid)?.html ?? '';

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      // All prior turns (bare text is fine — the current HTML is always injected fresh below)
      ...historyForApi,
      // The new turn: full context with selected elements + current HTML
      {
        role: 'user',
        content: buildUserMessage(text, selSnapshot, currentHtml),
      },
    ];

    abortRef.current = new AbortController();

    try {
      let accumulated = '';

      await streamCompletion({
        messages,
        llmConfig,
        signal: abortRef.current.signal,
        onToken: (chunk) => {
          accumulated += chunk;
          updateLastAssistantMessage(pid, accumulated);
        },
      });

      // ── Step 4: Apply diff to the CURRENT page HTML (re-read from state) ──
      const freshHtml =
        useStore.getState().pages.find((p) => p.id === pid)?.html ??
        currentHtml;
      const { newHtml, type } = applyLlmResponse(freshHtml, accumulated);

      if (type !== 'noop') {
        updatePageHtml(pid, newHtml);
        // Clear selection since DOM changed
        clearSelectionInIframe(pid);
        clearSelection();
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        updateLastAssistantMessage(pid, `**Error:** ${err.message}`);
      } else {
        // Aborted mid-stream — still try to apply whatever we got
        const freshHtml =
          useStore.getState().pages.find((p) => p.id === pid)?.html ??
          currentHtml;
        if (accumulated) {
          const { newHtml, type } = applyLlmResponse(freshHtml, accumulated);
          if (type !== 'noop') {
            updatePageHtml(pid, newHtml);
            clearSelectionInIframe(pid);
            clearSelection();
          }
        }
      }
    } finally {
      setStreamingPage(null);
      abortRef.current = null;
      inputRef.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, page, selectedElements, llmConfig, streamingPageId]);

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      isStreaming ? handleStop() : handleSend();
    }
  };

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <span className="chat-title">AI Chat</span>
        <button
          className="icon-btn"
          title="LLM settings"
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
            {selectedElements.length !== 1 ? 's' : ''} selected
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
        {currentHistory.length === 0 && !isStreaming && (
          <div className="chat-empty">
            <p>
              Click elements on the canvas to select them,
              <br />
              then describe what to change.
            </p>
          </div>
        )}
        {currentHistory.map((msg, i) => {
          const isLastMsg = i === currentHistory.length - 1;
          const showCursor =
            isStreaming && isLastMsg && msg.role === 'assistant';
          return (
            <MessageBubble key={msg.id} msg={msg} showCursor={showCursor} />
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="chat-input-area">
        <textarea
          ref={inputRef}
          className="chat-input"
          placeholder="Describe your changes… (Enter to send, Shift+Enter for newline)"
          rows={3}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <button
          className={`chat-send-btn${isStreaming ? ' stop' : ''}`}
          title={isStreaming ? 'Stop generating' : 'Send (Enter)'}
          onClick={isStreaming ? handleStop : handleSend}
          disabled={streamingPageId !== null && !isStreaming}
        >
          {isStreaming ? <StopIcon /> : <SendIcon />}
        </button>
      </div>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────
function MessageBubble({ msg, showCursor }) {
  return (
    <div className={`chat-bubble chat-bubble-${msg.role}`}>
      {msg.role === 'assistant' ? (
        <div className="chat-md">
          <span
            dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
          />
          {showCursor && <span className="chat-cursor" />}
        </div>
      ) : (
        <p>{msg.content}</p>
      )}
    </div>
  );
}

// ── Minimal markdown renderer ─────────────────────────────────────────────────
function renderMarkdown(text) {
  if (!text) return '';
  // Escape HTML entities first
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Fenced code blocks (```lang\ncode```)
  html = html.replace(
    /```(\w*)\n?([\s\S]*?)```/g,
    (_, lang, code) =>
      `<pre class="md-pre" data-lang="${lang}"><code>${code.trim()}</code></pre>`,
  );

  // Inline code
  html = html.replace(/`([^`\n]+)`/g, '<code class="md-code">$1</code>');

  // Bold / italic
  html = html.replace(/\*\*(.+?)\*\*/gs, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/gs, '<em>$1</em>');

  // Headings (must come before paragraph processing)
  html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^# (.+)$/gm, '<h2>$1</h2>');

  // Unordered list items
  html = html.replace(/^[-*] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>[\s\S]*?<\/li>\n?)+/g, '<ul>$&</ul>');

  // Paragraphs — wrap non-tag blocks
  html = html
    .split(/\n{2,}/)
    .map((block) => {
      const t = block.trim();
      if (!t) return '';
      if (t.startsWith('<')) return block; // already a tag
      return `<p>${block.replace(/\n/g, '<br>')}</p>`;
    })
    .join('\n');

  return html;
}

// ── Icons ─────────────────────────────────────────────────────────────────────
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
      <rect x="5" y="5" width="10" height="10" rx="1.5" />
    </svg>
  );
}
