import { renderTemplate, hydrate } from './render.js';
import { parseBlockData, buildBlockContext } from '../../utils/parseBlockData.js';

const boundElements = new WeakSet();
const classBoundElements = new WeakSet();
const attrBoundElements = new WeakSet();
const textBoundElements = new WeakSet();
const autoBoundElements = new WeakSet();
const eachBoundElements = new WeakMap();

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
  const attr = element.getAttribute('data-ignition-text');
  if (!attr) return;
  if (textBoundElements.has(element)) return;
  if (attr.startsWith('@p:')) {
    initEachTextBinding(state, element, attr);
    return;
  }
  textBoundElements.add(element);
  const path = attr;

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

// ---- row-scoped projections (fine-grained {{#each}}) ----

// Sticker format produced by the compiler: `@p:<collection>.*.<leaf>` where
// `.*.` marks the row position that gets resolved per row at bind time.
function parseEachSticker(attr) {
  const rest = attr.slice(3);
  const idx = rest.indexOf('.*.');
  if (idx < 0) return null;
  const collection = rest.slice(0, idx);
  const leaf = rest.slice(idx + 3);
  if (!collection || !leaf) return null;
  return { collection, leaf };
}

function rowIndexInParent(row, collection) {
  let i = 0;
  let n = row.previousElementSibling;
  while (n) {
    if (n.getAttribute('data-ignition-row') === collection) i++;
    n = n.previousElementSibling;
  }
  return i;
}

function bindEachText(state, element, meta) {
  const path = `${meta.collection}.${meta.index}.${meta.leaf}`;
  const sync = () => {
    element.textContent = getByPath(state, path) ?? '';
  };
  const unsub = state.subscribe(path, sync);
  sync();
  eachBoundElements.set(element, { ...meta, state, unsub });
}

function initEachTextBinding(state, element, attr) {
  const spec = parseEachSticker(attr);
  if (!spec) return;
  textBoundElements.add(element);
  const row = element.closest(`[data-ignition-row="${spec.collection}"]`);
  if (!row) return;
  const index = rowIndexInParent(row, spec.collection);
  // The collection may not exist at the state root yet (a controller computes
  // it after boot, or the partial is rendered against a shifted context, e.g.
  // CSR pagination items). Wait for it instead of blanking the SSR text with
  // an unresolved path; when it appears, bind at the row's CURRENT position.
  if (getByPath(state, spec.collection) === undefined) {
    const unsubWait = state.subscribe(spec.collection, () => {
      if (getByPath(state, spec.collection) === undefined) return;
      unsubWait();
      const currentRow = element.closest(`[data-ignition-row="${spec.collection}"]`);
      if (!currentRow) return;
      bindEachText(state, element, {
        collection: spec.collection,
        leaf: spec.leaf,
        index: rowIndexInParent(currentRow, spec.collection),
      });
    });
    eachBoundElements.set(element, { collection: spec.collection, leaf: spec.leaf, state, unsub: unsubWait, index });
    return;
  }
  bindEachText(state, element, { collection: spec.collection, leaf: spec.leaf, index });
}

// After a hydrate (reorder/insert/delete inside a list), reused rows keep
// their DOM identity but their sticker subscriptions point at stale indices.
// One ordered pass re-derives every row's index and rebinds drifted stickers
// (dropping the old subscription), so row identity survives structural moves.
export function rescopeEachBindings(root) {
  const rows = root.querySelectorAll('[data-ignition-row]');
  if (!rows.length) return;
  const positions = new Map();
  const perParent = new Map();
  for (const row of rows) {
    const collection = row.getAttribute('data-ignition-row');
    let byCollection = perParent.get(row.parentNode);
    if (!byCollection) {
      byCollection = new Map();
      perParent.set(row.parentNode, byCollection);
    }
    const index = byCollection.get(collection) || 0;
    positions.set(row, { collection, index });
    byCollection.set(collection, index + 1);
  }

  const stickers = root.querySelectorAll('[data-ignition-text^="@p:"]');
  for (const el of stickers) {
    const meta = eachBoundElements.get(el);
    if (!meta) continue;
    // Still waiting for the collection to appear at the state root - the
    // wait subscription will bind it; nothing to rescope yet.
    if (getByPath(meta.state, meta.collection) === undefined) continue;
    const row = el.closest(`[data-ignition-row="${meta.collection}"]`);
    if (!row) {
      meta.unsub();
      eachBoundElements.delete(el);
      continue;
    }
    const pos = positions.get(row);
    if (!pos || pos.index === meta.index) continue;
    meta.unsub();
    bindEachText(meta.state, el, { collection: meta.collection, leaf: meta.leaf, index: pos.index });
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
      rescopeEachBindings(root);
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

    // Fine-grained depends paths (stamped by the compiler when every data
    // flow from that path into the template goes through @p stickers): leaf
    // changes under them patch cells via stickers, only structural changes
    // re-render the block.
    const fineStr = block.getAttribute('data-ignition-fine') || '';
    const finePaths = new Set(fineStr.split(',').map((s) => s.trim()).filter(Boolean));

    for (const dep of [...depends, ...extraDeps]) {
      if (finePaths.has(dep)) {
        state.subscribe(dep, (p, o, n, kind) => {
          if (kind === 'structural') render();
        });
      } else {
        state.subscribe(dep, () => render());
      }
    }
  });
}
