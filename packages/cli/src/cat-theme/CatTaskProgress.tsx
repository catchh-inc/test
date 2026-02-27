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

// ── Paw trail animation ────────────────────────────────────────────────────
// Each frame is a horizontal "trail" of paw prints walking across
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

// ── Spinning cat ear ───────────────────────────────────────────────────────
const CAT_EAR_FRAMES = ['/\\_/\\', '/\\_/\\', '/\\_^\\', '/^_/\\', '/\\_/\\'];

// ── Thinking bubbles ───────────────────────────────────────────────────────
const THINK_FRAMES = ['○', '◎', '●', '◎', '○'];

const COLOR_CYCLE_MS = 2400;
const FRAME_MS = 110;
const BAR_SPEED_MS = 80;

interface CatTaskProgressProps {
  /** Optional label override (phrase from usePhraseCycler) */
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
  const [time, setTime] = useState(0);
  const [frame, setFrame] = useState(0);
  const [barOffset, setBarOffset] = useState(0);

  const warmGrad = useMemo(() => tinygradient([...WARM, WARM[0]]), []);
  const coolGrad = useMemo(() => tinygradient([...COOL, COOL[0]]), []);

  useEffect(() => {
    if (isScreenReader) return;

    const colorTick = setInterval(() => setTime((t) => t + 30), 30);
    const frameTick = setInterval(() => setFrame((f) => f + 1), FRAME_MS);
    const barTick = setInterval(
      () => setBarOffset((b) => (b + 1) % (BAR_WIDTH * 2)),
      BAR_SPEED_MS,
    );

    return () => {
      clearInterval(colorTick);
      clearInterval(frameTick);
      clearInterval(barTick);
    };
  }, [isScreenReader]);

  if (isScreenReader) {
    return (
      <Text>
        {label ?? 'Task in progress'}
        {showTimer && elapsedTime !== undefined ? ` (${elapsedTime}s)` : ''}
      </Text>
    );
  }

  const progress = (time % COLOR_CYCLE_MS) / COLOR_CYCLE_MS;
  const accentColor = warmGrad.rgbAt(progress).toHexString();
  const accentColor2 = coolGrad.rgbAt(progress).toHexString();

  // Animated progress bar — bouncing fill
  const buildBar = (): string => {
    const pos = barOffset % (BAR_WIDTH * 2);
    const actualPos = pos < BAR_WIDTH ? pos : BAR_WIDTH * 2 - pos;
    const fill = Math.min(actualPos + 3, BAR_WIDTH);
    const start = Math.max(actualPos - 1, 0);
    let bar = '';
    for (let i = 0; i < BAR_WIDTH; i++) {
      if (i === fill - 1) bar += BAR_HEAD;
      else if (i >= start && i < fill) bar += BAR_FILL;
      else bar += BAR_EMPTY;
    }
    return bar;
  };

  const pawTrail = PAW_TRAIL_FRAMES[frame % PAW_TRAIL_FRAMES.length] ?? '🐾';
  const thinkBubble = THINK_FRAMES[frame % THINK_FRAMES.length] ?? '○';
  const catEar = CAT_EAR_FRAMES[frame % CAT_EAR_FRAMES.length] ?? '/\\_/\\';

  // Timer display
  const timerStr =
    showTimer && elapsedTime !== undefined
      ? elapsedTime < 60
        ? `${elapsedTime}s`
        : `${Math.floor(elapsedTime / 60)}m ${elapsedTime % 60}s`
      : null;

  return (
    <Box flexDirection="column">
      {/* Row 1: cat head + label */}
      <Box flexDirection="row" alignItems="center">
        <Text color={accentColor}>{catEar} </Text>
        <Text color={accentColor2} bold>
          {thinkBubble}{' '}
        </Text>
        <Text color={accentColor} italic>
          {label ?? 'Task in progress'}
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
        <Text color={accentColor2}>{buildBar()}</Text>
        <Text color={accentColor}>]</Text>
        <Text>{'  '}</Text>
        <Text color={accentColor}>{pawTrail}</Text>
      </Box>
    </Box>
  );
};
