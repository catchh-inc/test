import { useState, useRef, useEffect } from 'react';
import { useStore } from '../lib/store';

export default function PagesSidebar() {
  const {
    pages,
    activePageId,
    addPage,
    deletePage,
    renamePage,
    setActivePage,
  } = useStore();

  const handleAdd = () => {
    const page = addPage();
    // Fit the new page into view after React has rendered the iframe
    requestAnimationFrame(() => {
      window.__canvas_fitPage?.(page.id);
    });
  };

  const handleActivate = (id) => {
    setActivePage(id);
    requestAnimationFrame(() => window.__canvas_fitPage?.(id));
  };

  return (
    <aside className="pages-sidebar">
      <div className="pages-header">
        <span className="pages-title">Pages</span>
        <button className="icon-btn" title="Add page" onClick={handleAdd}>
          <PlusIcon />
        </button>
      </div>
      <ul className="pages-list">
        {pages.map((page) => (
          <PageItem
            key={page.id}
            page={page}
            isActive={page.id === activePageId}
            canDelete={pages.length > 1}
            onActivate={() => handleActivate(page.id)}
            onDelete={() => {
              if (window.confirm(`Delete "${page.name}"?`)) deletePage(page.id);
            }}
            onRename={(name) => renamePage(page.id, name)}
          />
        ))}
      </ul>
    </aside>
  );
}

function PageItem({
  page,
  isActive,
  canDelete,
  onActivate,
  onDelete,
  onRename,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(page.name);
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    const name = draft.trim() || page.name;
    setDraft(name);
    onRename(name);
    setEditing(false);
  };

  return (
    <li
      className={`pages-item${isActive ? ' active' : ''}`}
      onClick={onActivate}
    >
      <PageIcon className="pages-item-icon" />

      {editing ? (
        <input
          ref={inputRef}
          className="pages-rename-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            }
            if (e.key === 'Escape') {
              setDraft(page.name);
              setEditing(false);
            }
            e.stopPropagation();
          }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span
          className="pages-item-name"
          title="Double-click to rename"
          onDoubleClick={(e) => {
            // Don't stop propagation — let the li onClick (onActivate) fire first
            setDraft(page.name);
            setEditing(true);
          }}
        >
          {page.name}
        </span>
      )}

      {canDelete && !editing && (
        <button
          className="pages-item-delete icon-btn"
          title="Delete page"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <CloseIcon />
        </button>
      )}
    </li>
  );
}

// ── Icons ──────────────────────────────────────────────────────────────────
function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="8" y1="3" x2="8" y2="13" />
      <line x1="3" y1="8" x2="13" y2="8" />
    </svg>
  );
}
function PageIcon({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <rect x="3" y="2" width="10" height="12" rx="1" />
      <line x1="5" y1="5" x2="11" y2="5" />
      <line x1="5" y1="8" x2="11" y2="8" />
      <line x1="5" y1="11" x2="9" y2="11" />
    </svg>
  );
}
function CloseIcon() {
  return (
    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="2" y1="2" x2="10" y2="10" />
      <line x1="10" y1="2" x2="2" y2="10" />
    </svg>
  );
}
