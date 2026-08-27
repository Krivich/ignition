import { fetchJson } from './render.js';

export function getSlice(data, path) {
  if (!path) return data;
  return path.split('.').reduce((cur, key) => (cur == null ? undefined : cur[key]), data);
}

function equal(a, b) {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return a === b;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  const aJson = JSON.stringify(a);
  const bJson = JSON.stringify(b);
  return aJson === bJson;
}

/**
 * Compare the render manifest against a freshly loaded dataset.
 * manifest: { blockName: sliceUsedByServer }
 * blockPaths: { blockName: dataPath } (from data-ignition-data)
 * newDataset: full dataset loaded by the client
 * Returns a Set of blockName strings whose slice changed.
 */
export function diffSlices(manifest, blockPaths, newDataset) {
  const changed = new Set();
  for (const name of Object.keys(manifest)) {
    const path = blockPaths[name];
    const oldSlice = manifest[name];
    const newSlice = path ? getSlice(newDataset, path) : newDataset;
    if (!equal(oldSlice, newSlice)) changed.add(name);
  }
  return changed;
}

/**
 * Apply only the changed slices to the reactive state, per block path.
 * State subscriptions re-render exactly the affected blocks.
 */
export function mergeSlices(state, changedBlockNames, blockPaths, newDataset) {
  for (const name of changedBlockNames) {
    const path = blockPaths[name];
    if (!path) continue;
    const value = getSlice(newDataset, path);
    setByPath(state, path, value);
  }
}

function setByPath(obj, path, value) {
  const keys = path.split('.');
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (current[keys[i]] === undefined) current[keys[i]] = {};
    current = current[keys[i]];
  }
  current[keys[keys.length - 1]] = value;
}

function readManifest() {
  return (
    (typeof window !== 'undefined' && window.__IGNITION_MANIFEST__) || {}
  );
}

function readBlockPaths() {
  const blockPaths = {};
  if (typeof document !== 'undefined') {
    document
      .querySelectorAll('[data-ignition-block][data-ignition-data]')
      .forEach((block) => {
        blockPaths[block.getAttribute('data-ignition-block')] = block.getAttribute(
          'data-ignition-data'
        );
      });
  }
  return blockPaths;
}

/**
 * Client-side personalized dataset loading (requirement E).
 * Fetches a (possibly different) full dataset, diffs it against the render
 * manifest, and merges only the changed slices into the reactive state —
 * so exactly the affected blocks re-render.
 */
export async function loadDataset(state, url) {
  const dataset = await fetchJson(url);
  const manifest = readManifest();
  const blockPaths = readBlockPaths();
  const changed = diffSlices(manifest, blockPaths, dataset);
  mergeSlices(state, changed, blockPaths, dataset);
  return { changed: Array.from(changed) };
}
