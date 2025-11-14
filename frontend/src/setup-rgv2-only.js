// RGV2-only mode: disable legacy railgunClient.js logs as early as possible
if (typeof window !== 'undefined') {
  window.__USE_RGV2_ONLY__ = true;
  const SUPPRESSED_SUBSTRINGS = [
    '[RG',
    '[RGV2',
    '[Bootstrap',
    '[GraphQL',
    '[whatwg-fetch-shim',
    '[UTXO',
    '[TXID',
    'Railgun',
    '🔍',
    '✅',
    '⚠️',
    '❌',
    '🔧',
    '🧪',
    '🎯',
    '🔄',
    'ArtifactStore',
    'POI'
  ];

  const CONSOLE_METHODS = [
    'log',
    'info',
    'warn',
    'error',
    'debug',
    'table',
    'trace',
    'group',
    'groupCollapsed'
  ];

  const shouldSuppress = (args) => {
    for (const arg of args) {
      if (typeof arg === 'string') {
        if (SUPPRESSED_SUBSTRINGS.some((token) => arg.includes(token))) {
          return true;
        }
      }
    }
    return false;
  };

  const applyFilter = () => {
    CONSOLE_METHODS.forEach((method) => {
      const originalKey = `__orig_${method}`;
      if (!console[originalKey]) {
        console[originalKey] = console[method] ? console[method].bind(console) : () => {};
      }
      const originalFn = console[originalKey];

      const filtered = function (...args) {
        if (shouldSuppress(args)) {
          return;
        }
        return originalFn(...args);
      };
      Object.defineProperty(filtered, '__isRGFiltered', {
        value: true,
        writable: false,
        enumerable: false,
      });
      console[method] = filtered;
    });
  };

  const ensureFilter = () => {
    let needsReapply = false;
    CONSOLE_METHODS.forEach((method) => {
      const current = console[method];
      if (!current || current.__isRGFiltered !== true) {
        needsReapply = true;
      }
    });
    if (needsReapply) {
      applyFilter();
    }
  };

  if (!window.__RG_LOG_FILTER_INSTALLED__) {
    applyFilter();
    window.__RG_LOG_FILTER_INSTALLED__ = true;
    // Periodically ensure other scripts haven't overwritten the filter.
    if (!window.__RG_LOG_FILTER_INTERVAL__) {
      window.__RG_LOG_FILTER_INTERVAL__ = window.setInterval(ensureFilter, 1000);
    }
  }
}









