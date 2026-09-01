import { renderTemplate, hydrate } from './render.js';
import { parseBlockData, buildBlockContext } from '../../utils/parseBlockData.js';

const boundElements = new WeakSet();
const classBoundElements = new WeakSet();
const attrBoundElements = new WeakSet();
const textBoundElements = new WeakSet();
const autoBoundElements = new WeakSet();

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function setByPath(obj, path, value) {
  const keys = path.split('.');
  if (keys.some(k => DANGEROUS_KEYS.has(k))) {
    throw new Error(`Refusing to set prototype-polluting path: ${path}`);
  }
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (current[keys[i]] === undefined) current[keys[i]] = {};
    current = current[keys[i]];
  }
  current[keys[keys.length - 1]] = value;
}

function getByPath(obj, path) {
  return path.split('.').reduce((cur, key) => cur?.[key], obj);
}

function updateFormElement(element, val) {
  const isCheckbox = element.type === 'checkbox';
  if (isCheckbox) {
    const bool = !!val;
    if (element.checked !== bool) element.checked = bool;
  } else {
    const str = val ?? '';
    if (element.value !== str) element.value = str;
  }
}

export function initBinding(state, element) {
  initFormBinding(state, element);
  initClassBinding(state, element);
  initAttrBinding(state, element);
  initTextBinding(state, element);
  initAutoBinding(state, element);
}

// Single DOM pass finding every element that carries a binding marker, instead
// of the previous two queries (a targeted selector + a full '*'-wide scan for
// the data-ignition-attr-* prefix). The common exact markers are matched by a
// cheap selector; the attr-prefixed ones (which have no fixed name) are caught
// in one descendant walk.
export function findBoundElements(root) {
  const found = [];
  const seen = new Set();
  const exact = root.querySelectorAll(
    '[data-ignition-binding], [data-ignition-class], [data-ignition-text]'
  );
  for (let i = 0; i < exact.length; i++) {
    const el = exact[i];
    found.push(el);
    seen.add(el);
  }
  const all = root.querySelectorAll('*');
  for (let i = 0; i < all.length; i++) {
    const el = all[i];
    if (seen.has(el)) continue;
    const attrs = el.attributes;
    let hasAttr = false;
    for (let j = 0; j < attrs.length; j++) {
      if (attrs[j].name.indexOf('data-ignition-attr-') === 0) { hasAttr = true; break; }
    }
    if (hasAttr) found.push(el);
  }
  return found;
}

function initFormBinding(state, element) {
  const path = element.getAttribute('data-ignition-binding');
  if (!path) return;
  if (boundElements.has(element)) return;
  boundElements.add(element);

  const tag = element.tagName.toLowerCase();
  const isCheckbox = element.type === 'checkbox';
  const eventType = (tag === 'select' || isCheckbox) ? 'change' : 'input';

  element.addEventListener(eventType, () => {
    setByPath(state, path, isCheckbox ? element.checked : element.value);
  });

  state.subscribe(path, () => {
    updateFormElement(element, getByPath(state, path));
  });

  const initial = getByPath(state, path);
  if (initial !== undefined) {
    updateFormElement(element, initial);
  }
}

function coerceValue(state, expr) {
  const neg = expr.startsWith('!');
  const path = neg ? expr.slice(1).trim() : expr.trim();
  const val = getByPath(state, path);
  return neg ? !val : !!val;
}

function initClassBinding(state, element) {
  const attr = element.getAttribute('data-ignition-class');
  if (!attr) return;
  if (classBoundElements.has(element)) return;
  classBoundElements.add(element);

  const rules = attr.split(';').map(s => s.trim()).filter(Boolean).map(rule => {
    const [className, pathExpr] = rule.split(':').map(s => s.trim());
    return { className, pathExpr };
  });

  function sync() {
    for (const { className, pathExpr } of rules) {
      const val = coerceValue(state, pathExpr);
      element.classList.toggle(className, val);
    }
  }

  const seen = new Set();
  for (const { pathExpr } of rules) {
    const path = pathExpr.startsWith('!') ? pathExpr.slice(1).trim() : pathExpr.trim();
    if (seen.has(path)) continue;
    seen.add(path);
    state.subscribe(path, sync);
  }
  sync();
}

function initAttrBinding(state, element) {
  const attrs = Array.from(element.attributes)
    .filter(a => a.name.startsWith('data-ignition-attr-'))
    .map(a => ({ attrName: a.name.slice('data-ignition-attr-'.length), pathExpr: a.value }));

  if (attrs.length === 0) return;
  if (attrBoundElements.has(element)) return;
  attrBoundElements.add(element);

  function sync() {
    for (const { attrName, pathExpr } of attrs) {
      const val = coerceValue(state, pathExpr);
      if (attrName in element && typeof element[attrName] === 'boolean') {
        element[attrName] = val;
      } else {
        if (val) {
          element.setAttribute(attrName, 'true');
        } else {
          element.removeAttribute(attrName);
        }
      }
    }
  }

  const seen = new Set();
  for (const { pathExpr } of attrs) {
    const path = pathExpr.startsWith('!') ? pathExpr.slice(1).trim() : pathExpr.trim();
    if (seen.has(path)) continue;
    seen.add(path);
    state.subscribe(path, sync);
  }
  sync();
}

function initTextBinding(state, element) {
  const path = element.getAttribute('data-ignition-text');
  if (!path) return;
  if (textBoundElements.has(element)) return;
  textBoundElements.add(element);

  const sync = () => {
    const val = getByPath(state, path);
    element.textContent = val ?? '';
  };

  state.subscribe(path, sync);
  sync();
}

function initAutoBinding(state, element) {
  const tag = element.tagName.toLowerCase();
  if (tag !== 'input' && tag !== 'textarea') return;
  if (autoBoundElements.has(element)) return;

  // Check for value="{{path}}" or checked="{{path}}"
  const valueAttr = element.getAttribute('value');
  const checkedAttr = element.getAttribute('checked');
  
  let path = null;
  let type = null;

  if (valueAttr && valueAttr.startsWith('{{') && valueAttr.endsWith('}}')) {
    path = valueAttr.slice(2, -2).trim();
    type = 'value';
  } else if (checkedAttr && checkedAttr.startsWith('{{') && checkedAttr.endsWith('}}')) {
    path = checkedAttr.slice(2, -2).trim();
    type = 'checked';
  }

  if (!path) return;
  
  autoBoundElements.add(element);

  // Set data-ignition-path for testing
  element.setAttribute('data-ignition-path', path);

  const isCheckbox = element.type === 'checkbox';
  const eventType = isCheckbox ? 'change' : 'input';

  // Two-way binding: element -> state
  element.addEventListener(eventType, () => {
    const val = isCheckbox ? element.checked : element.value;
    setByPath(state, path, val);
  });

  // Two-way binding: state -> element
  state.subscribe(path, () => {
    const val = getByPath(state, path);
    if (isCheckbox) {
      const bool = !!val;
      if (element.checked !== bool) element.checked = bool;
    } else {
      const str = val ?? '';
      if (element.value !== str) element.value = str;
    }
  });

  // Initial sync
  const initial = getByPath(state, path);
  if (initial !== undefined) {
    if (isCheckbox) {
      element.checked = !!initial;
    } else {
      element.value = initial ?? '';
    }
  }
}

export function initBlocks(state, options = {}) {
  const { renderers = {}, sourceDeps = {}, afterHydrate } = options;
  const blocks = document.querySelectorAll('[data-ignition-block]');
  blocks.forEach(block => {
    const templateName = block.getAttribute('data-ignition-block');
    const dataPath = block.getAttribute('data-ignition-data');
    const dependsStr = block.getAttribute('data-ignition-depends') || '';
    
    // v2: depends defaults to data if not specified
    let depends;
    if (dependsStr) {
      depends = dependsStr.split(',').map(s => s.trim()).filter(Boolean);
    } else if (dataPath) {
      // Auto-depend on data paths
      depends = dataPath.split(',').map(s => s.trim()).filter(Boolean);
    } else {
      depends = [];
    }

    const customRenderer = renderers[templateName];
    const extraDeps = sourceDeps[templateName] || [];

    const isServerFilled = block.innerHTML.trim() !== '';

    function processBlockContent(root) {
      const bound = findBoundElements(root);
      for (let i = 0; i < bound.length; i++) {
        initBinding(state, bound[i]);
      }
    }

    function render() {
      try {
        const dataPath = block.getAttribute('data-ignition-data');
        let data;
        if (customRenderer) {
          data = customRenderer(state);
        } else if (dataPath) {
          const parsed = parseBlockData(dataPath);
          data = buildBlockContext(state, parsed, (obj, path) => getByPath(obj, path));
        } else {
          data = state;
        }
        const html = renderTemplate(templateName, data);
        hydrate(block, html);
        processBlockContent(block);
        if (afterHydrate) afterHydrate(block, html);
      } catch (err) {
        console.error(`[ignition] Block render error: ${templateName}`, err);
      }
    }

    if (isServerFilled) {
      processBlockContent(block);
      if (afterHydrate) afterHydrate(block, block.innerHTML);
    } else {
      render();
    }

    for (const dep of [...depends, ...extraDeps]) {
      state.subscribe(dep, () => render());
    }
  });
}
