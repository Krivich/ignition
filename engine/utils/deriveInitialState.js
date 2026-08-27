import deepGet from './deepGet.js';

function setByPath(obj, path, value) {
  const keys = path.split('.');
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (current[keys[i]] === undefined || current[keys[i]] === null) {
      current[keys[i]] = {};
    }
    current = current[keys[i]];
  }
  current[keys[keys.length - 1]] = value;
}

/**
 * Extract all state paths referenced by Ignition attributes in the HTML.
 * Returns a Set of dot-notation paths.
 */
export function extractIgnitionPaths(html) {
  const paths = new Set();

  const add = (path) => {
    if (path) paths.add(path.replace(/^!/, ''));
  };

  // data-ignition-binding="path"
  let m;
  const bindingRe = /data-ignition-binding="([^"]+)"/g;
  while ((m = bindingRe.exec(html)) !== null) add(m[1]);

  // data-ignition-data="a, b"
  const dataRe = /data-ignition-data="([^"]+)"/g;
  while ((m = dataRe.exec(html)) !== null) {
    m[1].split(',').forEach((part) => add(part.trim()));
  }

  // data-ignition-depends="a, b"
  const dependsRe = /data-ignition-depends="([^"]+)"/g;
  while ((m = dependsRe.exec(html)) !== null) {
    m[1].split(',').forEach((part) => add(part.trim()));
  }

  // data-ignition-class="class: path; class2: !path2"
  const classRe = /data-ignition-class="([^"]+)"/g;
  while ((m = classRe.exec(html)) !== null) {
    m[1].split(';').forEach((rule) => {
      const colon = rule.indexOf(':');
      if (colon !== -1) add(rule.slice(colon + 1).trim());
    });
  }

  // data-ignition-attr-*="path"
  const attrRe = /data-ignition-attr-[\w-]+="([^"]+)"/g;
  while ((m = attrRe.exec(html)) !== null) add(m[1]);

  // data-ignition-include="a, b" — explicit escape hatch
  const includeRe = /data-ignition-include="([^"]+)"/g;
  while ((m = includeRe.exec(html)) !== null) {
    m[1].split(',').forEach((part) => add(part.trim()));
  }

  return paths;
}

function hasInteractiveAttributes(html, analysis = null) {
  // Check for v1 interactive attributes
  if (/data-ignition-binding=|data-ignition-class=|data-ignition-attr-[\w-]+=|data-ignition-on=/.test(html)) {
    return true;
  }
  
  // Check for v2 autobindings from template analysis
  if (analysis && analysis.autobindings && analysis.autobindings.length > 0) {
    return true;
  }
  
  return false;
}

/**
 * Build a minimal subset of fullData containing only the requested paths.
 * If the page uses interactive attributes (bindings, actions, class/attr toggles) or autobindings,
 * the whole dataset is returned because custom actions/computed may read arbitrary paths.
 */
export function deriveInitialState(html, fullData, analysis = null) {
  if (hasInteractiveAttributes(html, analysis)) {
    return fullData;
  }
  const paths = extractIgnitionPaths(html);
  const subset = {};
  for (const path of paths) {
    const value = deepGet(fullData, path);
    if (value !== null && value !== undefined) {
      setByPath(subset, path, value);
    }
  }
  return subset;
}
