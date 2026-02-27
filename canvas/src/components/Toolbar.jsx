import { useStore } from '../lib/store';

export default function Toolbar() {
  const { pages, activePageId, viewport } = useStore();
  const page = pages.find((p) => p.id === activePageId);
  const zoomPct = Math.round(viewport.zoom * 100);

  const handleExport = () => {
    if (!page) return;
    const blob = new Blob([page.html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${page.name.replace(/\s+/g, '-').toLowerCase()}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <header className="toolbar">
      {/* Brand */}
      <div className="toolbar-left">
        <div className="toolbar-logo">
          <LogoSvg />
          <span className="toolbar-brand">Canvas</span>
        </div>
        <div className="toolbar-divider" />
        <span className="toolbar-page-name">{page?.name ?? ''}</span>
      </div>

      {/* Zoom */}
      <div className="toolbar-center">
        <button
          className="toolbar-btn"
          title="Zoom out (Ctrl −)"
          onClick={() => window.__canvas_zoomOut?.()}
        >
          <ZoomOutIcon />
        </button>
        <span className="toolbar-zoom">{zoomPct}%</span>
        <button
          className="toolbar-btn"
          title="Zoom in (Ctrl +)"
          onClick={() => window.__canvas_zoomIn?.()}
        >
          <ZoomInIcon />
        </button>
        <button
          className="toolbar-btn"
          title="Fit page (Ctrl 0)"
          onClick={() => window.__canvas_fitPage?.()}
        >
          <FitIcon />
        </button>
      </div>

      {/* Actions */}
      <div className="toolbar-right">
        <button
          className="toolbar-btn export-btn"
          title="Export page HTML"
          onClick={handleExport}
        >
          <ExportIcon /> Export
        </button>
      </div>
    </header>
  );
}

function LogoSvg() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx="8" fill="#3a3aff" />
      <rect
        x="7"
        y="7"
        width="8"
        height="8"
        rx="1.5"
        fill="white"
        opacity="0.9"
      />
      <rect
        x="17"
        y="7"
        width="8"
        height="8"
        rx="1.5"
        fill="white"
        opacity="0.6"
      />
      <rect
        x="7"
        y="17"
        width="8"
        height="8"
        rx="1.5"
        fill="white"
        opacity="0.6"
      />
      <rect
        x="17"
        y="17"
        width="8"
        height="8"
        rx="1.5"
        fill="white"
        opacity="0.9"
      />
    </svg>
  );
}
function ZoomOutIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="9" cy="9" r="6" />
      <line x1="13.5" y1="13.5" x2="18" y2="18" />
      <line x1="6" y1="9" x2="12" y2="9" />
    </svg>
  );
}
function ZoomInIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="9" cy="9" r="6" />
      <line x1="13.5" y1="13.5" x2="18" y2="18" />
      <line x1="9" y1="6" x2="9" y2="12" />
      <line x1="6" y1="9" x2="12" y2="9" />
    </svg>
  );
}
function FitIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="4" y="4" width="12" height="12" rx="2" />
      <path d="M8 4v4H4M12 4v4h4M8 16v-4H4M12 16v-4h4" />
    </svg>
  );
}
function ExportIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10 3v10M6 9l4 4 4-4" />
      <path d="M4 15v2h12v-2" />
    </svg>
  );
}
