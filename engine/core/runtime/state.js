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
  let notifyDepth = 0;
  let pendingNotifications = [];
  let activeTracker = null;
  const ephemeralTimers = new Map();
  let suppressingEphemeralCancel = false;

  function fireCallbacks(node, fullPath, oldVal, newVal) {
    for (const cb of node.callbacks) {
      cb(fullPath, oldVal, newVal);
    }
  }

  // Walk the affected branch: fire ancestors + self (root handles '*').
  function doNotify(fullPath, oldVal, newVal) {
    fireCallbacks(rootTrie, fullPath, oldVal, newVal);
    let node = rootTrie;
    const segs = pathSegments(fullPath);
    for (let i = 0; i < segs.length; i++) {
      node = node.children.get(segs[i]);
      if (!node) break;
      fireCallbacks(node, fullPath, oldVal, newVal);
    }
    // Descendants: if the mutated node exists, fire every callback in its
    // subtree (a parent/whole-slice replacement notifies child listeners).
    if (node) notifySubtree(node, fullPath, oldVal, newVal);
  }

  function notifySubtree(node, fullPath, oldVal, newVal) {
    for (const child of node.children.values()) {
      fireCallbacks(child, fullPath, oldVal, newVal);
      notifySubtree(child, fullPath, oldVal, newVal);
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
