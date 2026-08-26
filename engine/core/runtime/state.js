export function createReactiveState(initialData) {
  const listeners = new Map();
  const proxyCache = new WeakMap();
  const proxyToRaw = new WeakMap();
  let notifyDepth = 0;
  let pendingNotifications = [];

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

  return state;
}
