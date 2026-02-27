/**
 * Diff / patch engine.
 *
 * The LLM returns one of:
 *  1. ```json  [{op, ...}, ...]  ```   ← preferred, surgical
 *  2. ```html  <!DOCTYPE ...>    ```   ← full replace fallback
 *
 * applyLlmResponse(currentHtml, llmText) → { newHtml, type }
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
      /* fall through */
    }
  }

  // Full HTML block
  const htmlMatch = text.match(/```html\s*([\s\S]*?)```/i);
  if (htmlMatch) return { type: 'full', payload: htmlMatch[1].trim() };

  // Bare HTML (no fence)
  const bare = text.trim();
  if (bare.startsWith('<!DOCTYPE') || bare.startsWith('<html')) {
    return { type: 'full', payload: bare };
  }

  return null;
}

export function applyDiff(html, ops) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  for (const op of ops) {
    try {
      _applyOp(doc, op);
    } catch (err) {
      console.warn('[differ] op failed', op, err);
    }
  }

  return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
}

function _applyOp(doc, op) {
  const sel = (s) => {
    try {
      return doc.querySelector(s);
    } catch {
      return null;
    }
  };

  switch (op.op) {
    case 'replace': {
      const el = sel(op.selector);
      if (!el) return;
      el.outerHTML = op.html;
      break;
    }
    case 'replaceStyle': {
      const el = sel(op.selector);
      if (!el) return;
      el.style[op.property] = op.value;
      break;
    }
    case 'replaceAttr': {
      const el = sel(op.selector);
      if (!el) return;
      el.setAttribute(op.attr, op.value);
      break;
    }
    case 'replaceText': {
      const el = sel(op.selector);
      if (!el) return;
      el.textContent = op.text;
      break;
    }
    case 'addClass': {
      const el = sel(op.selector);
      if (!el) return;
      el.classList.add(op.class);
      break;
    }
    case 'removeClass': {
      const el = sel(op.selector);
      if (!el) return;
      el.classList.remove(op.class);
      break;
    }
    case 'insertBefore': {
      const el = sel(op.selector);
      if (!el || !el.parentNode) return;
      el.insertAdjacentHTML('beforebegin', op.html);
      break;
    }
    case 'insertAfter': {
      const el = sel(op.selector);
      if (!el) return;
      el.insertAdjacentHTML('afterend', op.html);
      break;
    }
    case 'remove': {
      const el = sel(op.selector);
      if (!el) return;
      el.remove();
      break;
    }
    case 'replaceCSS':
    case 'injectStyle': {
      const styleEl =
        doc.querySelector('style') ||
        (() => {
          const s = doc.createElement('style');
          (doc.head || doc.documentElement).appendChild(s);
          return s;
        })();
      if (op.op === 'replaceCSS') {
        styleEl.textContent += `\n${op.selector} { ${op.css} }`;
      } else {
        styleEl.textContent += '\n' + op.css;
      }
      break;
    }
    default:
      console.warn('[differ] unknown op:', op.op);
  }
}

export function applyLlmResponse(currentHtml, llmText) {
  const parsed = parseLlmResponse(llmText);
  if (!parsed) return { newHtml: currentHtml, type: 'noop' };
  if (parsed.type === 'full') return { newHtml: parsed.payload, type: 'full' };
  return { newHtml: applyDiff(currentHtml, parsed.payload), type: 'diff' };
}
