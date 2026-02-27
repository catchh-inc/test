/**
 * Canvas — infinite pan/zoom viewport.
 *
 * Renders one PageFrame per page, laid out horizontally.
 * Pan: middle-mouse drag OR Alt+left-drag
 * Zoom: Ctrl/Cmd+scroll or toolbar buttons
 */
import { useRef, useEffect, useCallback } from 'react';
import { useStore } from '../lib/store';
import PageFrame from './PageFrame';

const FRAME_W = 1280;
const FRAME_H = 800;
const FRAME_GAP = 100;
const WORLD_PAD_TOP = 60; // space above frames in world coords
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 4;

export const FRAME_WIDTH = FRAME_W;
export const FRAME_HEIGHT = FRAME_H;

export default function Canvas() {
  const viewportRef = useRef(null);
  const worldRef = useRef(null);
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const vpStart = useRef({ x: 0, y: 0 });

  const { pages, activePageId, viewport, setViewport, setActivePage } =
    useStore();

  // Apply CSS transform whenever viewport changes
  useEffect(() => {
    if (!worldRef.current) return;
    worldRef.current.style.transform = `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`;
  }, [viewport]);

  // ── Fit active page on first render ────────────────────────────────────────
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const raf = requestAnimationFrame(() => fitPage(activePageId, el));
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const frameX = (idx) => idx * (FRAME_W + FRAME_GAP);

  const fitPage = useCallback(
    (pageId, el) => {
      const container = el ?? viewportRef.current;
      if (!container) return;
      const { pages: ps } = useStore.getState();
      const idx = ps.findIndex((p) => p.id === pageId);
      if (idx < 0) return;
      const rect = container.getBoundingClientRect();
      const pad = 60;
      const zoom = Math.min(
        (rect.width - pad * 2) / FRAME_W,
        (rect.height - pad * 2) / FRAME_H,
        1,
      );
      const x = rect.width / 2 - (FRAME_W * zoom) / 2 - frameX(idx) * zoom;
      const y = (rect.height - FRAME_H * zoom) / 2 - WORLD_PAD_TOP * zoom;
      setViewport({ zoom, x, y });
    },
    [setViewport],
  );

  // Expose fitPage and zoom helpers on the window so toolbar can call them
  useEffect(() => {
    window.__canvas_fitPage = (id) =>
      fitPage(id ?? useStore.getState().activePageId);
    window.__canvas_zoomIn = () => {
      const { viewport: vp } = useStore.getState();
      const el = viewportRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const nz = Math.min(MAX_ZOOM, vp.zoom * 1.25);
      const zr = nz / vp.zoom;
      setViewport({
        zoom: nz,
        x: cx - (cx - vp.x) * zr,
        y: cy - (cy - vp.y) * zr,
      });
    };
    window.__canvas_zoomOut = () => {
      const { viewport: vp } = useStore.getState();
      const el = viewportRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const nz = Math.max(MIN_ZOOM, vp.zoom * 0.8);
      const zr = nz / vp.zoom;
      setViewport({
        zoom: nz,
        x: cx - (cx - vp.x) * zr,
        y: cy - (cy - vp.y) * zr,
      });
    };
  }, [fitPage, setViewport]);

  // ── Pan / Zoom event handlers ───────────────────────────────────────────────
  const onWheel = useCallback(
    (e) => {
      e.preventDefault();
      const { viewport: vp } = useStore.getState();
      const rect = viewportRef.current.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      if (e.ctrlKey || e.metaKey) {
        const delta = e.deltaY < 0 ? 1.1 : 0.9;
        const nz = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, vp.zoom * delta));
        const zr = nz / vp.zoom;
        setViewport({
          zoom: nz,
          x: mx - (mx - vp.x) * zr,
          y: my - (my - vp.y) * zr,
        });
      } else {
        setViewport({ x: vp.x - e.deltaX, y: vp.y - e.deltaY });
      }
    },
    [setViewport],
  );

  const onMouseDown = useCallback((e) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      e.preventDefault();
      isPanning.current = true;
      panStart.current = { x: e.clientX, y: e.clientY };
      vpStart.current = { ...useStore.getState().viewport };
      viewportRef.current.style.cursor = 'grabbing';
    }
  }, []);

  const onMouseMove = useCallback(
    (e) => {
      if (!isPanning.current) return;
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      setViewport({ x: vpStart.current.x + dx, y: vpStart.current.y + dy });
    },
    [setViewport],
  );

  const onMouseUp = useCallback(() => {
    isPanning.current = false;
    if (viewportRef.current) viewportRef.current.style.cursor = '';
  }, []);

  // Attach wheel (non-passive) and global mouse move/up
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    el.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      el.removeEventListener('wheel', onWheel);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [onWheel, onMouseMove, onMouseUp]);

  return (
    <div
      ref={viewportRef}
      className="canvas-viewport"
      onMouseDown={onMouseDown}
    >
      <div ref={worldRef} className="canvas-world">
        {pages.map((page, idx) => (
          <PageFrame
            key={page.id}
            page={page}
            index={idx}
            isActive={page.id === activePageId}
            frameX={frameX(idx)}
            frameY={WORLD_PAD_TOP}
            width={FRAME_W}
            height={FRAME_H}
            onActivate={() => setActivePage(page.id)}
          />
        ))}
      </div>
    </div>
  );
}
