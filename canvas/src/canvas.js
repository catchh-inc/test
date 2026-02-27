/**
 * Infinite canvas — pan, zoom, and renders page frames.
 *
 * Each page is rendered inside an <iframe> which is positioned absolutely
 * on the canvas transform layer.  The canvas itself is a <div> with
 * overflow:hidden that captures pointer events for pan/zoom.
 *
 * Page frames are laid out horizontally with a gap between them.
 */

import { getState, setViewport, on } from './state.js';

const FRAME_WIDTH = 1280;
const FRAME_HEIGHT = 800;
const FRAME_GAP = 80; // px between frames
const FRAME_LABEL_HEIGHT = 32;
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 4;

let _canvasEl = null; // outer clip container
let _worldEl = null; // the transform layer
let _frames = {}; // { [pageId]: { wrapper, iframe, label } }
let _selectionOverlayEl = null; // absolute overlay for selection rects drawn on top

export function initCanvas(containerEl) {
  _canvasEl = containerEl;
  _canvasEl.classList.add('canvas-viewport');

  _worldEl = document.createElement('div');
  _worldEl.className = 'canvas-world';
  _canvasEl.appendChild(_worldEl);

  _selectionOverlayEl = document.createElement('div');
  _selectionOverlayEl.className = 'canvas-selection-overlay';
  _canvasEl.appendChild(_selectionOverlayEl);

  _bindPanZoom();

  // React to state changes
  on('pages:changed', ({ pages }) => _syncFrames(pages));
  on('page:activated', ({ pageId }) => _highlightActiveFrame(pageId));
  on('page:html:updated', ({ pageId, html }) => _reloadFrame(pageId, html));
  on('selection:changed', ({ elements }) => _drawSelectionRects(elements));

  // Initial render
  const { pages } = getState();
  _syncFrames(pages);
  _applyViewport();
  _highlightActiveFrame(getState().activePageId);

  // Fit the first page into view
  requestAnimationFrame(() => fitPage(getState().activePageId));
}

// ─── Frame management ────────────────────────────────────────────────────────

function _frameX(index) {
  return index * (FRAME_WIDTH + FRAME_GAP);
}

function _syncFrames(pages) {
  // Remove frames for deleted pages
  Object.keys(_frames).forEach((id) => {
    if (!pages.find((p) => p.id === id)) {
      _frames[id].wrapper.remove();
      delete _frames[id];
    }
  });

  // Add frames for new pages
  pages.forEach((page, index) => {
    if (!_frames[page.id]) {
      _createFrame(page, index);
    } else {
      // Reposition if index changed (top stays constant, only x changes per page)
      _frames[page.id].wrapper.style.left = `${_frameX(index)}px`;
      _frames[page.id].wrapper.style.top = `${WORLD_PADDING_TOP}px`;
    }
  });
}

const WORLD_PADDING_TOP = 60; // px of space above frames in world space

function _createFrame(page, index) {
  const wrapper = document.createElement('div');
  wrapper.className = 'canvas-frame-wrapper';
  wrapper.style.left = `${_frameX(index)}px`;
  wrapper.style.top = `${WORLD_PADDING_TOP}px`;
  wrapper.style.width = `${FRAME_WIDTH}px`;
  wrapper.style.height = `${FRAME_HEIGHT}px`;
  wrapper.dataset.pageId = page.id;

  const label = document.createElement('div');
  label.className = 'canvas-frame-label';
  label.style.top = `-${FRAME_LABEL_HEIGHT}px`;
  label.textContent = page.name;
  wrapper.appendChild(label);

  const iframe = document.createElement('iframe');
  iframe.className = 'canvas-frame-iframe';
  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
  iframe.style.width = `${FRAME_WIDTH}px`;
  iframe.style.height = `${FRAME_HEIGHT}px`;
  wrapper.appendChild(iframe);

  _worldEl.appendChild(wrapper);
  _frames[page.id] = { wrapper, iframe, label };

  _writeIframeContent(page.id, page.html);
  _attachFrameClickHandler(page.id);
}

function _writeIframeContent(pageId, html) {
  const frame = _frames[pageId];
  if (!frame) return;
  const { iframe } = frame;

  // Use srcdoc for clean isolated rendering
  iframe.srcdoc = _injectSelectionBridge(html);
}

/**
 * Inject a small script into the iframe that:
 * 1. Highlights hovered elements
 * 2. Posts click/selection messages to parent
 */
function _injectSelectionBridge(html) {
  const bridge = `
<script id="__canvas_bridge__">
(function() {
  var _hoveredEl = null;
  var _selectedEls = [];

  function getSelector(el) {
    if (!el || el === document.body || el === document.documentElement) return 'body';
    if (el.id) return '#' + CSS.escape(el.id);
    var parts = [];
    var cur = el;
    while (cur && cur !== document.documentElement) {
      var tag = cur.tagName.toLowerCase();
      var idx = Array.from(cur.parentNode ? cur.parentNode.children : [])
        .filter(function(c){ return c.tagName === cur.tagName; })
        .indexOf(cur);
      parts.unshift(tag + (idx > 0 ? ':nth-of-type(' + (idx+1) + ')' : ''));
      cur = cur.parentNode;
      if (cur && cur.id) { parts.unshift('#' + CSS.escape(cur.id)); break; }
    }
    return parts.join(' > ');
  }

  function getXPath(el) {
    if (!el || el.nodeType !== 1) return '';
    var parts = [];
    while (el && el.nodeType === 1 && el !== document.documentElement) {
      var tag = el.tagName.toLowerCase();
      var siblings = Array.from(el.parentNode ? el.parentNode.children : [])
        .filter(function(c){ return c.tagName === el.tagName; });
      var idx = siblings.indexOf(el) + 1;
      parts.unshift(tag + (siblings.length > 1 ? '[' + idx + ']' : ''));
      el = el.parentNode;
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
      opacity: cs.opacity,
    };
  }

  var style = document.createElement('style');
  style.textContent = [
    '.__canvas_hover__ { outline: 2px solid #4f8ef7 !important; outline-offset: 1px; cursor: crosshair !important; }',
    '.__canvas_selected__ { outline: 2px solid #ff5f5f !important; outline-offset: 1px; background-color: rgba(255,95,95,0.05) !important; }',
  ].join('\\n');
  document.head.appendChild(style);

  document.addEventListener('mouseover', function(e) {
    var el = e.target;
    if (el === document.body || el === document.documentElement || el.id === '__canvas_bridge__') return;
    if (_hoveredEl && _hoveredEl !== el) _hoveredEl.classList.remove('__canvas_hover__');
    _hoveredEl = el;
    el.classList.add('__canvas_hover__');
  }, true);

  document.addEventListener('mouseout', function(e) {
    if (_hoveredEl) _hoveredEl.classList.remove('__canvas_hover__');
    _hoveredEl = null;
  }, true);

  document.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    var el = e.target;
    if (el === document.body || el === document.documentElement) return;

    var isMulti = e.shiftKey || e.metaKey || e.ctrlKey;

    if (!isMulti) {
      _selectedEls.forEach(function(s){ s.classList.remove('__canvas_selected__'); });
      _selectedEls = [];
    }

    var alreadyIdx = _selectedEls.indexOf(el);
    if (alreadyIdx > -1) {
      el.classList.remove('__canvas_selected__');
      _selectedEls.splice(alreadyIdx, 1);
    } else {
      el.classList.add('__canvas_selected__');
      _selectedEls.push(el);
    }

    var payload = _selectedEls.map(function(s) {
      return {
        selector: getSelector(s),
        xpath: getXPath(s),
        outerHTML: s.outerHTML,
        tagName: s.tagName.toLowerCase(),
        computedStyles: getKeyStyles(s),
      };
    });

    window.parent.postMessage({ type: 'canvas:selection', payload: payload }, '*');
  }, true);

  // Listen for clear-selection from parent
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'canvas:clearSelection') {
      _selectedEls.forEach(function(s){ s.classList.remove('__canvas_selected__'); });
      _selectedEls = [];
    }
  });

  // Prevent default link/form navigation
  document.addEventListener('submit', function(e){ e.preventDefault(); }, true);
  document.addEventListener('auxclick', function(e){ e.preventDefault(); }, true);
})();
<\/script>`;

  // Insert bridge just before </body>
  if (html.includes('</body>')) {
    return html.replace('</body>', bridge + '\n</body>');
  }
  return html + bridge;
}

function _attachFrameClickHandler(pageId) {
  // We receive messages from the iframe via postMessage
  // The global listener in app.js handles routing; canvas just exposes the API.
}

function _reloadFrame(pageId, html) {
  const frame = _frames[pageId];
  if (!frame) return;
  _writeIframeContent(pageId, html);
}

function _highlightActiveFrame(activePageId) {
  Object.entries(_frames).forEach(([id, { wrapper }]) => {
    wrapper.classList.toggle('canvas-frame-active', id === activePageId);
  });
}

// ─── Selection overlay (drawn on top of canvas, in viewport coords) ──────────

function _drawSelectionRects(_elements) {
  // Selection highlighting is done inside the iframe via CSS classes.
  // The overlay layer is reserved for future marquee-select rectangle.
  _selectionOverlayEl.innerHTML = '';
}

// ─── Pan / Zoom ──────────────────────────────────────────────────────────────

let _isPanning = false;
let _panStart = { x: 0, y: 0 };
let _vpStart = { x: 0, y: 0 };

function _bindPanZoom() {
  _canvasEl.addEventListener('wheel', _onWheel, { passive: false });
  _canvasEl.addEventListener('mousedown', _onMouseDown);
  window.addEventListener('mousemove', _onMouseMove);
  window.addEventListener('mouseup', _onMouseUp);

  // Touch support
  _canvasEl.addEventListener('touchstart', _onTouchStart, { passive: false });
  _canvasEl.addEventListener('touchmove', _onTouchMove, { passive: false });
  _canvasEl.addEventListener('touchend', _onTouchEnd);
}

function _onWheel(e) {
  e.preventDefault();

  const { viewport } = getState();
  const rect = _canvasEl.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  if (e.ctrlKey || e.metaKey) {
    // Pinch-zoom or ctrl+scroll → zoom
    const delta = e.deltaY < 0 ? 1.1 : 0.9;
    const newZoom = Math.min(
      MAX_ZOOM,
      Math.max(MIN_ZOOM, viewport.zoom * delta),
    );
    const zoomRatio = newZoom / viewport.zoom;
    const newX = mouseX - (mouseX - viewport.x) * zoomRatio;
    const newY = mouseY - (mouseY - viewport.y) * zoomRatio;
    setViewport({ zoom: newZoom, x: newX, y: newY });
  } else {
    // Pan
    setViewport({ x: viewport.x - e.deltaX, y: viewport.y - e.deltaY });
  }
  _applyViewport();
}

function _onMouseDown(e) {
  // Middle mouse or space+left = pan
  if (e.button === 1 || (e.button === 0 && e.altKey)) {
    e.preventDefault();
    _isPanning = true;
    const { viewport } = getState();
    _panStart = { x: e.clientX, y: e.clientY };
    _vpStart = { x: viewport.x, y: viewport.y };
    _canvasEl.style.cursor = 'grabbing';
  }
}

function _onMouseMove(e) {
  if (!_isPanning) return;
  const dx = e.clientX - _panStart.x;
  const dy = e.clientY - _panStart.y;
  setViewport({ x: _vpStart.x + dx, y: _vpStart.y + dy });
  _applyViewport();
}

function _onMouseUp() {
  _isPanning = false;
  _canvasEl.style.cursor = '';
}

// Touch pinch-zoom
let _lastTouchDist = null;
function _onTouchStart(e) {
  if (e.touches.length === 2) {
    _lastTouchDist = _touchDist(e.touches);
  }
}
function _onTouchMove(e) {
  if (e.touches.length === 2) {
    e.preventDefault();
    const dist = _touchDist(e.touches);
    if (_lastTouchDist) {
      const { viewport } = getState();
      const delta = dist / _lastTouchDist;
      const newZoom = Math.min(
        MAX_ZOOM,
        Math.max(MIN_ZOOM, viewport.zoom * delta),
      );
      setViewport({ zoom: newZoom });
      _applyViewport();
    }
    _lastTouchDist = dist;
  }
}
function _onTouchEnd() {
  _lastTouchDist = null;
}
function _touchDist(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function _applyViewport() {
  const { viewport } = getState();
  _worldEl.style.transform = `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`;
  _worldEl.style.transformOrigin = '0 0';
}

// ─── Public helpers ──────────────────────────────────────────────────────────

export function fitPage(pageId) {
  const { pages, viewport: _vp } = getState();
  const pageIndex = pages.findIndex((p) => p.id === pageId);
  if (pageIndex < 0) return;

  const rect = _canvasEl.getBoundingClientRect();
  const padding = 60;
  const zoom = Math.min(
    (rect.width - padding * 2) / FRAME_WIDTH,
    (rect.height - padding * 2) / FRAME_HEIGHT,
    1,
  );
  // Centre the target page frame horizontally and vertically
  const x =
    rect.width / 2 - (FRAME_WIDTH * zoom) / 2 - _frameX(pageIndex) * zoom;
  // Account for WORLD_PADDING_TOP in vertical centering
  const y = (rect.height - FRAME_HEIGHT * zoom) / 2 - WORLD_PADDING_TOP * zoom;
  setViewport({ zoom, x, y });
  _applyViewport();
}

export function zoomIn() {
  const { viewport } = getState();
  const newZoom = Math.min(MAX_ZOOM, viewport.zoom * 1.25);
  const rect = _canvasEl.getBoundingClientRect();
  const cx = rect.width / 2;
  const cy = rect.height / 2;
  const zr = newZoom / viewport.zoom;
  setViewport({
    zoom: newZoom,
    x: cx - (cx - viewport.x) * zr,
    y: cy - (cy - viewport.y) * zr,
  });
  _applyViewport();
}

export function zoomOut() {
  const { viewport } = getState();
  const newZoom = Math.max(MIN_ZOOM, viewport.zoom * 0.8);
  const rect = _canvasEl.getBoundingClientRect();
  const cx = rect.width / 2;
  const cy = rect.height / 2;
  const zr = newZoom / viewport.zoom;
  setViewport({
    zoom: newZoom,
    x: cx - (cx - viewport.x) * zr,
    y: cy - (cy - viewport.y) * zr,
  });
  _applyViewport();
}

export function zoomReset() {
  fitPage(getState().activePageId);
}

export function getFrameWidth() {
  return FRAME_WIDTH;
}
export function getFrameHeight() {
  return FRAME_HEIGHT;
}

export function updateFrameLabel(pageId, name) {
  const frame = _frames[pageId];
  if (frame) frame.label.textContent = name;
}

export function getIframe(pageId) {
  return _frames[pageId]?.iframe || null;
}

export function clearSelectionInIframe(pageId) {
  const iframe = getIframe(pageId);
  if (iframe?.contentWindow) {
    iframe.contentWindow.postMessage({ type: 'canvas:clearSelection' }, '*');
  }
}
