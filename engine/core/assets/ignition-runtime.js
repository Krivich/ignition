(function () {
  'use strict';

  // ========== deepGet (inlined from utils) ==========
  function deepGet(obj, path, defaultValue) {
    if (defaultValue === undefined) defaultValue = null;
    if (!obj || typeof obj !== 'object' || !path) return defaultValue;
    return path.split('.').reduce(function (current, key) {
      if (current === null || current === undefined) return defaultValue;
      return current[key] !== undefined ? current[key] : defaultValue;
    }, obj);
  }

  // ========== parseBlockData (inlined from utils) ==========
  function parseBlockData(dataStr) {
  if (!dataStr || !dataStr.trim()) {
    return { mode: 'single', paths: [] };
  }

  const parts = dataStr
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const paths = parts.map((part) => {
    const explicit = part.match(/^(.+?)\s+as\s+(\w+)$/i);
    if (explicit) {
      return { path: explicit[1].trim(), alias: explicit[2].trim() };
    }
    const segments = part.split('.');
    return { path: part, alias: segments[segments.length - 1] };
  });

  return {
    mode: paths.length === 1 ? 'single' : 'multi',
    paths
  };
}

function buildBlockContext(data, parsed, getter) {
  if (parsed.mode === 'single') {
    if (!parsed.paths[0]) return data;
    if (parsed.paths[0].path === '.') return data;
    return getter(data, parsed.paths[0].path);
  }

  const ctx = {};
  for (const { path, alias } of parsed.paths) {
    ctx[alias] = path === '.' ? data : getter(data, path);
  }
  return ctx;
}

  // ========== helpers.js (canonical, single source) ==========
  let manifest = {};

function resetManifest() {
  manifest = {};
}

function getManifest() {
  return manifest;
}

function escapeAttr(value) {
  return String(value).replace(/"/g, '&quot;');
}

function hasContent(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

/**
 * Single canonical source of every Ignition Handlebars helper/registration.
 * Pass the active Handlebars instance (server Node or client CDN) and the
 * helpers are registered against it — no server/client duplication.
 */
function registerHelpersWith(Handlebars) {
  Handlebars.registerHelper('times', function (n, block) {
    let accum = '';
    for (let i = 1; i <= n; ++i) {
      accum += block.fn(i);
    }
    return accum;
  });

  Handlebars.registerHelper('ifCond', function (v1, operator, v2, options) {
    switch (operator) {
      case '==':
        return v1 == v2 ? options.fn(this) : options.inverse(this);
      case '===':
        return v1 === v2 ? options.fn(this) : options.inverse(this);
      case '!=':
        return v1 != v2 ? options.fn(this) : options.inverse(this);
      case '!==':
        return v1 !== v2 ? options.fn(this) : options.inverse(this);
      case '<':
        return v1 < v2 ? options.fn(this) : options.inverse(this);
      case '<=':
        return v1 <= v2 ? options.fn(this) : options.inverse(this);
      case '>':
        return v1 > v2 ? options.fn(this) : options.inverse(this);
      case '>=':
        return v1 >= v2 ? options.fn(this) : options.inverse(this);
      case '&&':
        return v1 && v2 ? options.fn(this) : options.inverse(this);
      case '||':
        return v1 || v2 ? options.fn(this) : options.inverse(this);
      default:
        return options.inverse(this);
    }
  });

  Handlebars.registerHelper('get', function (obj, path) {
    return deepGet(obj, path);
  });

  Handlebars.registerHelper('concat', function () {
    return Array.prototype.slice.call(arguments, 0, -1).join('');
  });

  Handlebars.registerHelper('declineWord', function (count, one, two, five) {
    count = Math.abs(count) % 100;
    const n1 = count % 10;
    if (count > 10 && count < 20) return five;
    if (n1 > 1 && n1 < 5) return two;
    if (n1 === 1) return one;
    return five;
  });

  Handlebars.registerHelper('json', function (context) {
    return new Handlebars.SafeString(JSON.stringify(context));
  });

  Handlebars.registerHelper('eq', function (a, b) {
    return a === b;
  });

  Handlebars.registerHelper('starFill', function (level, starNum) {
    if (level >= starNum) return 100;
    if (level >= starNum - 0.5) return 50;
    return 0;
  });

  registerBlockHelper(Handlebars, { getManifest });
}

function registerBlockHelper(Handlebars, env) {
  Handlebars.registerHelper('block', function (options) {
    const name = options.hash.name;
    const dataPath = options.hash.data;
    const depends =
      options.hash.depends !== undefined ? options.hash.depends : dataPath || '';
    const layout = this && this.layout ? this.layout : '';
    // If the caller already passed a fully-qualified name (layout/partial),
    // don't prefix it again, else prefix with the current layout.
    const blockName = name.includes('/') ? name : layout ? `${layout}/${name}` : name;

    const parsed = parseBlockData(dataPath);
    // dataPath is always root-relative; resolve the manifest slice from the
    // ROOT context, not `this`. For autoblock partials `this` is already the
    // slice (or an #each item), and double-slicing would record an undefined
    // manifest entry (breaking identical-dataset diffing / I2).
    const root = (options && options.data && options.data.root) || this;
    const slice = dataPath
      ? buildBlockContext(root, parsed, (data, path) => deepGet(data, path))
      : this;
    env.getManifest()[blockName] = slice;

    const partial = Handlebars.partials[blockName];
    let inner;
    if (options.hash.autoblock) {
      // Autoblock wrapper: the raw partial body is already inline in this
      // helper's block (`options.fn`), and `this` is the current Handlebars
      // context (the sliced data or an #each item). Render it directly —
      // `partial[blockName]` IS this same wrapper, so resolving it again would
      // recurse forever.
      inner = options.fn(this);
    } else if (hasContent(slice)) {
      if (typeof partial === 'function') {
        inner = partial(slice, { data: options.data });
      } else if (typeof partial === 'string') {
        inner = Handlebars.compile(partial)(slice);
      } else {
        inner = options.fn(this);
      }
    } else {
      inner = options.fn(this);
    }

    const attrs = [
      `data-ignition-block="${escapeAttr(blockName)}"`,
      dataPath ? `data-ignition-data="${escapeAttr(dataPath)}"` : '',
      depends ? `data-ignition-depends="${escapeAttr(depends)}"` : '',
    ]
      .filter(Boolean)
      .join(' ');

    return new Handlebars.SafeString(`<div ${attrs}>${inner}</div>`);
  });
}

  // ========== state.js ==========
  function createReactiveState(initialData) {
  const listeners = new Map();
  const proxyCache = new WeakMap();
  const proxyToRaw = new WeakMap();
  let notifyDepth = 0;
  let pendingNotifications = [];
  let activeTracker = null;
  const ephemeralTimers = new Map();
  let suppressingEphemeralCancel = false;

  function doNotify(fullPath, oldVal, newVal) {
    for (const [pattern, callbacks] of listeners) {
      if (pattern === '*' || fullPath === pattern || fullPath.startsWith(pattern + '.') || pattern.startsWith(fullPath + '.')) {
        for (const cb of callbacks) {
          cb(fullPath, oldVal, newVal);
        }
      }
    }
  }

  function notify(fullPath, oldVal, newVal) {
    if (notifyDepth > 0) {
      pendingNotifications.push({ fullPath, oldVal, newVal });
      return;
    }
    notifyDepth++;
    const notified = new Set();
    doNotify(fullPath, oldVal, newVal);
    notified.add(fullPath);
    notifyDepth--;
    while (pendingNotifications.length > 0) {
      const pending = pendingNotifications.shift();
      if (notified.has(pending.fullPath)) continue;
      notified.add(pending.fullPath);
      notifyDepth++;
      doNotify(pending.fullPath, pending.oldVal, pending.newVal);
      notifyDepth--;
    }
  }

  function wrap(obj, prefix) {
    if (!obj || typeof obj !== 'object') return obj;

    const existing = proxyCache.get(obj);
    if (existing) return existing;

    const proxy = new Proxy(obj, {
      get(target, key) {
        if (activeTracker) {
          const path = prefix ? `${prefix}.${String(key)}` : String(key);
          activeTracker.add(path);
        }
        const value = target[key];
        if (value !== null && typeof value === 'object') {
          return wrap(value, prefix ? `${prefix}.${String(key)}` : String(key));
        }
        return value;
      },

      set(target, key, value) {
        const old = target[key];
        const rawOld = proxyToRaw.get(old) || old;
        const rawNew = proxyToRaw.get(value) || value;
        if (rawOld === rawNew) return true;
        target[key] = value;
        const path = prefix ? `${prefix}.${String(key)}` : String(key);
        // A permanent (non-ephemeral) assignment cancels any pending ephemeral
        // timer for this path, so a stale timer cannot null it out later.
        if (!suppressingEphemeralCancel && ephemeralTimers.has(path)) {
          clearTimeout(ephemeralTimers.get(path));
          ephemeralTimers.delete(path);
        }
        notify(path, old, value);
        return true;
      },

      deleteProperty(target, key) {
        if (!(key in target)) return true;
        const old = target[key];
        delete target[key];
        const path = prefix ? `${prefix}.${String(key)}` : String(key);
        notify(path, old, undefined);
        return true;
      }
    });

    proxyCache.set(obj, proxy);
    proxyToRaw.set(proxy, obj);
    return proxy;
  }

  const state = wrap(initialData, '');

  state.subscribe = function (path, callback) {
    if (!listeners.has(path)) {
      listeners.set(path, new Set());
    }
    listeners.get(path).add(callback);
    return () => {
      const cbs = listeners.get(path);
      if (cbs) {
        cbs.delete(callback);
        if (cbs.size === 0) listeners.delete(path);
      }
    };
  };

  state.track = function (fn) {
    const prev = activeTracker;
    activeTracker = new Set();
    fn();
    const deps = new Set(activeTracker);
    activeTracker = prev;
    return deps;
  };

  state.set = function (path, value) {
    const keys = String(path).split('.');
    let target = state;
    for (let i = 0; i < keys.length - 1; i++) {
      target = target[keys[i]];
      if (target === undefined || target === null) {
        throw new Error(`Cannot set path "${path}": "${keys[i]}" is undefined`);
      }
    }
    target[keys[keys.length - 1]] = value;
  };

  state.ephemeral = function (path, value, ttl) {
    if (ephemeralTimers.has(path)) {
      clearTimeout(ephemeralTimers.get(path));
    }
    state.set(path, value);
    const timer = setTimeout(() => {
      suppressingEphemeralCancel = true;
      try {
        state.set(path, null);
      } finally {
        suppressingEphemeralCancel = false;
      }
      ephemeralTimers.delete(path);
    }, ttl);
    ephemeralTimers.set(path, timer);
  };

  return state;
}

  // ========== render.js ==========
  const templateRegistry = new Map();
const jsonCache = new Map();

function resetRegistry() {
  templateRegistry.clear();
  jsonCache.clear();
}

function registerTemplate(name, fn) {
  templateRegistry.set(name, fn);
}

function getTemplate(name) {
  return templateRegistry.get(name);
}

function renderTemplate(name, data) {
  const fn = templateRegistry.get(name);
  if (!fn) throw new Error(`Template not found: ${name}`);
  return fn(data);
}

function hydrate(element, html) {
  const temp = document.createElement('div');
  temp.innerHTML = html;
  element.replaceChildren(...temp.childNodes);
}

const pendingFetches = new Map();

async function fetchJson(url) {
  if (jsonCache.has(url)) return jsonCache.get(url);
  if (pendingFetches.has(url)) return pendingFetches.get(url);

  const promise = fetch(url)
    .then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then(data => {
      jsonCache.set(url, data);
      pendingFetches.delete(url);
      return data;
    })
    .catch(err => {
      pendingFetches.delete(url);
      throw err;
    });

  pendingFetches.set(url, promise);
  return promise;
}

  // ========== binding.js ==========
  const boundElements = new WeakSet();
const classBoundElements = new WeakSet();
const attrBoundElements = new WeakSet();
const textBoundElements = new WeakSet();
const autoBoundElements = new WeakSet();

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

function initBinding(state, element) {
  initFormBinding(state, element);
  initClassBinding(state, element);
  initAttrBinding(state, element);
  initTextBinding(state, element);
  initAutoBinding(state, element);
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

function initBlocks(state, options = {}) {
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

    function hasAttrBinding(el) {
      return Array.from(el.attributes).some(a => a.name.startsWith('data-ignition-attr-'));
    }

    function processBlockContent(root) {
      root.querySelectorAll('[data-ignition-binding], [data-ignition-class], [data-ignition-text]').forEach(el => {
        initBinding(state, el);
      });
      root.querySelectorAll('*').forEach(el => {
        if (hasAttrBinding(el)) initBinding(state, el);
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

  // ========== computed.js ==========
  const registry = new WeakMap();
const effectStack = [];

function getRegistry(state) {
  if (!registry.has(state)) {
    registry.set(state, []);
  }
  return registry.get(state);
}

function flushDirty(state) {
  const computeds = getRegistry(state);
  let hadDirty;
  do {
    hadDirty = false;
    for (const c of computeds) {
      if (c.dirty) {
        c.recompute();
        hadDirty = true;
      }
    }
  } while (hadDirty);
}

function createComputed(state, name, fn) {
  const entry = {
    name,
    fn,
    dirty: true,
    cached: undefined,
    stateUnsubs: [],
    children: new Set(),
    parents: new Set(),
    recompute() {
      for (const unsub of entry.stateUnsubs) {
        unsub();
      }
      entry.stateUnsubs = [];

      for (const child of entry.children) {
        child.parents.delete(entry);
      }
      entry.children.clear();

      effectStack.push(entry);
      const deps = state.track(() => {
        entry.cached = fn(state);
      });
      effectStack.pop();

      for (const dep of deps) {
        entry.stateUnsubs.push(state.subscribe(dep, () => {
          entry.invalidate();
        }));
      }

      entry.dirty = false;
    },
    invalidate() {
      if (entry.dirty) return;
      entry.dirty = true;
      for (const parent of entry.parents) {
        parent.invalidate();
      }
    }
  };

  const computeds = getRegistry(state);
  computeds.push(entry);

  const getter = () => {
    const parent = effectStack[effectStack.length - 1];
    if (parent) {
      parent.children.add(entry);
      entry.parents.add(parent);
    }
    if (entry.dirty) {
      flushDirty(state);
    }
    return entry.cached;
  };

  entry.recompute();

  return getter;
}

  // ========== diff.js ==========
  function getSlice(data, path) {
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
function diffSlices(manifest, blockPaths, newDataset) {
  const changed = new Set();
  for (const name of Object.keys(manifest)) {
    const dataStr = blockPaths[name];
    const parsed = parseBlockData(dataStr);

    if (parsed.mode === 'multi') {
      const oldSlices = manifest[name] || {};
      for (const { path, alias } of parsed.paths) {
        const oldSlice = oldSlices[alias];
        const newSlice = getSlice(newDataset, path);
        if (!equal(oldSlice, newSlice)) {
          changed.add(name);
          break;
        }
      }
    } else {
      const path = parsed.paths[0]?.path;
      const oldSlice = manifest[name];
      const newSlice = path ? getSlice(newDataset, path) : newDataset;
      if (!equal(oldSlice, newSlice)) changed.add(name);
    }
  }
  return changed;
}

/**
 * Apply only the changed slices to the reactive state, per block path.
 * State subscriptions re-render exactly the affected blocks.
 */
function mergeSlices(state, changedBlockNames, blockPaths, newDataset) {
  for (const name of changedBlockNames) {
    const dataStr = blockPaths[name];
    const parsed = parseBlockData(dataStr);
    for (const { path } of parsed.paths) {
      const value = getSlice(newDataset, path);
      setByPath(state, path, value);
    }
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
async function loadDataset(state, url) {
  const dataset = await fetchJson(url);
  const manifest = readManifest();
  const blockPaths = readBlockPaths();
  const changed = diffSlices(manifest, blockPaths, dataset);
  mergeSlices(state, changed, blockPaths, dataset);
  return { changed: Array.from(changed) };
}

  // ========== Boot ==========

  // Controllers registered before the runtime boots are queued and run once the
  // reactive state is ready. This makes the auto-injected <script> controller
  // files order-independent vs. the runtime's own DOM-ready boot.
  var pendingControllers = [];

  // Expose the live runtime immediately (before DOM-ready boot). The
  // controller method gathers callbacks here; if the state already exists
  // (a controller script loaded after boot), it runs the callback at once.
  window.ignition = {
    controller: function (cb) {
      if (typeof cb !== 'function') return;
      if (typeof window.__IGNITION_STATE__ !== 'undefined' && window.__IGNITION_STATE__) {
        cb(window.__IGNITION_STATE__, (window.__IGNITION_MAKE_API__ || function () { return {}; })());
      } else {
        pendingControllers.push(cb);
      }
    }
  };

  function processAllBindings(state, root) {
    var scope = root || document;
    scope.querySelectorAll('[data-ignition-binding], [data-ignition-class], [data-ignition-text]').forEach(function (el) {
      initBinding(state, el);
    });
    scope.querySelectorAll('*').forEach(function (el) {
      var hasAttr = Array.prototype.some.call(el.attributes, function (a) {
        return a.name.indexOf('data-ignition-attr-') === 0;
      });
      if (hasAttr) initBinding(state, el);
    });
  }

  function boot() {
    if (typeof Handlebars !== 'undefined') {
      registerHelpersWith(Handlebars);
    }

    var rawTemplates = window.__IGNITION_TEMPLATES__ || {};
    Object.keys(rawTemplates).forEach(function (name) {
      var source = rawTemplates[name];
      if (typeof source === 'string') {
        var compiled = null;
        registerTemplate(name, function (data) {
          if (!compiled && typeof Handlebars !== 'undefined') {
            compiled = Handlebars.compile(source);
          }
          if (compiled) return compiled(data);
          return source;
        });
      } else if (typeof source === 'function') {
        registerTemplate(name, source);
      }
    });

    var initialData = window.__IGNITION_INITIAL_DATA__ || window.__IGNITION_MANIFEST__ || {};
    var state = createReactiveState(initialData);

    var blockOptions = { renderers: {}, sourceDeps: {}, afterHydrate: null };
    var makeApi = function () {
      return {
        computed: createComputed,
        registerTemplate: registerTemplate,
        registerHelper: function (name, fn) { Handlebars.registerHelper(name, fn); },
        loadDataset: function (url) { return loadDataset(state, url); },
        blockOptions: blockOptions
      };
    };

    initBlocks(state, blockOptions);

    processAllBindings(state);

    window.__IGNITION_STATE__ = state;
    window.__IGNITION_MAKE_API__ = makeApi;

    // Expose the live runtime so pagination and other client controllers
    // reuse the SAME template registry, helpers and reactive state.
    window.ignition = {
      state: state,
      set: function (path, value) { state.set(path, value); },
      ephemeral: function (path, value, ttl) { state.ephemeral(path, value, ttl); },
      registerTemplate: registerTemplate,
      getTemplate: getTemplate,
      renderTemplate: renderTemplate,
      fetchJson: fetchJson,
      hydrate: hydrate,
      computed: createComputed,
      // The controller is the external "who changes the model". Register it,
      // and it runs as soon as the reactive state is ready.
      controller: function (cb) {
        if (typeof cb !== 'function') return;
        cb(state, makeApi());
      }
    };

    // Replay controllers that were queued while the runtime was still booting.
    pendingControllers.forEach(function (cb) { cb(state, makeApi()); });
    pendingControllers = [];
  }

  // Auto-boot
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();
