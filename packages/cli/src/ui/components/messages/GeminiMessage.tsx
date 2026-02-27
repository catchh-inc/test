/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// cat-theme: iMessage-style left bubble + code-streaming animation.
// To revert: remove the cat-theme imports and restore the original JSX below.

import type React from 'react';
import { Text, Box } from 'ink';
import { MarkdownDisplay } from '../../utils/MarkdownDisplay.js';
import { ShowMoreLines } from '../ShowMoreLines.js';
import { theme } from '../../semantic-colors.js';
import { SCREEN_READER_MODEL_PREFIX } from '../../textConstants.js';
import { useUIState } from '../../contexts/UIStateContext.js';
import { useAlternateBuffer } from '../../hooks/useAlternateBuffer.js';
import { OverflowProvider } from '../../contexts/OverflowContext.js';
import {
  CatCodeAnimation,
  isStreamingCode,
  getStreamingCodeLang,
} from '../../../cat-theme/CatCodeAnimation.js';

interface GeminiMessageProps {
  text: string;
  isPending: boolean;
  availableTerminalHeight?: number;
  terminalWidth: number;
}

export const GeminiMessage: React.FC<GeminiMessageProps> = ({
  text,
  isPending,
  availableTerminalHeight,
  terminalWidth,
}) => {
  const { renderMarkdown } = useUIState();
  // cat-theme: left-side bubble prefix (cat paw instead of ✦)
  const prefix = '🐾 ';
  const prefixWidth = 3; // emoji counts as 2 + space

  const isAlternateBuffer = useAlternateBuffer();

  // cat-theme: detect active code streaming — show animation, hide raw stream
  const showCodeAnimation = isPending && isStreamingCode(text);
  const codeLang = showCodeAnimation ? getStreamingCodeLang(text) : undefined;

  // The text shown in the bubble: when streaming code, show only the text
  // that appeared BEFORE the open code fence (so prose is visible).
  const visibleText = showCodeAnimation
    ? text.slice(0, text.lastIndexOf('```')).trimEnd()
    : text;

  const innerWidth = Math.max(terminalWidth - prefixWidth, 0);

  const bubbleContent = (
    <Box flexDirection="column" flexGrow={1}>
      {/* Prose text (always shown) */}
      {visibleText.length > 0 && (
        <MarkdownDisplay
          text={visibleText}
          isPending={isPending && !showCodeAnimation}
          availableTerminalHeight={
            isAlternateBuffer || availableTerminalHeight === undefined
              ? undefined
              : Math.max(availableTerminalHeight - 1, 1)
          }
          terminalWidth={innerWidth}
          renderMarkdown={renderMarkdown}
        />
      )}

      {/* cat-theme: code animation replaces raw stream */}
      {showCodeAnimation && (
        <CatCodeAnimation width={innerWidth} lang={codeLang} />
      )}

      <Box
        marginTop={isAlternateBuffer ? 0 : 1}
        marginBottom={isAlternateBuffer ? 1 : 0}
      >
        <ShowMoreLines
          constrainHeight={availableTerminalHeight !== undefined}
        />
      </Box>
    </Box>
  );

  // cat-theme: iMessage left-aligned bubble layout
  const content = (
    <Box flexDirection="row" alignItems="flex-start">
      {/* Left avatar/prefix */}
      <Box width={prefixWidth} flexShrink={0}>
        <Text color={theme.text.accent} aria-label={SCREEN_READER_MODEL_PREFIX}>
          {prefix}
        </Text>
      </Box>
      {bubbleContent}
    </Box>
  );

  return isAlternateBuffer ? (
    <OverflowProvider>{content}</OverflowProvider>
  ) : (
    content
  );
};
