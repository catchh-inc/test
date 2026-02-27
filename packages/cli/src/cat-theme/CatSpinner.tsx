/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState, useEffect, useMemo } from 'react';
import { Text, useIsScreenReaderEnabled } from 'ink';
import tinygradient from 'tinygradient';

// Cat-themed warm/pastel gradient palette
const CAT_COLORS = [
  '#FF6B9D', // rose pink
  '#FF8E53', // warm orange
  '#FFD93D', // sunshine yellow
  '#6BCB77', // mint green
  '#4D96FF', // sky blue
  '#C77DFF', // lavender purple
];

// Braille dot frames (same as original dots spinner)
const DOT_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

// One tick every 80ms → ~12.5fps. Color cycles over 50 ticks (~4s).
const TICK_MS = 80;
const COLOR_CYCLE_TICKS = 50;

interface CatSpinnerProps {
  altText?: string;
}

export const CatSpinner: React.FC<CatSpinnerProps> = ({ altText }) => {
  const isScreenReaderEnabled = useIsScreenReaderEnabled();
  const [tick, setTick] = useState(0);

  const catGradient = useMemo(
    () => tinygradient([...CAT_COLORS, CAT_COLORS[0]]),
    [],
  );

  useEffect(() => {
    if (isScreenReaderEnabled) return;
    const id = setInterval(() => {
      setTick((t) => t + 1);
    }, TICK_MS);
    return () => clearInterval(id);
  }, [isScreenReaderEnabled]);

  if (isScreenReaderEnabled) {
    return <Text>{altText ?? 'Loading...'}</Text>;
  }

  const colorProgress = (tick % COLOR_CYCLE_TICKS) / COLOR_CYCLE_TICKS;
  const currentColor = catGradient.rgbAt(colorProgress).toHexString();
  const currentFrame = DOT_FRAMES[tick % DOT_FRAMES.length] ?? '⠋';

  return <Text color={currentColor}>{currentFrame}</Text>;
};
