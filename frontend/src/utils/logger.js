/**
 * Logger Utilities
 * 
 * Provides simple logging utilities for the SDK.
 * Converted from TypeScript to JavaScript.
 */

let log = null;
let error = null;

export const sendMessage = (msg) => {
  if (log) log(msg);
};

export const sendErrorMessage = (err) => {
  if (error) error(err);
};

export const setLoggers = (logFunc, errorFunc) => {
  log = logFunc;
  error = errorFunc;
};

