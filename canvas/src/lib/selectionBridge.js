/**
 * Returns the script string injected into every iframe.
 * It:
 *  - Highlights hovered elements with a blue outline
 *  - On click, toggles selection (red outline) and postMessages to parent
 *  - Supports Shift/Ctrl/Meta for multi-select
 *  - Listens for 'canvas:clearSelection' message from parent
 *  - Blocks all link/form navigations
 */
export function getSelectionBridgeScript() {
  // We serialise this as a string to inject via srcdoc.
  // NOTE: the closing </script> is escaped as <\/script> to avoid
  // breaking the surrounding HTML parser.
  return `<script id="__canvas_bridge__">
(function(){
  var hoveredEl = null;
  var selectedEls = [];

  function getSelector(el) {
    if (!el || el === document.body || el === document.documentElement) return 'body';
    if (el.id) return '#' + CSS.escape(el.id);
    var parts = [];
    var cur = el;
    while (cur && cur !== document.documentElement) {
      var tag = cur.tagName.toLowerCase();
      var sameTag = Array.from(cur.parentNode ? cur.parentNode.children : [])
        .filter(function(c){ return c.tagName === cur.tagName; });
      var idx = sameTag.indexOf(cur);
      parts.unshift(tag + (sameTag.length > 1 ? ':nth-of-type(' + (idx + 1) + ')' : ''));
      cur = cur.parentNode;
      if (cur && cur.id) { parts.unshift('#' + CSS.escape(cur.id)); break; }
    }
    return parts.join(' > ');
  }

  function getXPath(el) {
    if (!el || el.nodeType !== 1) return '';
    var parts = [];
    var cur = el;
    while (cur && cur.nodeType === 1 && cur !== document.documentElement) {
      var tag = cur.tagName.toLowerCase();
      var siblings = Array.from(cur.parentNode ? cur.parentNode.children : [])
        .filter(function(c){ return c.tagName === cur.tagName; });
      var idx = siblings.indexOf(cur) + 1;
      parts.unshift(tag + (siblings.length > 1 ? '[' + idx + ']' : ''));
      cur = cur.parentNode;
    }
    return '//' + parts.join('/');
  }

  function getKeyStyles(el) {
    var cs = window.getComputedStyle(el);
    return {
      color: cs.color,
      backgroundColor: cs.backgroundColor,
      fontSize: cs.fontSize,
      fontFamily: cs.fontFamily,
      fontWeight: cs.fontWeight,
      lineHeight: cs.lineHeight,
      padding: cs.padding,
      margin: cs.margin,
      borderRadius: cs.borderRadius,
      border: cs.border,
      display: cs.display,
      width: cs.width,
      height: cs.height,
      textAlign: cs.textAlign,
      opacity: cs.opacity
    };
  }

  // Inject hover/selection styles
  var style = document.createElement('style');
  style.textContent =
    '.__ch__ { outline: 2px solid #3a7dff !important; outline-offset: 2px; cursor: crosshair !important; }' +
    '.__cs__ { outline: 2px solid #ff4444 !important; outline-offset: 2px; background-color: rgba(255,68,68,0.04) !important; }';
  (document.head || document.documentElement).appendChild(style);

  document.addEventListener('mouseover', function(e) {
    var el = e.target;
    if (el === document.body || el === document.documentElement) return;
    if (hoveredEl && hoveredEl !== el) hoveredEl.classList.remove('__ch__');
    hoveredEl = el;
    el.classList.add('__ch__');
  }, true);

  document.addEventListener('mouseout', function(e) {
    if (hoveredEl) hoveredEl.classList.remove('__ch__');
    hoveredEl = null;
  }, true);

  document.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    var el = e.target;
    if (el === document.body || el === document.documentElement) return;
    var multi = e.shiftKey || e.metaKey || e.ctrlKey;
    if (!multi) {
      selectedEls.forEach(function(s){ s.classList.remove('__cs__'); });
      selectedEls = [];
    }
    var idx = selectedEls.indexOf(el);
    if (idx > -1) {
      el.classList.remove('__cs__');
      selectedEls.splice(idx, 1);
    } else {
      el.classList.add('__cs__');
      selectedEls.push(el);
    }
    var payload = selectedEls.map(function(s) {
      return {
        selector: getSelector(s),
        xpath: getXPath(s),
        outerHTML: s.outerHTML,
        tagName: s.tagName.toLowerCase(),
        computedStyles: getKeyStyles(s)
      };
    });
    window.parent.postMessage({ type: 'canvas:selection', payload: payload }, '*');
  }, true);

  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'canvas:clearSelection') {
      selectedEls.forEach(function(s){ s.classList.remove('__cs__'); });
      selectedEls = [];
    }
  });

  // Block navigation
  document.addEventListener('submit', function(e){ e.preventDefault(); }, true);
  document.addEventListener('auxclick', function(e){ e.preventDefault(); }, true);
  document.addEventListener('keydown', function(e){
    if ((e.metaKey || e.ctrlKey) && (e.key === 'r' || e.key === 'l')) e.preventDefault();
  }, true);
})();
<\/script>`;
}

export function injectBridge(html) {
  const script = getSelectionBridgeScript();
  if (html.includes('</body>')) {
    return html.replace('</body>', script + '\n</body>');
  }
  return html + '\n' + script;
}
