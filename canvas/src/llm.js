/**
 * LLM client — talks to any OpenAI-compatible API.
 * Streams tokens and calls onToken(chunk) for live UI updates.
 */

import { getState } from './state.js';

/**
 * Build the system prompt explaining the diff format to the LLM.
 */
export function buildSystemPrompt() {
  return `You are an expert HTML/CSS developer assistant embedded in an infinite HTML canvas tool.

Your job is to modify HTML pages based on user instructions.

## Output format

**PREFER the diff format** — return a JSON array of patch operations wrapped in a \`\`\`json block.
Only fall back to a full \`\`\`html block if the change is so extensive that a diff makes no sense.

### Diff operations (preferred)

\`\`\`json
[
  { "op": "replace", "selector": "CSS-selector", "html": "<new-outer-html>" },
  { "op": "replaceStyle", "selector": "CSS-selector", "property": "camelCaseProp", "value": "value" },
  { "op": "replaceAttr", "selector": "CSS-selector", "attr": "attribute-name", "value": "value" },
  { "op": "replaceText", "selector": "CSS-selector", "text": "new text content" },
  { "op": "addClass", "selector": "CSS-selector", "class": "class-name" },
  { "op": "removeClass", "selector": "CSS-selector", "class": "class-name" },
  { "op": "insertBefore", "selector": "CSS-selector", "html": "<html to insert>" },
  { "op": "insertAfter", "selector": "CSS-selector", "html": "<html to insert>" },
  { "op": "remove", "selector": "CSS-selector" },
  { "op": "replaceCSS", "selector": "CSS-selector", "css": "property: value; ..." },
  { "op": "injectStyle", "css": "full CSS string to append to <style>" }
]
\`\`\`

### Full HTML (fallback)

\`\`\`html
<!DOCTYPE html>
...complete document...
\`\`\`

## Rules

1. Use the most specific CSS selector possible to target the element.
2. Never remove or rename existing IDs/classes unless the user explicitly asks.
3. Preserve all existing HTML structure unless modifying it.
4. When the user selects elements, they will be provided to you with their selector, outerHTML, and computed styles.
5. Only modify what is asked — surgical changes only.
6. You may briefly explain what you changed in plain text BEFORE the code block.
7. Never include more than ONE code block in your response.`;
}

/**
 * Build the user message for a chat turn, including selected elements context.
 */
export function buildUserMessage(userText, selectedElements, currentHtml) {
  let msg = '';

  if (selectedElements && selectedElements.length > 0) {
    msg += `## Selected elements (${selectedElements.length})\n\n`;
    selectedElements.forEach((el, i) => {
      msg += `### Element ${i + 1}\n`;
      msg += `- Selector: \`${el.selector}\`\n`;
      msg += `- XPath: \`${el.xpath}\`\n`;
      msg += `- Outer HTML:\n\`\`\`html\n${el.outerHTML}\n\`\`\`\n`;
      if (el.computedStyles && Object.keys(el.computedStyles).length > 0) {
        msg += `- Key computed styles:\n\`\`\`json\n${JSON.stringify(el.computedStyles, null, 2)}\n\`\`\`\n`;
      }
      msg += '\n';
    });
  }

  msg += `## Current page HTML\n\`\`\`html\n${currentHtml}\n\`\`\`\n\n`;
  msg += `## User request\n${userText}`;

  return msg;
}

/**
 * Send a streaming chat completion request.
 * Returns the full assistant response as a string.
 * Calls onToken(text) progressively.
 * Calls onError(err) on failure.
 */
export async function sendChatMessage({ messages, onToken, onError, signal }) {
  const { llmConfig } = getState();
  const { apiKey, baseUrl, model } = llmConfig;

  if (!apiKey) {
    const err = new Error(
      'No API key configured. Click the settings icon to add your API key.',
    );
    onError && onError(err);
    throw err;
  }

  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        temperature: 0.2,
        max_tokens: 4096,
      }),
      signal,
    });
  } catch (err) {
    onError && onError(err);
    throw err;
  }

  if (!response.ok) {
    const body = await response.text();
    const err = new Error(`LLM API error ${response.status}: ${body}`);
    onError && onError(err);
    throw err;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop(); // keep incomplete line

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === 'data: [DONE]') continue;
      if (!trimmed.startsWith('data: ')) continue;

      try {
        const json = JSON.parse(trimmed.slice(6));
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) {
          fullText += delta;
          onToken && onToken(delta);
        }
      } catch (_) {
        // skip malformed SSE chunks
      }
    }
  }

  return fullText;
}
