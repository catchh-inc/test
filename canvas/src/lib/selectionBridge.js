/**
 * Selection bridge — injected into every iframe.
 *
 * Responsibilities:
 *  - Blue outline on hover
 *  - Red outline on click-select (Shift/Meta/Ctrl for multi-select)
 *  - postMessages parent with clean element data (no internal classes)
 *  - Blocks all navigation (links, forms, keyboard shortcuts)
 *  - Listens for canvas:clearSelection from parent
 *
 * Selector strategy: generates the most specific unambiguous selector possible:
 *   1. If element has id → #id
 *   2. Otherwise build a full path from body, using nth-of-type at each step
 *      where there are siblings of the same tag.
 */

export function getSelectionBridgeScript() {
  return `<script id="__canvas_bridge__">
(function(){
  'use strict';

  var HOVER_CLASS = '__ch__';
  var SEL_CLASS   = '__cs__';
  var BRIDGE_CLASSES = [HOVER_CLASS, SEL_CLASS];

  var hoveredEl   = null;
  var selectedEls = [];

  /* ── Style injection ──────────────────────────────────────────────── */
  var style = document.createElement('style');
  style.textContent =
    '.__ch__ { outline: 2px solid #3b82f6 !important; outline-offset: 2px; cursor: crosshair !important; }' +
    '.__cs__ { outline: 2px solid #ef4444 !important; outline-offset: 2px; background-color: rgba(239,68,68,0.04) !important; }';
  (document.head || document.documentElement).appendChild(style);

  /* ── Unique stable selector ───────────────────────────────────────── */
  function getSelector(el) {
    if (!el || el.nodeType !== 1) return 'body';
    if (el === document.body) return 'body';
    if (el === document.documentElement) return 'html';

    // Walk up and build parts
    var parts = [];
    var cur = el;

    while (cur && cur !== document.body && cur !== document.documentElement) {
      var part;
      if (cur.id) {
        // ID is unique — anchor here and stop
        part = '#' + CSS.escape(cur.id);
        parts.unshift(part);
        return parts.join(' > ');
      }

      // Use tag + nth-of-type for precision
      var tag = cur.tagName.toLowerCase();
      var parent = cur.parentElement;
      if (parent) {
        var siblings = Array.from(parent.children).filter(function(c) {
          return c.tagName === cur.tagName;
        });
        if (siblings.length > 1) {
          var idx = siblings.indexOf(cur) + 1;
          part = tag + ':nth-of-type(' + idx + ')';
        } else {
          part = tag;
        }
      } else {
        part = tag;
      }

      parts.unshift(part);
      cur = cur.parentElement;
    }

    // Prepend body for absolute specificity
    parts.unshift('body');
    return parts.join(' > ');
  }

  /* ── XPath ────────────────────────────────────────────────────────── */
  function getXPath(el) {
    if (!el || el.nodeType !== 1) return '';
    var parts = [];
    var cur = el;
    while (cur && cur.nodeType === 1 && cur !== document.documentElement) {
      var tag = cur.tagName.toLowerCase();
      var siblings = cur.parentNode
        ? Array.from(cur.parentNode.children).filter(function(c) { return c.tagName === cur.tagName; })
        : [];
      var idx = siblings.indexOf(cur) + 1;
      parts.unshift(tag + (siblings.length > 1 ? '[' + idx + ']' : ''));
      cur = cur.parentNode;
    }
    return '//' + parts.join('/');
  }

  /* ── Key computed styles ──────────────────────────────────────────── */
  function getKeyStyles(el) {
    var cs = window.getComputedStyle(el);
    return {
      color:           cs.color,
      backgroundColor: cs.backgroundColor,
      fontSize:        cs.fontSize,
      fontFamily:      cs.fontFamily,
      fontWeight:      cs.fontWeight,
      lineHeight:      cs.lineHeight,
      padding:         cs.padding,
      margin:          cs.margin,
      borderRadius:    cs.borderRadius,
      border:          cs.border,
      display:         cs.display,
      width:           cs.width,
      height:          cs.height,
      textAlign:       cs.textAlign,
      opacity:         cs.opacity
    };
  }

  /* ── Clean outerHTML — strip bridge classes before capturing ──────── */
  function cleanOuterHTML(el) {
    // Clone, strip bridge classes, return outerHTML
    var clone = el.cloneNode(true);
    clone.classList.remove(HOVER_CLASS, SEL_CLASS);
    // Also clean descendants
    clone.querySelectorAll('.' + HOVER_CLASS + ', .' + SEL_CLASS).forEach(function(d) {
      d.classList.remove(HOVER_CLASS, SEL_CLASS);
    });
    // Remove empty class attributes
    if (clone.getAttribute('class') === '') clone.removeAttribute('class');
    return clone.outerHTML;
  }

  /* ── Broadcast current selection to parent ────────────────────────── */
  function broadcast() {
    var payload = selectedEls.map(function(s) {
      return {
        selector:       getSelector(s),
        xpath:          getXPath(s),
        outerHTML:      cleanOuterHTML(s),
        tagName:        s.tagName.toLowerCase(),
        computedStyles: getKeyStyles(s)
      };
    });
    window.parent.postMessage({ type: 'canvas:selection', payload: payload }, '*');
  }

  /* ── Hover ────────────────────────────────────────────────────────── */
  document.addEventListener('mouseover', function(e) {
    var el = e.target;
    if (el === document.body || el === document.documentElement) return;
    if (hoveredEl && hoveredEl !== el) hoveredEl.classList.remove(HOVER_CLASS);
    hoveredEl = el;
    el.classList.add(HOVER_CLASS);
  }, true);

  document.addEventListener('mouseout', function(e) {
    if (hoveredEl) hoveredEl.classList.remove(HOVER_CLASS);
    hoveredEl = null;
  }, true);

  /* ── Click-select ─────────────────────────────────────────────────── */
  document.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();

    var el = e.target;
    if (el === document.body || el === document.documentElement) {
      // Click on blank area — clear selection
      selectedEls.forEach(function(s) { s.classList.remove(SEL_CLASS); });
      selectedEls = [];
      broadcast();
      return;
    }

    var isMulti = e.shiftKey || e.metaKey || e.ctrlKey;

    if (!isMulti) {
      selectedEls.forEach(function(s) { s.classList.remove(SEL_CLASS); });
      selectedEls = [];
    }

    var idx = selectedEls.indexOf(el);
    if (idx > -1) {
      // Deselect
      el.classList.remove(SEL_CLASS);
      selectedEls.splice(idx, 1);
    } else {
      el.classList.add(SEL_CLASS);
      selectedEls.push(el);
    }

    broadcast();
  }, true);

  /* ── Messages from parent ─────────────────────────────────────────── */
  window.addEventListener('message', function(e) {
    if (!e.data) return;
    if (e.data.type === 'canvas:clearSelection') {
      selectedEls.forEach(function(s) { s.classList.remove(SEL_CLASS); });
      selectedEls = [];
      // Don't broadcast — parent already knows
    }
  });

  /* ── Block navigation ─────────────────────────────────────────────── */
  document.addEventListener('submit',   function(e) { e.preventDefault(); }, true);
  document.addEventListener('auxclick', function(e) { e.preventDefault(); }, true);
  // Block Ctrl/Cmd+R, Ctrl/Cmd+L (reload / address bar)
  document.addEventListener('keydown', function(e) {
    if ((e.metaKey || e.ctrlKey) && (e.key === 'r' || e.key === 'l' || e.key === 'w')) {
      e.preventDefault();
    }
  }, true);

})();
<\/script>`;
}

export function injectBridge(html) {
  const script = getSelectionBridgeScript();
  // Guard: don't double-inject (shouldn't happen since page.html is always clean,
  // but be defensive)
  if (html.includes('id="__canvas_bridge__"')) return html;
  if (html.includes('</body>')) {
    return html.replace('</body>', script + '\n</body>');
  }
  return html + '\n' + script;
}
