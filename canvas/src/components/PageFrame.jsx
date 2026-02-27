/**
 * PageFrame — renders a single HTML page inside a sandboxed iframe.
 *
 * Uses srcdoc to inject the HTML + selection bridge script.
 * Listens for 'canvas:selection' postMessages from the iframe via
 * a global listener registered in App.jsx.
 */
import { useEffect, useRef } from 'react';
import { injectBridge } from '../lib/selectionBridge';

// Registry so App.jsx can find iframe by pageId for postMessage
const iframeRegistry = new Map();
export const getIframe = (pageId) => iframeRegistry.get(pageId) ?? null;
export const clearSelectionInIframe = (pageId) => {
  const iframeEl = iframeRegistry.get(pageId);
  if (iframeEl?.contentWindow) {
    iframeEl.contentWindow.postMessage({ type: 'canvas:clearSelection' }, '*');
  }
};

export default function PageFrame({
  page,
  index,
  isActive,
  frameX,
  frameY,
  width,
  height,
  onActivate,
}) {
  const iframeRef = useRef(null);

  // Register / unregister in the global registry
  useEffect(() => {
    const el = iframeRef.current;
    if (el) iframeRegistry.set(page.id, el);
    return () => iframeRegistry.delete(page.id);
  }, [page.id]);

  // Update iframe content whenever page.html changes
  useEffect(() => {
    const el = iframeRef.current;
    if (!el) return;
    el.srcdoc = injectBridge(page.html);
  }, [page.html]);

  return (
    <div
      className={`page-frame-wrapper${isActive ? ' page-frame-active' : ''}`}
      style={{
        position: 'absolute',
        left: frameX,
        top: frameY,
        width,
        height,
      }}
      onClick={onActivate}
    >
      {/* Label above the frame */}
      <div className="page-frame-label">{page.name}</div>

      <iframe
        ref={iframeRef}
        title={page.name}
        className="page-frame-iframe"
        sandbox="allow-scripts allow-same-origin"
        style={{
          width,
          height,
          display: 'block',
          border: 'none',
          background: '#fff',
        }}
      />
    </div>
  );
}
