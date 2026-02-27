/**
 * Diff / patch engine.
 *
 * The LLM returns changes in one of two formats:
 *
 * 1. FULL_HTML — a complete new HTML document (fallback)
 *    The LLM wraps it in ```html ... ```
 *
 * 2. DIFF — a structured list of patch operations (preferred)
 *    The LLM returns a JSON block:
 *    ```json
 *    [
 *      { "op": "replace", "selector": "h1", "html": "<h1>New Title</h1>" },
 *      { "op": "replaceStyle", "selector": ".btn", "property": "background", "value": "#ff0000" },
 *      { "op": "replaceAttr", "selector": "img", "attr": "src", "value": "..." },
 *      { "op": "replaceText", "selector": "p", "text": "New text content" },
 *      { "op": "addClass", "selector": ".card", "class": "shadow" },
 *      { "op": "removeClass", "selector": ".card", "class": "rounded" },
 *      { "op": "insertBefore", "selector": ".card", "html": "<p>Inserted</p>" },
 *      { "op": "insertAfter", "selector": ".card", "html": "<p>Inserted</p>" },
 *      { "op": "remove", "selector": ".old-element" },
 *      { "op": "replaceCSS", "selector": "body", "css": "background: #000; color: #fff;" },
 *      { "op": "injectStyle", "css": "..." }
 *    ]
 *    ```
 *
 * applyPatch(currentHtml, llmResponse) → newHtml
 */

/**
 * Parse the LLM text response and extract a patch or full HTML.
 * Returns { type: 'diff'|'full', payload }
 */
export function parseLlmResponse(text) {
  // Try JSON diff first
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/i);
  if (jsonMatch) {
    try {
      const ops = JSON.parse(jsonMatch[1].trim());
      if (Array.isArray(ops) && ops.length > 0 && ops[0].op) {
        return { type: 'diff', payload: ops };
      }
    } catch (_) {
      // fall through
    }
  }

  // Try full HTML block
  const htmlMatch = text.match(/```html\s*([\s\S]*?)```/i);
  if (htmlMatch) {
    return { type: 'full', payload: htmlMatch[1].trim() };
  }

  // If response contains a full <!DOCTYPE or <html tag without code fences
  const rawHtml = text.trim();
  if (rawHtml.startsWith('<!DOCTYPE') || rawHtml.startsWith('<html')) {
    return { type: 'full', payload: rawHtml };
  }

  // Could not parse — return null
  return null;
}

/**
 * Apply a parsed patch (diff ops) to the HTML string.
 * Works by parsing into a DOM via DOMParser, mutating, then serialising.
 */
export function applyDiff(html, ops) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  for (const op of ops) {
    try {
      _applyOp(doc, op);
    } catch (err) {
      console.warn('[differ] Failed to apply op', op, err);
    }
  }

  return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
}

function _applyOp(doc, op) {
  switch (op.op) {
    case 'replace': {
      const el = _select(doc, op.selector);
      if (!el) return;
      const tmp = doc.createElement('div');
      tmp.innerHTML = op.html;
      el.replaceWith(...tmp.childNodes);
      break;
    }
    case 'replaceStyle': {
      const el = _select(doc, op.selector);
      if (!el) return;
      el.style[op.property] = op.value;
      break;
    }
    case 'replaceAttr': {
      const el = _select(doc, op.selector);
      if (!el) return;
      el.setAttribute(op.attr, op.value);
      break;
    }
    case 'replaceText': {
      const el = _select(doc, op.selector);
      if (!el) return;
      el.textContent = op.text;
      break;
    }
    case 'addClass': {
      const el = _select(doc, op.selector);
      if (!el) return;
      el.classList.add(op.class);
      break;
    }
    case 'removeClass': {
      const el = _select(doc, op.selector);
      if (!el) return;
      el.classList.remove(op.class);
      break;
    }
    case 'insertBefore': {
      const el = _select(doc, op.selector);
      if (!el || !el.parentNode) return;
      el.insertAdjacentHTML('beforebegin', op.html);
      break;
    }
    case 'insertAfter': {
      const el = _select(doc, op.selector);
      if (!el) return;
      el.insertAdjacentHTML('afterend', op.html);
      break;
    }
    case 'remove': {
      const el = _select(doc, op.selector);
      if (!el) return;
      el.remove();
      break;
    }
    case 'replaceCSS': {
      // Find or create a <style> tag that contains a rule for the selector
      // Simple approach: append to first style tag
      const style = doc.querySelector('style') || _createStyle(doc);
      style.textContent += `\n${op.selector} { ${op.css} }`;
      break;
    }
    case 'injectStyle': {
      const style = doc.querySelector('style') || _createStyle(doc);
      style.textContent += '\n' + op.css;
      break;
    }
    default:
      console.warn('[differ] Unknown op:', op.op);
  }
}

function _select(doc, selector) {
  try {
    return doc.querySelector(selector);
  } catch (_) {
    return null;
  }
}

function _createStyle(doc) {
  const style = doc.createElement('style');
  (doc.head || doc.documentElement).appendChild(style);
  return style;
}

/**
 * Main entry: apply LLM response to current HTML.
 * Returns { newHtml, type, ops|null }
 */
export function applyLlmResponse(currentHtml, llmResponseText) {
  const parsed = parseLlmResponse(llmResponseText);

  if (!parsed) {
    // Cannot parse — return unchanged
    return { newHtml: currentHtml, type: 'noop', ops: null };
  }

  if (parsed.type === 'full') {
    return { newHtml: parsed.payload, type: 'full', ops: null };
  }

  if (parsed.type === 'diff') {
    const newHtml = applyDiff(currentHtml, parsed.payload);
    return { newHtml, type: 'diff', ops: parsed.payload };
  }

  return { newHtml: currentHtml, type: 'noop', ops: null };
}
