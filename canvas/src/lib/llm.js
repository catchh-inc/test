/**
 * LLM client — OpenAI-compatible streaming.
 */

export const SYSTEM_PROMPT = `You are an expert HTML/CSS developer embedded in an infinite HTML canvas tool.

Your job: modify HTML pages based on user instructions using surgical diff operations.

## Output format

**ALWAYS prefer the diff format** — a JSON array of patch ops in a \`\`\`json block.
Only fall back to a full \`\`\`html block if the entire page structure changes.

### Diff ops (preferred)

\`\`\`json
[
  { "op": "replace",      "selector": "CSS selector", "html": "<new-outer-html>" },
  { "op": "replaceStyle", "selector": "CSS selector", "property": "camelCaseProp", "value": "value" },
  { "op": "replaceAttr",  "selector": "CSS selector", "attr": "attr-name", "value": "value" },
  { "op": "replaceText",  "selector": "CSS selector", "text": "new text" },
  { "op": "addClass",     "selector": "CSS selector", "class": "class-name" },
  { "op": "removeClass",  "selector": "CSS selector", "class": "class-name" },
  { "op": "insertBefore", "selector": "CSS selector", "html": "<html>" },
  { "op": "insertAfter",  "selector": "CSS selector", "html": "<html>" },
  { "op": "remove",       "selector": "CSS selector" },
  { "op": "replaceCSS",   "selector": "CSS selector", "css": "prop: value;" },
  { "op": "injectStyle",  "css": "full CSS to append to <style>" }
]
\`\`\`

### Full HTML fallback

\`\`\`html
<!DOCTYPE html>...complete document...
\`\`\`

## Rules

1. Use the most specific CSS selector that uniquely identifies the element.
2. Preserve all existing IDs and classes unless explicitly asked to change them.
3. Only modify what the user requests — no unsolicited changes.
4. You may briefly explain changes in plain text BEFORE the code block.
5. Emit exactly ONE code block per response.`;

export function buildUserMessage(userText, selectedElements, currentHtml) {
  let msg = '';

  if (selectedElements?.length > 0) {
    msg += `## Selected elements (${selectedElements.length})\n\n`;
    selectedElements.forEach((el, i) => {
      msg += `### Element ${i + 1}: \`${el.selector}\`\n`;
      msg += `- XPath: \`${el.xpath}\`\n`;
      msg += `- Outer HTML:\n\`\`\`html\n${el.outerHTML}\n\`\`\`\n`;
      if (el.computedStyles && Object.keys(el.computedStyles).length > 0) {
        msg += `- Computed styles:\n\`\`\`json\n${JSON.stringify(el.computedStyles, null, 2)}\n\`\`\`\n`;
      }
      msg += '\n';
    });
  }

  msg += `## Current page HTML\n\`\`\`html\n${currentHtml}\n\`\`\`\n\n`;
  msg += `## User request\n${userText}`;
  return msg;
}

/**
 * Stream a chat completion.
 * Calls onToken(chunk) for each streamed token.
 * Returns the full accumulated response string.
 */
export async function streamCompletion({
  messages,
  llmConfig,
  onToken,
  signal,
}) {
  const { apiKey, baseUrl, model } = llmConfig;

  if (!apiKey) {
    throw new Error(
      'No API key configured. Click the ⚙ settings button to add one.',
    );
  }

  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;

  const res = await fetch(url, {
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

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error ${res.status}: ${body}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = '';
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      const t = line.trim();
      if (!t || t === 'data: [DONE]' || !t.startsWith('data: ')) continue;
      try {
        const chunk = JSON.parse(t.slice(6));
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) {
          full += delta;
          onToken?.(delta);
        }
      } catch {
        /* skip malformed SSE */
      }
    }
  }

  return full;
}
