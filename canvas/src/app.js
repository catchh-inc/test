/**
 * App bootstrap — wires everything together.
 */

import {
  getState,
  setActivePage,
  setSelection,
  clearSelection,
  on,
} from './state.js';
import {
  initCanvas,
  zoomIn,
  zoomOut,
  zoomReset,
  getIframe,
  clearSelectionInIframe,
} from './canvas.js';
import { initPages } from './pages.js';
import { initProperties } from './properties.js';
import { initChat } from './chat.js';

export function boot() {
  // ── DOM references ─────────────────────────────────────────────────────────
  const canvasContainer = document.getElementById('canvas-container');
  const pagesSidebar = document.getElementById('pages-sidebar');
  const propertiesPanel = document.getElementById('properties-panel');
  const chatPanel = document.getElementById('chat-panel');

  // ── Init subsystems ────────────────────────────────────────────────────────
  initCanvas(canvasContainer);
  initPages(pagesSidebar);
  initProperties(propertiesPanel);
  initChat(chatPanel);

  // ── Global iframe postMessage router ──────────────────────────────────────
  // All iframes post to window; we route by checking which iframe sent it.
  window.addEventListener('message', (e) => {
    if (!e.data || !e.data.type) return;

    if (e.data.type === 'canvas:selection') {
      // Find which pageId this came from
      const { pages } = getState();
      for (const page of pages) {
        const iframe = getIframe(page.id);
        if (iframe && iframe.contentWindow === e.source) {
          // Activate the page this came from
          setActivePage(page.id);
          setSelection(e.data.payload);
          break;
        }
      }
    }
  });

  // ── Toolbar actions ────────────────────────────────────────────────────────
  document.getElementById('btn-zoom-in')?.addEventListener('click', zoomIn);
  document.getElementById('btn-zoom-out')?.addEventListener('click', zoomOut);
  document
    .getElementById('btn-zoom-reset')
    ?.addEventListener('click', zoomReset);

  // Export current page HTML
  document.getElementById('btn-export')?.addEventListener('click', () => {
    const { pages, activePageId } = getState();
    const page = pages.find((p) => p.id === activePageId);
    if (!page) return;
    const blob = new Blob([page.html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${page.name.replace(/\s+/g, '-').toLowerCase()}.html`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // Zoom percentage readout
  on('viewport:changed', ({ zoom }) => {
    const el = document.getElementById('zoom-readout');
    if (el) el.textContent = `${Math.round(zoom * 100)}%`;
  });

  // Page name in toolbar
  on('page:activated', ({ pageId }) => {
    const { pages } = getState();
    const page = pages.find((p) => p.id === pageId);
    const el = document.getElementById('active-page-name');
    if (el && page) el.textContent = page.name;
  });

  on('pages:changed', () => {
    const { pages, activePageId } = getState();
    const page = pages.find((p) => p.id === activePageId);
    const el = document.getElementById('active-page-name');
    if (el && page) el.textContent = page.name;
  });

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    // Escape: clear selection (don't fire when typing in inputs)
    if (e.key === 'Escape') {
      const tag = document.activeElement?.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT') return;
      const { activePageId } = getState();
      clearSelectionInIframe(activePageId);
      clearSelection();
    }

    // Cmd/Ctrl +/- for zoom
    if ((e.metaKey || e.ctrlKey) && e.key === '=') {
      e.preventDefault();
      zoomIn();
    }
    if ((e.metaKey || e.ctrlKey) && e.key === '-') {
      e.preventDefault();
      zoomOut();
    }
    if ((e.metaKey || e.ctrlKey) && e.key === '0') {
      e.preventDefault();
      zoomReset();
    }
  });

  // ── Panel resize (drag handle) ─────────────────────────────────────────────
  _initResizeHandles();

  // Initial active page name
  const { pages, activePageId } = getState();
  const activePage = pages.find((p) => p.id === activePageId);
  const nameEl = document.getElementById('active-page-name');
  if (nameEl && activePage) nameEl.textContent = activePage.name;
}

function _initResizeHandles() {
  // Pages sidebar resize
  const pagesHandle = document.getElementById('pages-resize-handle');
  const pagesSidebar = document.getElementById('pages-sidebar');
  if (pagesHandle && pagesSidebar) {
    _makeDragResizable(
      pagesHandle,
      pagesSidebar,
      'width',
      140,
      360,
      'horizontal',
    );
  }

  // Right panel (properties + chat) resize
  const propsHandle = document.getElementById('props-resize-handle');
  const rightPanel = document.getElementById('right-panel');
  if (propsHandle && rightPanel) {
    _makeDragResizable(
      propsHandle,
      rightPanel,
      'width',
      260,
      560,
      'horizontal-reverse',
    );
  }
}

function _makeDragResizable(handle, panel, dimension, min, max, direction) {
  let startX, startSize;

  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    startX = e.clientX;
    startSize = panel.getBoundingClientRect()[dimension];
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    const onMove = (e) => {
      const delta = direction.includes('reverse')
        ? startX - e.clientX
        : e.clientX - startX;
      const newSize = Math.min(max, Math.max(min, startSize + delta));
      panel.style[dimension] = `${newSize}px`;
    };

    const onUp = () => {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });
}
