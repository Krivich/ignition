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

  // ========== Prototype pollution guard (shared by helpers, binding, diff) ==========
  var DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

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
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
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
    const str = JSON.stringify(context)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return new Handlebars.SafeString(str);
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
    // Fine coverage comes from an explicit `fine` hash param (autoblock
    // wrapper) or from the partial's registration record (explicit
    // {{#block}} calls that resolve the partial by name).
    const layout = this && this.layout ? this.layout : '';
    // If the caller already passed a fully-qualified name (layout/partial),
    // don't prefix it again, else prefix with the current layout.
    const blockName = name.includes('/') ? name : layout ? `${layout}/${name}` : name;
    const fineCoverageSet = fineCoverage.get(blockName);
    const fine = options.hash.fine ?? (fineCoverageSet ? [...fineCoverageSet].join(', ') : undefined);
    // Root branch signals from the partial's registration record (e.g.
    // `metrics.loading` from {{#if metrics.loading}}) join the block's depends:
    // a flag the whole widget branches on must re-render the block when it
    // flips, independently of the data paths it renders.
    const signals = blockSignals.get(blockName);
    let dependsAttr = depends;
    if (signals && signals.length) {
      const list = String(depends || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      for (const s of signals) {
        if (!list.includes(s)) list.push(s);
      }
      dependsAttr = list.join(', ');
    }

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
      dependsAttr ? `data-ignition-depends="${escapeAttr(dependsAttr)}"` : '',
      fine ? `data-ignition-fine="${escapeAttr(fine)}"` : '',
    ]
      .filter(Boolean)
      .join(' ');

    return new Handlebars.SafeString(`<div ${attrs}>${inner}</div>`);
  });
}

  // ========== state.js ==========
  // Minimal prefix trie over listener paths. Each node holds the callbacks
// subscribed to its exact path. A mutation walks only the affected branch:
//  - firing the ancestors/self on the way down (a change in `a.b` notifies a
//    listener on `a` and on `a`), and
//  - then DFS-ing the changed node's subtree (replacing `a` notifies listeners
//    on `a.x`, `a.y`, ...).
// This replaces a full linear scan over every listener on each mutation.
function createTrieNode() {
  return { children: new Map(), callbacks: new Set() };
}

function pathSegments(path) {
  if (path === '*') return [];
  return String(path).split('.');
}

function createReactiveState(initialData) {
  const rootTrie = createTrieNode();
  const proxyCache = new WeakMap();
  const proxyToRaw = new WeakMap();
  const coalesced = [];
  let scheduledFlush = false;
  let activeTracker = null;
  const ephemeralTimers = new Map();
  let suppressingEphemeralCancel = false;

  // Changes are classified so blocks can skip re-renders on pure value edits:
  //  - 'leaf'       — a primitive written over an existing slot (a cell patch;
  //                   row-scoped @p stickers handle it),
  //  - 'structural' — a subtree replaced (object/array value), an array
  //                   resized (length or a growing index) or a key deleted.
  function classifyChange(target, key, value) {
    if (value !== null && typeof value === 'object') return 'structural';
    if (Array.isArray(target)) {
      if (key === 'length') return 'structural';
      if (typeof key === 'string' && /^\d+$/.test(key) && Number(key) >= target.length) return 'structural';
    }
    return 'leaf';
  }

  function fireCallbacks(node, fullPath, oldVal, newVal, kind) {
    for (const cb of node.callbacks) {
      cb(fullPath, oldVal, newVal, kind);
    }
  }

  // Walk the affected branch: fire ancestors + self (root handles '*').
  function doNotify(fullPath, oldVal, newVal, kind) {
    fireCallbacks(rootTrie, fullPath, oldVal, newVal, kind);
    let node = rootTrie;
    const segs = pathSegments(fullPath);
    for (let i = 0; i < segs.length; i++) {
      node = node.children.get(segs[i]);
      if (!node) break;
      fireCallbacks(node, fullPath, oldVal, newVal, kind);
    }
    // Descendants: if the mutated node exists, fire every callback in its
    // subtree (a parent/whole-slice replacement notifies child listeners).
    if (node) notifySubtree(node, fullPath, oldVal, newVal, kind);
  }

  function notifySubtree(node, fullPath, oldVal, newVal, kind) {
    for (const child of node.children.values()) {
      fireCallbacks(child, fullPath, oldVal, newVal, kind);
      notifySubtree(child, fullPath, oldVal, newVal, kind);
    }
  }

  // Notifications are coalesced: mutations inside a single task are drained in
  // ONE pass (on the next microtask, or on an explicit flush()). Identical
  // paths written several times collapse to a single notification with the
  // first old value and the last new value — the DOM is patched once, not five
  // times, for a burst like `price = 5; price = 6; price = 7`.
  function queueNotify(fullPath, oldVal, newVal, kind) {
    coalesced.push({ fullPath, oldVal, newVal, kind });
    if (!scheduledFlush) {
      scheduledFlush = true;
      queueMicrotask(drain);
    }
  }

  function drain() {
    scheduledFlush = false;
    // A single flush, like the old single notify round: a path that already
    // dispatched once in THIS drain is skipped afterwards, so a subscriber
    // writing the same path back does not cascade into an unbounded loop
    // (the raw value is already applied; re-notification is what is bounded).
    const seen = new Set();
    let guard = 0;
    while (coalesced.length > 0 && guard++ < 1e6) {
      const batch = coalesced.splice(0);
      // Head-of-burst collapse: identical paths written several times in one
      // task fire ONCE, keeping the first old value and the last new value.
      const merged = new Map();
      for (const m of batch) {
        const prev = merged.get(m.fullPath);
        if (prev) {
          prev.newVal = m.newVal;
          prev.kind = m.kind;
        } else {
          merged.set(m.fullPath, m);
        }
      }
      for (const m of merged.values()) {
        if (seen.has(m.fullPath)) continue;
        seen.add(m.fullPath);
        doNotify(m.fullPath, m.oldVal, m.newVal, m.kind);
      }
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
        const kind = classifyChange(target, key, value);
        // A permanent (non-ephemeral) assignment cancels any pending ephemeral
        // timer for this path, so a stale timer cannot null it out later.
        if (!suppressingEphemeralCancel && ephemeralTimers.has(path)) {
          clearTimeout(ephemeralTimers.get(path));
          ephemeralTimers.delete(path);
        }
        queueNotify(path, old, value, kind);
        return true;
      },

      deleteProperty(target, key) {
        if (!(key in target)) return true;
        const old = target[key];
        delete target[key];
        const path = prefix ? `${prefix}.${String(key)}` : String(key);
        queueNotify(path, old, undefined, 'structural');
        return true;
      }
    });

    proxyCache.set(obj, proxy);
    proxyToRaw.set(proxy, obj);
    return proxy;
  }

  const state = wrap(initialData, '');

  state.subscribe = function (path, callback) {
    const segs = pathSegments(path);
    let node = rootTrie;
    for (const seg of segs) {
      let child = node.children.get(seg);
      if (!child) {
        child = createTrieNode();
        node.children.set(seg, child);
      }
      node = child;
    }
    node.callbacks.add(callback);
    return () => {
      node.callbacks.delete(callback);
      // Drop empty branches to keep the trie lean.
      if (node.callbacks.size === 0) {
        let parent = rootTrie;
        for (let i = 0; i < segs.length; i++) {
          const child = parent.children.get(segs[i]);
          if (child && child.callbacks.size === 0 && child.children.size === 0) {
            parent.children.delete(segs[i]);
          }
          parent = child || parent;
        }
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

  state.flush = function () {
    drain();
  };

  state.set = function (path, value) {
    const keys = String(path).split('.');
    if (keys.some(k => k === '__proto__' || k === 'constructor' || k === 'prototype')) {
      throw new Error(`Refusing to set prototype-polluting path: ${path}`);
    }
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
  // Order-preserving reconcile: reuse existing element/text nodes whose
  // structure is unchanged (typical in-place list/cell edits), so we avoid
  // tearing down + rebuilding rows (and re-binding them) on every re-render.
  // Any structural or attribute divergence falls back to swapping in the
  // freshly parsed node, keeping the resulting DOM identical to the naive
  // replaceChildren swap. Node-identity (and with it focus, input state and
  // existing bindings) is preserved for stable rows.
  const focused = document.activeElement;
  const focusedSel = focused && focused.nodeType === 1
    ? { start: focused.selectionStart, end: focused.selectionEnd }
    : null;
  reconcileChildren(element, Array.from(element.childNodes), Array.from(temp.childNodes));
  // Structural moves (keyed insert/delete/reorder) can make the browser blur
  // the element that held focus even though its node identity survives. After
  // the reconcile, re-focus the same element and restore its selection, so an
  // input the user is editing keeps focus + caret across a structural add.
  if (focused && focused.nodeType === 1 && focused.isConnected) {
    const tag = focused.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') {
      focused.focus();
      if (focusedSel && typeof focused.setSelectionRange === 'function') {
        focused.setSelectionRange(focusedSel.start, focusedSel.end);
      }
    } else {
      focused.focus();
    }
  }
}

// Reuse a node only when attributes match exactly (name+value+order), so an
// in-place patch serializes identically to a fresh re-parse of the new markup.
function attributesCompatible(a, b) {
  const aa = a.attributes;
  const ba = b.attributes;
  if (aa.length !== ba.length) return false;
  for (let i = 0; i < aa.length; i++) {
    if (aa[i].name !== ba[i].name || aa[i].value !== ba[i].value) return false;
  }
  return true;
}

// A node is "keyed" only when it carries a NON-EMPTY data-ignition-key. Empty
// keys (a row item lacks the keyed field) degrade gracefully: such rows are
// matched positionally as in the plain order-preserving reconcile, so several
// missing-key rows can never collide on the same Map slot.
function isKeyed(node) {
  return node.nodeType === 1 && !!(node.getAttribute('data-ignition-key') || '');
}

function reconcileChildren(parent, oldChildren, newChildren) {
  // Keyed mode: when the new children carry data-ignition-key rows, match old
  // rows by key so insert/delete/reorder reuse the same DOM nodes (preserving
  // node identity — and with it focus, scroll and bindings). This is the same
  // stable row identity mechanism fine-grained reactivity will build on.
  for (let i = 0; i < newChildren.length; i++) {
    if (isKeyed(newChildren[i])) {
      reconcileKeyed(parent, oldChildren, newChildren);
      return;
    }
  }
  reconcileOrdered(parent, oldChildren, newChildren);
}

function reconcileKeyed(parent, oldChildren, newChildren) {
  const byKey = new Map();
  const unkeyedOld = [];
  for (const oldN of oldChildren) {
    // Only ELEMENT rows are candidates for positional reuse: text/whitespace
    // nodes have no attributes/children to sync and never carry a row key.
    if (isKeyed(oldN)) byKey.set(oldN.getAttribute('data-ignition-key'), oldN);
    else if (oldN.nodeType === 1) unkeyedOld.push(oldN);
  }
  const used = new Set();
  for (let i = 0; i < newChildren.length; i++) {
    const newN = newChildren[i];
    if (newN.nodeType !== 1) {
      // text/whitespace node: nothing to match or sync — just place it
      parent.appendChild(newN);
      continue;
    }
    const k = isKeyed(newN) ? newN.getAttribute('data-ignition-key') : null;
    if (k !== null) {
      const oldN = byKey.get(k);
      if (oldN && !used.has(oldN)) {
        used.add(oldN);
        parent.appendChild(oldN); // move to correct position (reorder)
        syncKeyedNode(oldN, newN);
        continue;
      }
    } else if (unkeyedOld.length) {
      // unkeyed new element: reuse the next unkeyed old element positionally,
      // so a row missing its key field keeps its identity without colliding
      // on the empty key.
      const u = unkeyedOld.shift();
      if (u && u.parentNode === parent && !used.has(u)) {
        used.add(u);
        parent.appendChild(u);
        syncKeyedNode(u, newN);
        continue;
      }
    }
    // no reusable match → insert the fresh node
    parent.appendChild(newN);
  }
  // drop every old child that was not reused (deleted rows + unkeyed stragglers)
  for (const oldN of oldChildren) {
    if (!used.has(oldN) && oldN.parentNode === parent) parent.removeChild(oldN);
  }
}

// Reuse an element whose identity we want to keep (focus/scroll/bindings) by
// making it match the freshly parsed node exactly: attributes copied in the new
// node's order + children reconciled, so serialization stays identical too.
function syncKeyedNode(oldN, newN) {
  const oldAttrs = Array.from(oldN.attributes);
  for (let i = 0; i < oldAttrs.length; i++) oldN.removeAttribute(oldAttrs[i].name);
  const newAttrs = Array.from(newN.attributes);
  for (let i = 0; i < newAttrs.length; i++) oldN.setAttribute(newAttrs[i].name, newAttrs[i].value);
  reconcileChildren(oldN, Array.from(oldN.childNodes), Array.from(newN.childNodes));
}

// Structural equivalence WITHOUT serialization: jsdom's outerHTML getter is
// disproportionately expensive (fresh serializer + full subtree walk per
// call), so identity is decided by attribute/child-structure recursion on the
// cheap accessors instead.
function nodesEquivalent(a, b) {
  if (a.nodeType !== b.nodeType || a.nodeName !== b.nodeName) return false;
  if (a.nodeType === 3) return a.nodeValue === b.nodeValue;
  if (!attributesCompatible(a, b)) return false;
  const ac = a.childNodes;
  const bc = b.childNodes;
  if (ac.length !== bc.length) return false;
  for (let i = 0; i < ac.length; i++) {
    if (!nodesEquivalent(ac[i], bc[i])) return false;
  }
  return true;
}

function reconcileOrdered(parent, oldChildren, newChildren) {
  const min = Math.min(oldChildren.length, newChildren.length);
  let prefix = 0;
  while (prefix < min && nodesEquivalent(oldChildren[prefix], newChildren[prefix])) prefix++;
  if (prefix === oldChildren.length && prefix === newChildren.length) return;
  if (prefix === oldChildren.length) {
    parent.append(...newChildren.slice(prefix));
    return;
  }
  if (prefix === newChildren.length) {
    parent.replaceChildren(...newChildren);
    return;
  }
  const max = Math.max(oldChildren.length, newChildren.length);
  for (let i = 0; i < max; i++) {
    const oldN = oldChildren[i];
    const newN = newChildren[i];
    if (oldN && !newN) {
      parent.removeChild(oldN);
      continue;
    }
    if (!oldN && newN) {
      parent.appendChild(newN);
      continue;
    }
    if (oldN.nodeType !== newN.nodeType || oldN.nodeName !== newN.nodeName) {
      parent.replaceChild(newN, oldN);
      continue;
    }
    if (oldN.nodeType === 3) {
      if (oldN.nodeValue !== newN.nodeValue) oldN.nodeValue = newN.nodeValue;
    } else if (nodesEquivalent(oldN, newN)) {
      // identical subtree → leave untouched (keeps bindings + focus).
    } else if (attributesCompatible(oldN, newN)) {
      reconcileChildren(oldN, Array.from(oldN.childNodes), Array.from(newN.childNodes));
    } else {
      parent.replaceChild(newN, oldN);
    }
  }
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
const eachBoundElements = new WeakMap();



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

function initBinding(state, element) {
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
function findBoundElements(root) {
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
function rescopeEachBindings(root) {
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
    // Coalesced mutations only invalidate computed entries on flush. A read
    // must not return a stale cache, so drain pending notifications first.
    if (typeof state.flush === 'function') state.flush();
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

// Semantic deep-equality. Unlike JSON.stringify comparison this short-circuits
// on the first difference (so unchanged rows cost O(1) lookups at the top) and
// is insensitive to object key order — substantially cheaper on large slices.
function equal(a, b) {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return false;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  const aIsArray = Array.isArray(a);
  const bIsArray = Array.isArray(b);
  if (aIsArray !== bIsArray) return false;
  if (aIsArray) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!equal(a[i], b[i])) return false;
    }
    return true;
  }
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (let i = 0; i < aKeys.length; i++) {
    const key = aKeys[i];
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!equal(a[key], b[key])) return false;
  }
  return true;
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
    var bound = findBoundElements(scope);
    for (var i = 0; i < bound.length; i++) {
      initBinding(state, bound[i]);
    }
  }

  function boot() {
    if (typeof Handlebars !== 'undefined') {
      registerHelpersWith(Handlebars);
    }

    var rawTemplates = window.__IGNITION_TEMPLATES__ || {};
    Object.keys(rawTemplates).forEach(function (name) {
      var source = rawTemplates[name];
      if (typeof source === 'string') {
        // Register as a Handlebars partial too: template sources may nest
        // {{> other/template}} calls, and those resolve through the global
        // Handlebars partial registry, not ignition's own template map.
        if (typeof Handlebars !== 'undefined') {
          Handlebars.registerPartial(name, source);
        }
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
