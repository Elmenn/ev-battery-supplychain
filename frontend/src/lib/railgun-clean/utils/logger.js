// Minimal logger for railgun-clean modules
export function error(...args) {
  // Only log critical errors
  console.error('[railgun-clean][error]', ...args);
}

export function warn(...args) {
  console.warn('[railgun-clean][warn]', ...args);
}

export default { error, warn };
