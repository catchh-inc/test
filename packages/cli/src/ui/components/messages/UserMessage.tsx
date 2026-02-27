/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// cat-theme: iMessage-style right-aligned user bubble.
// To revert: restore the original HalfLinePaddedBox layout below.

import type React from 'react';
import { useMemo } from 'react';
import { Text, Box } from 'ink';
import { theme } from '../../semantic-colors.js';
import { SCREEN_READER_USER_PREFIX } from '../../textConstants.js';
import { isSlashCommand as checkIsSlashCommand } from '../../utils/commandUtils.js';
import {
  calculateTransformationsForLine,
  calculateTransformedLine,
} from '../shared/text-buffer.js';

interface UserMessageProps {
  text: string;
  width: number;
}

// Max width a user bubble may occupy (fraction of terminal width)
const BUBBLE_MAX_FRACTION = 0.72;

export const UserMessage: React.FC<UserMessageProps> = ({ text, width }) => {
  const isSlashCommand = checkIsSlashCommand(text);

  // Slash commands use the original prefix style — no bubble
  const suffix = isSlashCommand ? '' : ' >';

  const displayText = useMemo(() => {
    if (!text) return text;
    return text
      .split('\n')
      .map((line) => {
        const transformations = calculateTransformationsForLine(line);
        const { transformedLine } = calculateTransformedLine(
          line,
          0,
          [-1, -1],
          transformations,
        );
        return transformedLine;
      })
      .join('\n');
  }, [text]);

  if (isSlashCommand) {
    // Slash commands: keep original left-aligned style
    return (
      <Box flexDirection="row" marginY={1} width={width}>
        <Box width={2} flexShrink={0}>
          <Text
            color={theme.text.accent}
            aria-label={SCREEN_READER_USER_PREFIX}
          >
            {'> '}
          </Text>
        </Box>
        <Box flexGrow={1}>
          <Text wrap="wrap" color={theme.text.accent}>
            {displayText}
          </Text>
        </Box>
      </Box>
    );
  }

  // cat-theme: iMessage right-aligned bubble
  // The bubble sits on the right; a spacer fills the left.
  const maxBubbleWidth = Math.max(Math.floor(width * BUBBLE_MAX_FRACTION), 20);

  // Estimate the text width to size the bubble snugly.
  // Use the longest line, capped at maxBubbleWidth.
  const lines = displayText.split('\n');
  const longestLine = lines.reduce(
    (max, l) => (l.length > max ? l.length : max),
    0,
  );
  // +4 for left/right padding (2 each) + suffix space
  const bubbleWidth = Math.min(longestLine + 4, maxBubbleWidth);
  const spacerWidth = Math.max(width - bubbleWidth, 0);

  return (
    <Box flexDirection="row" width={width} marginY={1} alignItems="flex-start">
      {/* Left spacer pushes bubble to the right */}
      {spacerWidth > 0 && <Box width={spacerWidth} flexShrink={0} />}

      {/* Bubble */}
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.text.accent}
        paddingX={1}
        flexShrink={0}
        width={bubbleWidth}
      >
        <Text
          wrap="wrap"
          color={theme.text.secondary}
          aria-label={SCREEN_READER_USER_PREFIX}
        >
          {displayText}
          {suffix && <Text color={theme.text.accent}>{suffix}</Text>}
        </Text>
      </Box>
    </Box>
  );
};
