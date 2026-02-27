/**
 * Diff / patch engine.
 *
 * LLM returns ONE of:
 *  1. ```json [{op, ...}]```  ← preferred, surgical
 *  2. ```html <!DOCTYPE...>``` ← full replace fallback
 *
 * applyLlmResponse(currentHtml, llmText) → { newHtml, type }
 */

// ── Parse LLM response ────────────────────────────────────────────────────────
export function parseLlmResponse(text) {
  // Try JSON diff first
  const jsonFence = text.match(/```json\s*([\s\S]*?)```/i);
  if (jsonFence) {
    try {
      const ops = JSON.parse(jsonFence[1].trim());
      if (
        Array.isArray(ops) &&
        ops.length > 0 &&
        typeof ops[0].op === 'string'
      ) {
        return { type: 'diff', payload: ops };
      }
    } catch {
      /* fall through */
    }
  }

  // Full HTML block
  const htmlFence = text.match(/```html\s*([\s\S]*?)```/i);
  if (htmlFence) return { type: 'full', payload: htmlFence[1].trim() };

  // Bare HTML without fences
  const bare = text.trim();
  if (bare.startsWith('<!DOCTYPE') || bare.startsWith('<html')) {
    return { type: 'full', payload: bare };
  }

  return null;
}

// ── Apply diff ops to an HTML string ─────────────────────────────────────────
export function applyDiff(html, ops) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  for (const op of ops) {
    try {
      _applyOp(doc, op);
    } catch (err) {
      console.warn(
        '[differ] op failed:',
        op.op,
        op.selector ?? '',
        err.message,
      );
    }
  }

  return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
}

function _sel(doc, selector) {
  try {
    return doc.querySelector(selector);
  } catch {
    return null;
  }
}

function _selAll(doc, selector) {
  try {
    return Array.from(doc.querySelectorAll(selector));
  } catch {
    return [];
  }
}

function _applyOp(doc, op) {
  switch (op.op) {
    case 'replace': {
      const el = _sel(doc, op.selector);
      if (!el) {
        console.warn('[differ] replace: no match for', op.selector);
        return;
      }
      el.outerHTML = op.html;
      break;
    }

    case 'replaceStyle': {
      // Support multiple targets (properties panel passes multiple selectors as separate ops)
      const els = _selAll(doc, op.selector);
      if (!els.length) {
        console.warn('[differ] replaceStyle: no match for', op.selector);
        return;
      }
      els.forEach((el) => {
        el.style[op.property] = op.value;
      });
      break;
    }

    case 'replaceAttr': {
      const el = _sel(doc, op.selector);
      if (!el) return;
      el.setAttribute(op.attr, op.value);
      break;
    }

    case 'replaceText': {
      const el = _sel(doc, op.selector);
      if (!el) return;
      // Preserve child elements, only replace text nodes
      // Simple: if no child elements, set textContent directly
      if (el.children.length === 0) {
        el.textContent = op.text;
      } else {
        // Replace first text node only
        for (const child of el.childNodes) {
          if (child.nodeType === 3) {
            child.textContent = op.text;
            break;
          }
        }
      }
      break;
    }

    case 'addClass': {
      const el = _sel(doc, op.selector);
      if (!el) return;
      el.classList.add(op.class);
      break;
    }

    case 'removeClass': {
      const el = _sel(doc, op.selector);
      if (!el) return;
      el.classList.remove(op.class);
      break;
    }

    case 'insertBefore': {
      const el = _sel(doc, op.selector);
      if (!el || !el.parentNode) return;
      el.insertAdjacentHTML('beforebegin', op.html);
      break;
    }

    case 'insertAfter': {
      const el = _sel(doc, op.selector);
      if (!el) return;
      el.insertAdjacentHTML('afterend', op.html);
      break;
    }

    case 'remove': {
      const el = _sel(doc, op.selector);
      if (!el) return;
      el.remove();
      break;
    }

    case 'replaceCSS': {
      // ACTUALLY replace: find and replace an existing rule, or append if absent.
      const styleEl = _getOrCreateStyle(doc);
      const rulePattern = new RegExp(
        // Escape the selector for regex
        escapeRegex(op.selector) + '\\s*\\{[^}]*\\}',
        'g',
      );
      if (rulePattern.test(styleEl.textContent)) {
        styleEl.textContent = styleEl.textContent.replace(
          rulePattern,
          `${op.selector} { ${op.css} }`,
        );
      } else {
        styleEl.textContent += `\n${op.selector} { ${op.css} }`;
      }
      break;
    }

    case 'injectStyle': {
      const styleEl = _getOrCreateStyle(doc);
      styleEl.textContent += '\n' + op.css;
      break;
    }

    default:
      console.warn('[differ] unknown op:', op.op);
  }
}

function _getOrCreateStyle(doc) {
  // Prefer the last <style> tag (most likely to be the custom styles)
  const styles = doc.querySelectorAll('style');
  if (styles.length > 0) return styles[styles.length - 1];
  const s = doc.createElement('style');
  (doc.head || doc.documentElement).appendChild(s);
  return s;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── Main entry point ─────────────────────────────────────────────────────────
export function applyLlmResponse(currentHtml, llmText) {
  const parsed = parseLlmResponse(llmText);
  if (!parsed) return { newHtml: currentHtml, type: 'noop' };
  if (parsed.type === 'full') return { newHtml: parsed.payload, type: 'full' };
  const newHtml = applyDiff(currentHtml, parsed.payload);
  return { newHtml, type: 'diff', ops: parsed.payload };
}
