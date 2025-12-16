/**
 * Railgun Engine Management
 * 
 * Manages the RailgunEngine singleton instance.
 * Converted from TypeScript to JavaScript.
 */

import { RailgunEngine } from '@railgun-community/engine';
import { isDefined } from '@railgun-community/shared-models';

let savedEngine; // Optional<RailgunEngine>

export const getEngine = () => {
  if (!savedEngine) {
    throw new Error('RAILGUN Engine not yet initialized.');
  }
  return savedEngine;
};

export const hasEngine = () => {
  return isDefined(savedEngine);
};

export const setEngine = (engine) => { // Optional<RailgunEngine>
  savedEngine = engine;
};
