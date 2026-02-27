/**
 * Properties panel — shows computed styles of the selected element(s)
 * and allows direct edits that immediately update the iframe via
 * updatePageHtml (triggering a full reload) or a quick inline style patch.
 *
 * For every change, we emit a `page:html:updated` to re-render the frame.
 */

import { updatePageHtml, getActivePage, on } from './state.js';
import { applyDiff } from './differ.js';

let _panelEl = null;

export function initProperties(containerEl) {
  _panelEl = containerEl;
  _renderEmpty();

  on('selection:changed', ({ elements }) => {
    if (elements.length === 0) {
      _renderEmpty();
    } else {
      _renderProperties(elements);
    }
  });
  on('page:activated', () => _renderEmpty());
}

function _renderEmpty() {
  _panelEl.innerHTML = `
    <div class="props-empty">
      <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5">
        <rect x="8" y="8" width="32" height="32" rx="4"/>
        <path d="M16 24h16M24 16v16" stroke-linecap="round"/>
      </svg>
      <p>Select an element<br/>to edit its properties</p>
    </div>`;
}

function _renderProperties(elements) {
  _panelEl.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'props-header';
  header.textContent =
    elements.length === 1
      ? `<${elements[0].tagName}>`
      : `${elements.length} elements selected`;
  _panelEl.appendChild(header);

  if (elements.length === 1) {
    _renderSingleElementProps(elements[0]);
  } else {
    _renderMultiElementProps(elements);
  }
}

function _renderSingleElementProps(el) {
  const cs = el.computedStyles || {};

  const groups = [
    {
      title: 'Typography',
      fields: [
        { label: 'Color', key: 'color', type: 'color', styleKey: 'color' },
        {
          label: 'Font Size',
          key: 'fontSize',
          type: 'text',
          styleKey: 'fontSize',
        },
        {
          label: 'Font Weight',
          key: 'fontWeight',
          type: 'select',
          styleKey: 'fontWeight',
          options: [
            '100',
            '200',
            '300',
            '400',
            '500',
            '600',
            '700',
            '800',
            '900',
            'bold',
            'normal',
          ],
        },
        {
          label: 'Font Family',
          key: 'fontFamily',
          type: 'text',
          styleKey: 'fontFamily',
        },
        {
          label: 'Line Height',
          key: 'lineHeight',
          type: 'text',
          styleKey: 'lineHeight',
        },
        {
          label: 'Text Align',
          key: 'textAlign',
          type: 'select',
          styleKey: 'textAlign',
          options: ['left', 'center', 'right', 'justify'],
        },
      ],
    },
    {
      title: 'Fill & Border',
      fields: [
        {
          label: 'Background',
          key: 'backgroundColor',
          type: 'color',
          styleKey: 'backgroundColor',
        },
        {
          label: 'Border Radius',
          key: 'borderRadius',
          type: 'text',
          styleKey: 'borderRadius',
        },
        { label: 'Border', key: 'border', type: 'text', styleKey: 'border' },
        {
          label: 'Opacity',
          key: 'opacity',
          type: 'range',
          styleKey: 'opacity',
          min: 0,
          max: 1,
          step: 0.01,
        },
      ],
    },
    {
      title: 'Layout',
      fields: [
        {
          label: 'Display',
          key: 'display',
          type: 'select',
          styleKey: 'display',
          options: ['block', 'inline', 'inline-block', 'flex', 'grid', 'none'],
        },
        { label: 'Padding', key: 'padding', type: 'text', styleKey: 'padding' },
        { label: 'Margin', key: 'margin', type: 'text', styleKey: 'margin' },
        { label: 'Width', key: 'width', type: 'text', styleKey: 'width' },
        { label: 'Height', key: 'height', type: 'text', styleKey: 'height' },
      ],
    },
  ];

  groups.forEach((group) => {
    const section = document.createElement('div');
    section.className = 'props-section';

    const sectionTitle = document.createElement('div');
    sectionTitle.className = 'props-section-title';
    sectionTitle.textContent = group.title;
    section.appendChild(sectionTitle);

    group.fields.forEach((field) => {
      const row = _createFieldRow(field, cs[field.key] || '', el.selector);
      section.appendChild(row);
    });

    _panelEl.appendChild(section);
  });

  // Selector badge
  const badge = document.createElement('div');
  badge.className = 'props-selector-badge';
  badge.textContent = el.selector;
  badge.title = el.xpath;
  _panelEl.appendChild(badge);
}

function _renderMultiElementProps(elements) {
  const note = document.createElement('p');
  note.className = 'props-multi-note';
  note.textContent = 'Multi-select: changes apply to all selected elements.';
  _panelEl.appendChild(note);

  const fields = [
    { label: 'Color', key: 'color', type: 'color', styleKey: 'color' },
    {
      label: 'Background',
      key: 'backgroundColor',
      type: 'color',
      styleKey: 'backgroundColor',
    },
    { label: 'Font Size', key: 'fontSize', type: 'text', styleKey: 'fontSize' },
    {
      label: 'Opacity',
      key: 'opacity',
      type: 'range',
      styleKey: 'opacity',
      min: 0,
      max: 1,
      step: 0.01,
    },
  ];

  const section = document.createElement('div');
  section.className = 'props-section';
  fields.forEach((field) => {
    const row = _createFieldRow(field, '', null, elements);
    section.appendChild(row);
  });
  _panelEl.appendChild(section);
}

function _createFieldRow(field, value, selector, multiElements = null) {
  const row = document.createElement('div');
  row.className = 'props-field-row';

  const label = document.createElement('label');
  label.className = 'props-field-label';
  label.textContent = field.label;
  row.appendChild(label);

  let input;

  if (field.type === 'color') {
    // Color swatch + hex input side by side
    const wrap = document.createElement('div');
    wrap.className = 'props-color-wrap';
    const swatch = document.createElement('input');
    swatch.type = 'color';
    swatch.className = 'props-color-swatch';
    const hex = document.createElement('input');
    hex.type = 'text';
    hex.className = 'props-text-input props-color-hex';
    hex.maxLength = 30;

    // normalise value to hex for the colour picker
    const normalised = _cssColorToHex(value);
    swatch.value = normalised;
    hex.value = value;

    swatch.addEventListener('input', () => {
      hex.value = swatch.value;
      _applyStyleChange(field.styleKey, swatch.value, selector, multiElements);
    });
    hex.addEventListener('change', () => {
      const h = _cssColorToHex(hex.value);
      if (h) swatch.value = h;
      _applyStyleChange(field.styleKey, hex.value, selector, multiElements);
    });
    wrap.appendChild(swatch);
    wrap.appendChild(hex);
    row.appendChild(wrap);
  } else if (field.type === 'select') {
    input = document.createElement('select');
    input.className = 'props-select-input';
    field.options.forEach((opt) => {
      const o = document.createElement('option');
      o.value = opt;
      o.textContent = opt;
      if (opt === value || value.startsWith(opt)) o.selected = true;
      input.appendChild(o);
    });
    input.addEventListener('change', () => {
      _applyStyleChange(field.styleKey, input.value, selector, multiElements);
    });
    row.appendChild(input);
  } else if (field.type === 'range') {
    const wrap = document.createElement('div');
    wrap.className = 'props-range-wrap';
    input = document.createElement('input');
    input.type = 'range';
    input.className = 'props-range-input';
    input.min = field.min ?? 0;
    input.max = field.max ?? 100;
    input.step = field.step ?? 1;
    input.value = parseFloat(value) || (field.max ?? 1);
    const readout = document.createElement('span');
    readout.className = 'props-range-readout';
    readout.textContent = input.value;
    input.addEventListener('input', () => {
      readout.textContent = input.value;
      _applyStyleChange(field.styleKey, input.value, selector, multiElements);
    });
    wrap.appendChild(input);
    wrap.appendChild(readout);
    row.appendChild(wrap);
  } else {
    // text
    input = document.createElement('input');
    input.type = 'text';
    input.className = 'props-text-input';
    input.value = value;
    input.addEventListener('change', () => {
      _applyStyleChange(field.styleKey, input.value, selector, multiElements);
    });
    row.appendChild(input);
  }

  return row;
}

/**
 * Apply a style change directly to the active page HTML using a diff op.
 */
function _applyStyleChange(styleKey, value, selector, multiElements) {
  const page = getActivePage();
  if (!page) return;

  const targets = multiElements
    ? multiElements.map((e) => e.selector)
    : selector
      ? [selector]
      : [];

  const ops = targets.map((sel) => ({
    op: 'replaceStyle',
    selector: sel,
    property: styleKey,
    value,
  }));

  if (ops.length === 0) return;

  const newHtml = applyDiff(page.html, ops);
  updatePageHtml(page.id, newHtml);

  // Update the in-memory selection to reflect new computed styles
  // (The iframe will reload and selection will clear — that's expected)
}

// ─── Colour helpers ──────────────────────────────────────────────────────────
function _cssColorToHex(cssValue) {
  if (!cssValue) return '#000000';
  // Already hex
  if (/^#[0-9a-fA-F]{3,8}$/.test(cssValue)) return cssValue;
  // rgb(r, g, b)
  const rgb = cssValue.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgb) {
    return (
      '#' +
      [rgb[1], rgb[2], rgb[3]]
        .map((n) => parseInt(n).toString(16).padStart(2, '0'))
        .join('')
    );
  }
  return '#000000';
}
