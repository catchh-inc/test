/**
 * Root App — layout + global event wiring.
 */
import { useEffect, useRef } from 'react';
import { useStore } from './lib/store';
import { getIframe, clearSelectionInIframe } from './components/PageFrame';

import Toolbar from './components/Toolbar';
import PagesSidebar from './components/PagesSidebar';
import Canvas from './components/Canvas';
import PropertiesPanel from './components/PropertiesPanel';
import ChatPanel from './components/ChatPanel';

export default function App() {
  const { setActivePage, setSelection } = useStore();

  // ── Global postMessage router ─────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (!e.data?.type) return;
      if (e.data.type === 'canvas:selection') {
        // Identify which page sent this by matching contentWindow
        const { pages: ps } = useStore.getState();
        for (const page of ps) {
          const iframeEl = getIframe(page.id);
          if (iframeEl?.contentWindow === e.source) {
            setActivePage(page.id);
            setSelection(e.data.payload);
            break;
          }
        }
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [setActivePage, setSelection]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.key === 'Escape') {
        const { activePageId, clearSelection } = useStore.getState();
        clearSelectionInIframe(activePageId);
        clearSelection();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '=') {
        e.preventDefault();
        window.__canvas_zoomIn?.();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '-') {
        e.preventDefault();
        window.__canvas_zoomOut?.();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '0') {
        e.preventDefault();
        window.__canvas_fitPage?.();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // ── Resizable panels (pages sidebar + right panel) ────────────────────────
  const pagesSidebarRef = useRef(null);
  const rightPanelRef = useRef(null);

  return (
    <div className="app">
      <Toolbar />
      <div className="main-layout">
        {/* Pages sidebar */}
        <div ref={pagesSidebarRef} className="sidebar-wrapper">
          <PagesSidebar />
        </div>
        <ResizeHandle
          onDrag={(dx) => {
            const el = pagesSidebarRef.current;
            if (!el) return;
            const w = Math.min(360, Math.max(140, el.offsetWidth + dx));
            el.style.width = `${w}px`;
          }}
        />

        {/* Canvas */}
        <Canvas />

        {/* Right panel resize handle */}
        <ResizeHandle
          reverse
          onDrag={(dx) => {
            const el = rightPanelRef.current;
            if (!el) return;
            const w = Math.min(580, Math.max(260, el.offsetWidth - dx));
            el.style.width = `${w}px`;
          }}
        />

        {/* Right panel */}
        <div ref={rightPanelRef} className="right-panel">
          <PropertiesPanel />
          <div className="panel-divider" />
          <ChatPanel />
        </div>
      </div>
    </div>
  );
}

// ── Drag-resize handle ───────────────────────────────────────────────────────
function ResizeHandle({ onDrag, reverse = false }) {
  const startX = useRef(0);

  const onMouseDown = (e) => {
    e.preventDefault();
    startX.current = e.clientX;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    const onMove = (ev) => {
      const dx = ev.clientX - startX.current;
      startX.current = ev.clientX;
      onDrag(reverse ? -dx : dx);
    };
    const onUp = () => {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return <div className="resize-handle" onMouseDown={onMouseDown} />;
}
