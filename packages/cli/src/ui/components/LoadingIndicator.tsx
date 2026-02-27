/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// cat-theme: CatTaskProgress is injected here for beautiful "task in progress"
// animations. The inline variant still uses the original GeminiRespondingSpinner.
// To revert: remove the CatTaskProgress import and its usage below.

import type { ThoughtSummary } from '@google/gemini-cli-core';
import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { useStreamingContext } from '../contexts/StreamingContext.js';
import { StreamingState } from '../types.js';
import { GeminiRespondingSpinner } from './GeminiRespondingSpinner.js';
import { formatDuration } from '../utils/formatters.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { isNarrowWidth } from '../utils/isNarrowWidth.js';
import { INTERACTIVE_SHELL_WAITING_PHRASE } from '../hooks/usePhraseCycler.js';
import { CatTaskProgress } from '../../cat-theme/CatTaskProgress.js';

interface LoadingIndicatorProps {
  currentLoadingPhrase?: string;
  elapsedTime: number;
  inline?: boolean;
  rightContent?: React.ReactNode;
  thought?: ThoughtSummary | null;
  thoughtLabel?: string;
  showCancelAndTimer?: boolean;
}

export const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({
  currentLoadingPhrase,
  elapsedTime,
  inline = false,
  rightContent,
  thought,
  thoughtLabel,
  showCancelAndTimer = true,
}) => {
  const streamingState = useStreamingContext();
  const { columns: terminalWidth } = useTerminalSize();
  const isNarrow = isNarrowWidth(terminalWidth);

  if (
    streamingState === StreamingState.Idle &&
    !currentLoadingPhrase &&
    !thought
  ) {
    return null;
  }

  // Prioritize the interactive shell waiting phrase over the thought subject
  // because it conveys an actionable state for the user (waiting for input).
  const primaryText =
    currentLoadingPhrase === INTERACTIVE_SHELL_WAITING_PHRASE
      ? currentLoadingPhrase
      : thought?.subject
        ? (thoughtLabel ?? thought.subject)
        : currentLoadingPhrase;
  const hasThoughtIndicator =
    currentLoadingPhrase !== INTERACTIVE_SHELL_WAITING_PHRASE &&
    Boolean(thought?.subject?.trim());
  const thinkingIndicator = hasThoughtIndicator ? '💬 ' : '';

  const cancelAndTimerContent =
    showCancelAndTimer &&
    streamingState !== StreamingState.WaitingForConfirmation
      ? `(esc to cancel, ${elapsedTime < 60 ? `${elapsedTime}s` : formatDuration(elapsedTime * 1000)})`
      : null;

  if (inline) {
    return (
      <Box>
        <Box marginRight={1}>
          <GeminiRespondingSpinner
            nonRespondingDisplay={
              streamingState === StreamingState.WaitingForConfirmation
                ? '⠏'
                : ''
            }
          />
        </Box>
        {primaryText && (
          <Text color={theme.text.primary} italic wrap="truncate-end">
            {thinkingIndicator}
            {primaryText}
          </Text>
        )}
        {cancelAndTimerContent && (
          <>
            <Box flexShrink={0} width={1} />
            <Text color={theme.text.secondary}>{cancelAndTimerContent}</Text>
          </>
        )}
      </Box>
    );
  }

  // cat-theme: Use beautiful CatTaskProgress for the block (non-inline) display.
  // The inline variant is kept as-is since it is used inside message rows.
  const isResponding = streamingState === StreamingState.Responding;
  const isWaitingConfirm =
    streamingState === StreamingState.WaitingForConfirmation;

  return (
    <Box paddingLeft={0} flexDirection="column">
      {/* cat-theme: animated task-in-progress display */}
      {(isResponding || isWaitingConfirm || primaryText) && (
        <Box
          width="100%"
          flexDirection={isNarrow ? 'column' : 'row'}
          alignItems={isNarrow ? 'flex-start' : 'center'}
        >
          <Box flexDirection="column" flexGrow={1}>
            <CatTaskProgress
              label={
                isWaitingConfirm
                  ? 'Waiting for your confirmation…'
                  : thinkingIndicator + (primaryText ?? 'Task in progress…')
              }
              elapsedTime={
                showCancelAndTimer &&
                !isWaitingConfirm &&
                typeof elapsedTime === 'number'
                  ? elapsedTime
                  : undefined
              }
              showTimer={showCancelAndTimer && !isWaitingConfirm}
            />
          </Box>
          {!isNarrow && rightContent && <Box>{rightContent}</Box>}
        </Box>
      )}
      {isNarrow && rightContent && <Box>{rightContent}</Box>}
    </Box>
  );
};
