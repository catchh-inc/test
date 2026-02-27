/**
 * Pages sidebar — lists pages, allows add/rename/delete/activate.
 */

import {
  getState,
  addPage,
  deletePage,
  renamePage,
  setActivePage,
  on,
} from './state.js';
import { fitPage, updateFrameLabel } from './canvas.js';

let _panelEl = null;

export function initPages(containerEl) {
  _panelEl = containerEl;
  _render();

  on('pages:changed', () => _render());
  on('page:activated', () => _render());
}

function _render() {
  const { pages, activePageId } = getState();
  _panelEl.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'pages-header';
  header.innerHTML = `<span class="pages-title">Pages</span>`;
  const addBtn = document.createElement('button');
  addBtn.className = 'pages-add-btn';
  addBtn.title = 'Add page';
  addBtn.innerHTML = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="3" x2="8" y2="13"/><line x1="3" y1="8" x2="13" y2="8"/></svg>`;
  addBtn.addEventListener('click', () => {
    const page = addPage();
    setActivePage(page.id);
    fitPage(page.id);
  });
  header.appendChild(addBtn);
  _panelEl.appendChild(header);

  const list = document.createElement('ul');
  list.className = 'pages-list';

  pages.forEach((page) => {
    const li = document.createElement('li');
    li.className = 'pages-item' + (page.id === activePageId ? ' active' : '');
    li.dataset.pageId = page.id;

    // Page icon
    const icon = document.createElement('span');
    icon.className = 'pages-item-icon';
    icon.innerHTML = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="2" width="10" height="12" rx="1"/><line x1="5" y1="5" x2="11" y2="5"/><line x1="5" y1="8" x2="11" y2="8"/><line x1="5" y1="11" x2="9" y2="11"/></svg>`;

    // Page name (double-click to rename)
    const nameEl = document.createElement('span');
    nameEl.className = 'pages-item-name';
    nameEl.textContent = page.name;
    nameEl.title = 'Double-click to rename';
    nameEl.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      _startRename(page.id, nameEl);
    });

    // Delete button (only show if > 1 page)
    const delBtn = document.createElement('button');
    delBtn.className = 'pages-item-delete';
    delBtn.title = 'Delete page';
    delBtn.innerHTML = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="4" x2="4" y2="12"/></svg>`;
    delBtn.style.display = pages.length === 1 ? 'none' : '';
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(`Delete "${page.name}"?`)) {
        deletePage(page.id);
      }
    });

    li.appendChild(icon);
    li.appendChild(nameEl);
    li.appendChild(delBtn);

    li.addEventListener('click', () => {
      setActivePage(page.id);
      fitPage(page.id);
    });

    list.appendChild(li);
  });

  _panelEl.appendChild(list);
}

function _startRename(pageId, nameEl) {
  const currentName = nameEl.textContent;
  const input = document.createElement('input');
  input.className = 'pages-rename-input';
  input.value = currentName;
  nameEl.replaceWith(input);
  input.focus();
  input.select();

  const commit = () => {
    const newName = input.value.trim() || currentName;
    renamePage(pageId, newName);
    updateFrameLabel(pageId, newName);
    // _render() will be called by the pages:changed event
  };

  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
      input.blur();
    }
    if (e.key === 'Escape') {
      input.value = currentName;
      input.blur();
    }
  });
}
