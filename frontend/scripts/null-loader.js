/**
 * Null loader for TypeScript files in railgun directory
 * 
 * This loader returns an empty module that exports nothing.
 * It's used to prevent webpack from trying to process TypeScript files
 * that will be loaded via dynamic imports at runtime.
 * 
 * The dynamic imports will handle loading the actual modules.
 */

module.exports = function nullLoader(source) {
  // Return an empty module with just exports
  // This prevents webpack from trying to process the TypeScript file
  // and from trying to resolve its imports
  return 'export {};';
};

