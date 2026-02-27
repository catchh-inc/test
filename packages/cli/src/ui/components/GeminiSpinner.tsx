/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// cat-theme: This file delegates to CatSpinner for beautiful animated visuals.
// The GeminiSpinner API is preserved exactly so all callers work unchanged.
// To revert to original Google spinner: swap CatSpinner import back to
// the original inline implementation below.

import type React from 'react';
import type { SpinnerName } from 'cli-spinners';
import { CatSpinner } from '../../cat-theme/CatSpinner.js';

interface GeminiSpinnerProps {
  spinnerType?: SpinnerName;
  altText?: string;
}

export const GeminiSpinner: React.FC<GeminiSpinnerProps> = ({ altText }) => 
  // cat-theme: delegate to CatSpinner (warm gradient + animated braille dots)
   <CatSpinner variant="dots" altText={altText} />
;
