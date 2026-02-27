/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState, useEffect, useMemo } from 'react';
import { Box, Text, useIsScreenReaderEnabled } from 'ink';
import tinygradient from 'tinygradient';

const CAT_COLORS = [
  '#FF6B9D',
  '#FF8E53',
  '#FFD93D',
  '#6BCB77',
  '#4D96FF',
  '#C77DFF',
];

// Fake "code lines" that scroll — purely decorative
const FAKE_LINES = [
  'const solution = async (input) => {',
  '  const result = await process(input);',
  '  return transform(result);',
  '};',
  '',
  'function optimize(data) {',
  '  return data.map(x => x * 2);',
  '}',
  '',
  'export { solution, optimize };',
  'import { util } from "./helpers";',
  'const config = { mode: "auto" };',
  'let count = 0;',
  'while (count < limit) {',
  '  count++;',
  '}',
];

// Braille animation chars
const SPIN_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

const TICK_MS = 100;
const COLOR_CYCLE_TICKS = 50;
// How many fake lines to show at once
const VISIBLE_LINES = 5;

interface CatCodeAnimationProps {
  /** Number of columns available for display */
  width: number;
  /** Language hint extracted from the fence, e.g. "typescript" */
  lang?: string;
}

export const CatCodeAnimation: React.FC<CatCodeAnimationProps> = ({
  width,
  lang,
}) => {
  const isScreenReader = useIsScreenReaderEnabled();
  const [tick, setTick] = useState(0);

  const grad = useMemo(() => tinygradient([...CAT_COLORS, CAT_COLORS[0]]), []);

  useEffect(() => {
    if (isScreenReader) return;
    const id = setInterval(() => setTick((t) => t + 1), TICK_MS);
    return () => clearInterval(id);
  }, [isScreenReader]);

  if (isScreenReader) {
    return <Text>Generating code...</Text>;
  }

  const colorProgress = (tick % COLOR_CYCLE_TICKS) / COLOR_CYCLE_TICKS;
  const accent = grad.rgbAt(colorProgress).toHexString();
  // Slightly shifted color for the fake code lines
  const codeColor = grad
    .rgbAt(((tick + 15) % COLOR_CYCLE_TICKS) / COLOR_CYCLE_TICKS)
    .toHexString();

  const spinner = SPIN_FRAMES[tick % SPIN_FRAMES.length] ?? '⠋';

  // Scrolling fake code: offset shifts each tick
  const startIdx = tick % FAKE_LINES.length;
  const visibleLines: string[] = [];
  for (let i = 0; i < VISIBLE_LINES; i++) {
    visibleLines.push(FAKE_LINES[(startIdx + i) % FAKE_LINES.length] ?? '');
  }

  // Cap display width so we don't overflow
  const maxLineWidth = Math.max(width - 6, 20);
  const langLabel = lang ? ` ${lang}` : '';

  return (
    <Box flexDirection="column" marginY={0}>
      {/* Header bar */}
      <Box flexDirection="row" alignItems="center">
        <Text color={accent}>{spinner} </Text>
        <Text color={accent} bold>
          Writing code{langLabel}
        </Text>
        <Text color="#555555"> ···</Text>
      </Box>

      {/* Fake scrolling code lines */}
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={accent}
        paddingX={1}
        marginTop={0}
      >
        {visibleLines.map((line, i) => {
          // Truncate to fit
          const display =
            line.length > maxLineWidth
              ? line.slice(0, maxLineWidth - 1) + '…'
              : line;
          // Dim older lines, brighten the newest
          const opacity = i === VISIBLE_LINES - 1 ? 1 : 0.5;
          return (
            <Text
              key={i}
              color={opacity < 1 ? '#444444' : codeColor}
              dimColor={opacity < 1}
            >
              {display || ' '}
            </Text>
          );
        })}
      </Box>
    </Box>
  );
};

/**
 * Returns true when the text is currently mid-stream inside a code block.
 * Counts ``` occurrences — odd count means an open fence.
 */
export function isStreamingCode(text: string): boolean {
  // Count all triple-backtick occurrences
  const matches = text.match(/```/g);
  if (!matches) return false;
  // Odd number = currently inside an open fence
  return matches.length % 2 !== 0;
}

/**
 * Extracts the language hint from the most recent open code fence, e.g.
 * "```typescript\n..." → "typescript"
 */
export function getStreamingCodeLang(text: string): string | undefined {
  const lastFence = text.lastIndexOf('```');
  if (lastFence === -1) return undefined;
  const afterFence = text.slice(lastFence + 3);
  const newline = afterFence.indexOf('\n');
  const lang = newline === -1 ? afterFence : afterFence.slice(0, newline);
  return lang.trim() || undefined;
}
