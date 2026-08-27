import { renderTemplate, hydrate } from './render.js';
import { parseBlockData, buildBlockContext } from '../../utils/parseBlockData.js';

const actionRegistry = new Map();
const boundElements = new WeakSet();
const classBoundElements = new WeakSet();
const attrBoundElements = new WeakSet();
const handledElements = new WeakSet();

export function resetActions() {
  actionRegistry.clear();
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

function getByPath(obj, path) {
  return path.split('.').reduce((cur, key) => cur?.[key], obj);
}

function parseArgs(argsStr) {
  if (!argsStr || !argsStr.trim()) return [];
  return argsStr.split(',').map(arg => {
    const trimmed = arg.trim();
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
    if ((trimmed.startsWith("'") && trimmed.endsWith("'")) ||
        (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
      return trimmed.slice(1, -1);
    }
    return trimmed;
  });
}

export function registerAction(name, fn) {
  actionRegistry.set(name, fn);
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

export function processEventHandlers(state, element) {
  const attr = element.getAttribute('data-ignition-on');
  if (!attr) return;
  if (handledElements.has(element)) return;
  handledElements.add(element);

  const declarations = attr.split(';').map(s => s.trim()).filter(Boolean);
  for (const decl of declarations) {
    const match = decl.match(/^(\w+)\s*(?:→|->)\s*(\w+)(?:\s*\(([^)]*)\))?$/);
    if (!match) continue;

    const [, eventName, actionName, argsStr] = match;
    const args = parseArgs(argsStr);

    element.addEventListener(eventName, (e) => {
      if (eventName === 'submit') e.preventDefault();
      const handler = actionRegistry.get(actionName);
      if (handler) handler(state, ...args, e);
    });
  }
}

export function initBlocks(state, options = {}) {
  const { renderers = {}, sourceDeps = {}, afterHydrate } = options;
  const blocks = document.querySelectorAll('[data-ignition-block]');
  blocks.forEach(block => {
    const templateName = block.getAttribute('data-ignition-block');
    const dependsStr = block.getAttribute('data-ignition-depends') || '';
    const depends = dependsStr.split(',').map(s => s.trim()).filter(Boolean);

    const customRenderer = renderers[templateName];
    const extraDeps = sourceDeps[templateName] || [];

    const isServerFilled = block.innerHTML.trim() !== '';

    function hasAttrBinding(el) {
      return Array.from(el.attributes).some(a => a.name.startsWith('data-ignition-attr-'));
    }

    function processBlockContent(root) {
      root.querySelectorAll('[data-ignition-binding], [data-ignition-class]').forEach(el => {
        initBinding(state, el);
      });
      root.querySelectorAll('*').forEach(el => {
        if (hasAttrBinding(el)) initBinding(state, el);
      });
      root.querySelectorAll('[data-ignition-on]').forEach(el => {
        processEventHandlers(state, el);
      });
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
