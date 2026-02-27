/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState, useEffect, useMemo } from 'react';
import { Box, Text, useIsScreenReaderEnabled } from 'ink';
import tinygradient from 'tinygradient';

// ── Palette ────────────────────────────────────────────────────────────────
const WARM = ['#FF6B9D', '#FF8E53', '#FFD93D', '#6BCB77', '#4D96FF', '#C77DFF'];
const COOL = ['#4D96FF', '#6BCB77', '#FFD93D', '#FF8E53', '#FF6B9D', '#C77DFF'];

// ── Progress bar chars ─────────────────────────────────────────────────────
const BAR_FILL = '█';
const BAR_EMPTY = '░';
const BAR_HEAD = '▓';
const BAR_WIDTH = 16;

// ── Paw trail frames ───────────────────────────────────────────────────────
const PAW_TRAIL_FRAMES = [
  '🐾· · · · · · · ·',
  '·🐾· · · · · · · ',
  '· ·🐾· · · · · · ',
  '· · ·🐾· · · · · ',
  '· · · ·🐾· · · · ',
  '· · · · ·🐾· · · ',
  '· · · · · ·🐾· · ',
  '· · · · · · ·🐾· ',
  '· · · · · · · ·🐾',
  '· · · · · · ·🐾· ',
  '· · · · · ·🐾· · ',
  '· · · · ·🐾· · · ',
  '· · · ·🐾· · · · ',
  '· · ·🐾· · · · · ',
  '· ·🐾· · · · · · ',
  '·🐾· · · · · · · ',
];

// ── Cat ear frames ─────────────────────────────────────────────────────────
const CAT_EAR_FRAMES = ['/\\_/\\', '/\\_/\\', '/\\_^\\', '/^_/\\', '/\\_/\\'];

// ── Thinking bubbles ───────────────────────────────────────────────────────
const THINK_FRAMES = ['○', '◎', '●', '◎', '○'];

// Single tick rate — everything derived from one counter.
// 120ms = ~8fps — smooth enough visually, low enough CPU.
const TICK_MS = 120;

// How many ticks per full color cycle
const COLOR_CYCLE_TICKS = 40; // 40 * 120ms = 4.8s

interface CatTaskProgressProps {
  label?: string;
  elapsedTime?: number;
  showTimer?: boolean;
}

export const CatTaskProgress: React.FC<CatTaskProgressProps> = ({
  label,
  elapsedTime,
  showTimer = true,
}) => {
  const isScreenReader = useIsScreenReaderEnabled();

  // Single integer tick — all animation derived from this
  const [tick, setTick] = useState(0);

  const warmGrad = useMemo(() => tinygradient([...WARM, WARM[0]]), []);
  const coolGrad = useMemo(() => tinygradient([...COOL, COOL[0]]), []);

  useEffect(() => {
    if (isScreenReader) return;
    const id = setInterval(() => {
      setTick((t) => t + 1);
    }, TICK_MS);
    return () => clearInterval(id);
  }, [isScreenReader]);

  if (isScreenReader) {
    return (
      <Text>
        {label ?? 'Task in progress'}
        {showTimer && elapsedTime !== undefined ? ` (${elapsedTime}s)` : ''}
      </Text>
    );
  }

  // ── Derive everything from tick ──────────────────────────────────────────
  const colorProgress = (tick % COLOR_CYCLE_TICKS) / COLOR_CYCLE_TICKS;
  const accentColor = warmGrad.rgbAt(colorProgress).toHexString();
  const accentColor2 = coolGrad.rgbAt(colorProgress).toHexString();

  const pawFrame = PAW_TRAIL_FRAMES[tick % PAW_TRAIL_FRAMES.length] ?? '🐾';
  const thinkBubble = THINK_FRAMES[tick % THINK_FRAMES.length] ?? '○';
  const catEar = CAT_EAR_FRAMES[tick % CAT_EAR_FRAMES.length] ?? '/\\_/\\';

  // Bouncing progress bar: position oscillates 0→BAR_WIDTH→0
  const barCycle = BAR_WIDTH * 2;
  const barRaw = tick % barCycle;
  const barPos = barRaw < BAR_WIDTH ? barRaw : barCycle - barRaw;
  const barFill = Math.min(barPos + 3, BAR_WIDTH);
  const barStart = Math.max(barPos - 1, 0);
  let bar = '';
  for (let i = 0; i < BAR_WIDTH; i++) {
    if (i === barFill - 1) bar += BAR_HEAD;
    else if (i >= barStart && i < barFill) bar += BAR_FILL;
    else bar += BAR_EMPTY;
  }

  // Timer display
  let timerStr: string | null = null;
  if (showTimer && elapsedTime !== undefined) {
    timerStr =
      elapsedTime < 60
        ? `${elapsedTime}s`
        : `${Math.floor(elapsedTime / 60)}m ${elapsedTime % 60}s`;
  }

  return (
    <Box flexDirection="column">
      {/* Row 1: cat head + label */}
      <Box flexDirection="row" alignItems="center">
        <Text color={accentColor}>{catEar} </Text>
        <Text color={accentColor2} bold>
          {thinkBubble}{' '}
        </Text>
        <Text color={accentColor} italic>
          {label ?? 'Task in progress…'}
          {'  '}
        </Text>
        {timerStr && (
          <Text color="#888888" dimColor>
            ({timerStr})
          </Text>
        )}
      </Box>
      {/* Row 2: animated progress bar + paw trail */}
      <Box flexDirection="row" alignItems="center">
        <Text color={accentColor}>[</Text>
        <Text color={accentColor2}>{bar}</Text>
        <Text color={accentColor}>]</Text>
        <Text>{'  '}</Text>
        <Text color={accentColor}>{pawFrame}</Text>
      </Box>
    </Box>
  );
};
