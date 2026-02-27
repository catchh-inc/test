/**
 * PropertiesPanel — fully controlled inputs, remounts on selection change,
 * reads page.html from getState() to avoid stale closure on rapid changes.
 */
import { useState } from 'react';
import { useStore } from '../lib/store';
import { applyDiff } from '../lib/differ';

export default function PropertiesPanel() {
  const selectedElements = useStore((s) => s.selectedElements);

  if (selectedElements.length === 0) return <EmptyState />;

  // Key forces full remount whenever selection changes → no stale input values
  const selectionKey = selectedElements.map((e) => e.selector).join('||');

  return (
    <div className="props-panel" key={selectionKey}>
      <div className="props-header">
        {selectedElements.length === 1
          ? `<${selectedElements[0].tagName}>`
          : `${selectedElements.length} elements`}
      </div>
      {selectedElements.length === 1 ? (
        <SingleElementProps el={selectedElements[0]} />
      ) : (
        <MultiElementProps elements={selectedElements} />
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="props-empty">
      <svg
        viewBox="0 0 48 48"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <rect x="8" y="8" width="32" height="32" rx="4" />
        <path d="M16 24h16M24 16v16" strokeLinecap="round" />
      </svg>
      <p>
        Select an element
        <br />
        to edit its properties
      </p>
    </div>
  );
}

// ── Style apply — always reads page.html fresh from store ────────────────────
function applyStyle(selectors, property, value) {
  const { activePageId, pages, updatePageHtml } = useStore.getState();
  const page = pages.find((p) => p.id === activePageId);
  if (!page) return;
  const ops = selectors.map((sel) => ({
    op: 'replaceStyle',
    selector: sel,
    property,
    value,
  }));
  const newHtml = applyDiff(page.html, ops);
  updatePageHtml(activePageId, newHtml);
}

// ── Single element ────────────────────────────────────────────────────────────
function SingleElementProps({ el }) {
  const cs = el.computedStyles ?? {};

  const groups = [
    {
      title: 'Typography',
      fields: [
        { label: 'Color', prop: 'color', type: 'color' },
        { label: 'Font Size', prop: 'fontSize', type: 'text' },
        {
          label: 'Font Weight',
          prop: 'fontWeight',
          type: 'select',
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
        { label: 'Line Height', prop: 'lineHeight', type: 'text' },
        {
          label: 'Text Align',
          prop: 'textAlign',
          type: 'select',
          options: ['left', 'center', 'right', 'justify'],
        },
      ],
    },
    {
      title: 'Fill & Border',
      fields: [
        { label: 'Background', prop: 'backgroundColor', type: 'color' },
        { label: 'Border Radius', prop: 'borderRadius', type: 'text' },
        { label: 'Border', prop: 'border', type: 'text' },
        {
          label: 'Opacity',
          prop: 'opacity',
          type: 'range',
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
          prop: 'display',
          type: 'select',
          options: ['block', 'inline', 'inline-block', 'flex', 'grid', 'none'],
        },
        { label: 'Padding', prop: 'padding', type: 'text' },
        { label: 'Margin', prop: 'margin', type: 'text' },
        { label: 'Width', prop: 'width', type: 'text' },
        { label: 'Height', prop: 'height', type: 'text' },
      ],
    },
  ];

  return (
    <>
      {groups.map((g) => (
        <section key={g.title} className="props-section">
          <div className="props-section-title">{g.title}</div>
          {g.fields.map((f) => (
            <FieldRow
              key={f.prop}
              field={f}
              value={cs[f.prop] ?? ''}
              onChange={(v) => applyStyle([el.selector], f.prop, v)}
            />
          ))}
        </section>
      ))}
      <div className="props-selector-badge" title={el.xpath}>
        {el.selector}
      </div>
    </>
  );
}

// ── Multi element ─────────────────────────────────────────────────────────────
function MultiElementProps({ elements }) {
  const selectors = elements.map((e) => e.selector);
  const fields = [
    { label: 'Color', prop: 'color', type: 'color' },
    { label: 'Background', prop: 'backgroundColor', type: 'color' },
    { label: 'Font Size', prop: 'fontSize', type: 'text' },
    {
      label: 'Opacity',
      prop: 'opacity',
      type: 'range',
      min: 0,
      max: 1,
      step: 0.01,
    },
  ];
  return (
    <>
      <p className="props-multi-note">
        Changes apply to all {elements.length} selected elements.
      </p>
      <section className="props-section">
        {fields.map((f) => (
          <FieldRow
            key={f.prop}
            field={f}
            value=""
            onChange={(v) => applyStyle(selectors, f.prop, v)}
          />
        ))}
      </section>
    </>
  );
}

// ── Generic controlled field row ─────────────────────────────────────────────
function FieldRow({ field, value, onChange }) {
  const { label, type, options, min = 0, max = 1, step = 0.01 } = field;
  return (
    <div className="props-field-row">
      <span className="props-field-label">{label}</span>
      {type === 'color' && <ColorField value={value} onChange={onChange} />}
      {type === 'select' && (
        <SelectField value={value} options={options} onChange={onChange} />
      )}
      {type === 'range' && (
        <RangeField
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={onChange}
        />
      )}
      {type === 'text' && <TextInputField value={value} onChange={onChange} />}
    </div>
  );
}

// ── Controlled text input with local draft ────────────────────────────────────
function TextInputField({ value, onChange }) {
  const [draft, setDraft] = useState(value);
  return (
    <input
      className="props-text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onChange(draft);
        }
      }}
    />
  );
}

// ── Controlled select ─────────────────────────────────────────────────────────
function SelectField({ value, options, onChange }) {
  // Normalize: strip px/computed cruft, find closest option
  const match = options.find((o) => value.startsWith(o)) ?? options[0];
  const [current, setCurrent] = useState(match);
  return (
    <select
      className="props-select"
      value={current}
      onChange={(e) => {
        setCurrent(e.target.value);
        onChange(e.target.value);
      }}
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

// ── Controlled color: swatch + hex text ──────────────────────────────────────
function ColorField({ value, onChange }) {
  const [hex, setHex] = useState(() => cssToHex(value));
  const [text, setText] = useState(value);

  const commit = (v) => {
    const h = cssToHex(v);
    setHex(h);
    setText(v);
    onChange(v);
  };

  return (
    <div className="props-color-wrap">
      <input
        type="color"
        className="props-color-swatch"
        value={hex}
        onChange={(e) => {
          setHex(e.target.value);
          setText(e.target.value);
          onChange(e.target.value);
        }}
      />
      <input
        className="props-text props-color-hex"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit(text);
        }}
      />
    </div>
  );
}

// ── Controlled range ──────────────────────────────────────────────────────────
function RangeField({ value, min, max, step, onChange }) {
  const initial = parseFloat(value);
  const safe = isNaN(initial) ? max : Math.min(max, Math.max(min, initial));
  const [val, setVal] = useState(safe);

  return (
    <div className="props-range-wrap">
      <input
        type="range"
        className="props-range"
        value={val}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const n = parseFloat(e.target.value);
          setVal(n);
          onChange(String(n));
        }}
      />
      <span className="props-range-val">{val}</span>
    </div>
  );
}

// ── Colour helper ─────────────────────────────────────────────────────────────
function cssToHex(css) {
  if (!css) return '#000000';
  if (/^#[0-9a-fA-F]{3,8}$/.test(css)) return css;
  const m = css.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (m)
    return (
      '#' +
      [m[1], m[2], m[3]].map((n) => (+n).toString(16).padStart(2, '0')).join('')
    );
  return '#000000';
}
