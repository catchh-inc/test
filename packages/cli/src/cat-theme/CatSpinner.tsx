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

// Animated paw/cat frames — cycling ASCII cat poses
const CAT_FRAMES = [
  ' /\\_/\\ ',
  '( o.o )',
  ' > ♥ < ',
  ' /\\_/\\ ',
  '( ^.^ )',
  ' > ♦ < ',
  ' /\\_/\\ ',
  '( -.^ )',
  ' > ★ < ',
];

// Paw print spinner frames (used for inline spinner)
const PAW_FRAMES = ['🐾', ' 🐾', '  🐾', '   🐾', '  🐾', ' 🐾'];

const DOT_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

const COLOR_CYCLE_DURATION_MS = 3000;
const FRAME_INTERVAL_MS = 120;

interface CatSpinnerProps {
  /** 'paw' for paw print frames, 'dots' for braille dots, 'cat' for cat art */
  variant?: 'paw' | 'dots' | 'cat';
  altText?: string;
}

export const CatSpinner: React.FC<CatSpinnerProps> = ({
  variant = 'dots',
  altText,
}) => {
  const isScreenReaderEnabled = useIsScreenReaderEnabled();
  const [time, setTime] = useState(0);
  const [frame, setFrame] = useState(0);

  const catGradient = useMemo(
    () => tinygradient([...CAT_COLORS, CAT_COLORS[0]]),
    [],
  );

  useEffect(() => {
    if (isScreenReaderEnabled) return;

    const colorInterval = setInterval(() => {
      setTime((t) => t + 30);
    }, 30);

    const frameInterval = setInterval(() => {
      setFrame((f) => {
        const frames =
          variant === 'cat'
            ? CAT_FRAMES
            : variant === 'paw'
              ? PAW_FRAMES
              : DOT_FRAMES;
        return (f + 1) % frames.length;
      });
    }, FRAME_INTERVAL_MS);

    return () => {
      clearInterval(colorInterval);
      clearInterval(frameInterval);
    };
  }, [isScreenReaderEnabled, variant]);

  if (isScreenReaderEnabled) {
    return <Text>{altText ?? 'Loading...'}</Text>;
  }

  const progress = (time % COLOR_CYCLE_DURATION_MS) / COLOR_CYCLE_DURATION_MS;
  const currentColor = catGradient.rgbAt(progress).toHexString();

  const frames =
    variant === 'cat'
      ? CAT_FRAMES
      : variant === 'paw'
        ? PAW_FRAMES
        : DOT_FRAMES;
  const currentFrame = frames[frame % frames.length];

  return <Text color={currentColor}>{currentFrame}</Text>;
};
