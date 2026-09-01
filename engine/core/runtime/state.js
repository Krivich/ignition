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

export function createReactiveState(initialData) {
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
