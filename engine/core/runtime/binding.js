import { renderTemplate, hydrate } from './render.js';

const actionRegistry = new Map();

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

export function initBinding(state, element) {
  const path = element.getAttribute('data-ignition-binding');
  if (!path) return;

  const tag = element.tagName.toLowerCase();
  const isCheckbox = element.type === 'checkbox';
  const eventType = (tag === 'select' || isCheckbox) ? 'change' : 'input';

  element.addEventListener(eventType, () => {
    setByPath(state, path, isCheckbox ? element.checked : element.value);
  });

  state.subscribe(path, () => {
    const val = getByPath(state, path);
    if (isCheckbox) {
      if (element.checked !== !!val) {
        element.checked = !!val;
      }
    } else {
      if (element.value !== val) {
        element.value = val ?? '';
      }
    }
  });

  const initial = getByPath(state, path);
  if (initial !== undefined) {
    if (isCheckbox) {
      if (element.checked !== !!initial) {
        element.checked = !!initial;
      }
    } else {
      if (element.value !== initial) {
        element.value = initial;
      }
    }
  }
}

export function processEventHandlers(state, element) {
  const attr = element.getAttribute('data-ignition-on');
  if (!attr) return;

  const match = attr.match(/^(\w+)\s*→\s*(\w+)(?:\s*\(([^)]*)\))?$/);
  if (!match) return;

  const [, eventName, actionName, argsStr] = match;
  const args = parseArgs(argsStr);

  element.addEventListener(eventName, (e) => {
    if (eventName === 'submit') e.preventDefault();
    const handler = actionRegistry.get(actionName);
    if (handler) handler(state, ...args, e);
  });
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

    function render() {
      try {
        const data = customRenderer ? customRenderer(state) : state;
        const html = renderTemplate(templateName, data);
        hydrate(block, html);
        if (afterHydrate) afterHydrate(block, html);
      } catch (err) {
        console.error(`[ignition] Block render error: ${templateName}`, err);
      }
    }

    render();

    for (const dep of [...depends, ...extraDeps]) {
      state.subscribe(dep, () => render());
    }
  });
}
