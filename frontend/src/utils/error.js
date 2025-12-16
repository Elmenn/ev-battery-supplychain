/**
 * Error Reporting Utilities
 * 
 * Provides error reporting and sanitization utilities.
 * Converted from TypeScript to JavaScript.
 */

import { sanitizeError } from '@railgun-community/shared-models';
import { sendErrorMessage } from './logger';

export const reportAndSanitizeError = (func, err) => {
  sendErrorMessage(`Caught error in RAILGUN Wallet SDK: ${func}`);

  if (err instanceof Error) {
    const error = sanitizeError(err);
    sendErrorMessage(error);
    return error;
  }

  const error = new Error('Unknown error.', { cause: err });
  sendErrorMessage(error);
  return error;
};

