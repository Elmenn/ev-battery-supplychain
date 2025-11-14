// config-overrides.js
const webpack = require('webpack');
const path = require('path');

module.exports = function override(config, env) {
  // Add polyfills for Node.js core modules
  config.resolve.fallback = {
    ...config.resolve.fallback,
    "crypto": require.resolve("crypto-browserify"),
    "stream": require.resolve("stream-browserify"),
    "buffer": require.resolve("buffer"),
    "http": require.resolve("stream-http"),
    "https": require.resolve("https-browserify"),
    "zlib": require.resolve("browserify-zlib"),
    "url": require.resolve("url/"),
    "fs": false,
    "net": false,
    "tls": false,
    "path": false,
    "os": false,
    "vm": false,
    "process": require.resolve("process/browser")
  };

  // Add Buffer and process polyfills
  config.plugins.push(
    new webpack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
      process: 'process',
    }),
    // CRITICAL: Replace @whatwg-node/fetch with window.fetch to ensure our override works
    // This ensures GraphQL Mesh uses window.fetch (which has our override) instead of @whatwg-node/fetch
    new webpack.NormalModuleReplacementPlugin(
      /^@whatwg-node\/fetch$/,
      path.resolve(__dirname, 'src/lib/polyfills/whatwg-fetch-shim.js')
    )
  );

  // Fix for React Router 7 compatibility
  config.resolve.alias = {
    ...config.resolve.alias,
    'process/browser': require.resolve('process'),
    // CRITICAL: Replace @whatwg-node/fetch with our shim (backup to NormalModuleReplacementPlugin)
    '@whatwg-node/fetch': path.resolve(__dirname, 'src/lib/polyfills/whatwg-fetch-shim.js'),
    // CRITICAL: Ensure singleton resolution to prevent duplicate NETWORK_CONFIG instances
    // The SDK and app both import @railgun-community/shared-models, and they MUST use
    // the same NETWORK_CONFIG object or balance functions will read undefined values
    '@railgun-community/wallet': require.resolve('@railgun-community/wallet'),
    '@railgun-community/engine': require.resolve('@railgun-community/engine'),
    '@railgun-community/shared-models': require.resolve('@railgun-community/shared-models')
  };

  // CRITICAL: Force singleton modules to prevent duplicate instances
  // This ensures @railgun-community/shared-models is resolved to a single instance
  // across all entry points and chunks
  if (!config.optimization) {
    config.optimization = {};
  }
  if (!config.optimization.splitChunks) {
    config.optimization.splitChunks = { cacheGroups: {} };
  }
  if (!config.optimization.splitChunks.cacheGroups) {
    config.optimization.splitChunks.cacheGroups = {};
  }
  
  // Ensure shared-models is in a common chunk (prevents duplication)
  // This prevents webpack from creating separate instances when SDK and app import it
  // TEMPORARILY DISABLED - Testing if this causes webpack to hang
  // config.optimization.splitChunks.cacheGroups['railgun-shared'] = {
  //   test: /[\\/]node_modules[\\/]@railgun-community[\\/]shared-models[\\/]/,
  //   name: 'railgun-shared',
  //   chunks: 'all',
  //   enforce: true,
  //   priority: 20, // High priority to ensure singleton
  // };
  
  // Note: We'll use package manager overrides + direct SDK patching instead
  // The splitChunks approach might be causing webpack analysis to hang

  // Fix CSP issues by using a safe devtool and disable source map warnings
  // Temporarily disabled for faster builds (can re-enable later)
  config.devtool = false; // Disable source maps for faster compilation
  // config.devtool = 'cheap-module-source-map'; // Re-enable when needed
  
  // Disable source map warnings for problematic packages
  config.module.rules.push({
    test: /\.js$/,
    enforce: 'pre',
    use: ['source-map-loader'],
    exclude: [
      /node_modules\/json-canonicalize/,
      /node_modules\/src\//
    ]
  });

  // Fix webpack module resolution issues
  config.resolve.modules = ['node_modules'];
  
  // Ensure proper module resolution
  config.resolve.extensionAlias = {
    '.js': ['.js', '.jsx'],
    '.mjs': ['.mjs', '.js'],
    '.cjs': ['.cjs', '.js']
  };

  // Ignore source map warnings for problematic packages
  config.ignoreWarnings = [
    /Failed to parse source map/,
    /json-canonicalize/,
    /src\//
  ];

  // Fix webpack dev server deprecation warnings
  if (config.devServer) {
    config.devServer = {
      ...config.devServer,
      setupMiddlewares: (middlewares, devServer) => {
        // This replaces the deprecated onAfterSetupMiddleware and onBeforeSetupMiddleware
        return middlewares;
      }
    };
  }

  return config;
};
