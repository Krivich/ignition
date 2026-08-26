(function() {
  'use strict';

  // ========== state.js ==========
  function createReactiveState(initialData) {
    var listeners = new Map();
    var proxyCache = new WeakMap();
    var proxyToRaw = new WeakMap();
    var notifyDepth = 0;
    var pendingNotifications = [];

    function doNotify(fullPath, oldVal, newVal) {
      var _iteratorNormalCompletion = true, _didIteratorError = false, _iteratorError = undefined;
      try {
        for (var _iterator = listeners[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
          var entry = _step.value;
          var pattern = entry[0], callbacks = entry[1];
          if (pattern === '*' || fullPath === pattern || fullPath.startsWith(pattern + '.') || pattern.startsWith(fullPath + '.')) {
            var _iteratorNormalCompletion2 = true, _didIteratorError2 = false, _iteratorError2 = undefined;
            try {
              for (var _iterator2 = callbacks[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
                var cb = _step2.value;
                cb(fullPath, oldVal, newVal);
              }
            } catch (err) { _didIteratorError2 = true; _iteratorError2 = err; }
            finally { try { if (!_iteratorNormalCompletion2 && _iterator2.return) { _iterator2.return(); } } finally { if (_didIteratorError2) { throw _iteratorError2; } } }
          }
        }
      } catch (err) { _didIteratorError = true; _iteratorError = err; }
      finally { try { if (!_iteratorNormalCompletion && _iterator.return) { _iterator.return(); } } finally { if (_didIteratorError) { throw _iteratorError; } } }
    }

    function notify(fullPath, oldVal, newVal) {
      if (notifyDepth > 0) {
        pendingNotifications.push({ fullPath: fullPath, oldVal: oldVal, newVal: newVal });
        return;
      }
      notifyDepth++;
      var notified = {};
      doNotify(fullPath, oldVal, newVal);
      notified[fullPath] = true;
      notifyDepth--;
      while (pendingNotifications.length > 0) {
        var pending = pendingNotifications.shift();
        if (notified[pending.fullPath]) continue;
        notified[pending.fullPath] = true;
        notifyDepth++;
        doNotify(pending.fullPath, pending.oldVal, pending.newVal);
        notifyDepth--;
      }
    }

    function wrap(obj, prefix) {
      if (!obj || typeof obj !== 'object') return obj;
      var existing = proxyCache.get(obj);
      if (existing) return existing;

      var proxy = new Proxy(obj, {
        get: function(target, key) {
          var value = target[key];
          if (value !== null && typeof value === 'object') {
            return wrap(value, prefix ? prefix + '.' + String(key) : String(key));
          }
          return value;
        },
        set: function(target, key, value) {
          var old = target[key];
          var rawOld = proxyToRaw.get(old) || old;
          var rawNew = proxyToRaw.get(value) || value;
          if (rawOld === rawNew) return true;
          target[key] = value;
          var path = prefix ? prefix + '.' + String(key) : String(key);
          notify(path, old, value);
          return true;
        },
        deleteProperty: function(target, key) {
          if (!(key in target)) return true;
          var old = target[key];
          delete target[key];
          var path = prefix ? prefix + '.' + String(key) : String(key);
          notify(path, old, undefined);
          return true;
        }
      });

      proxyCache.set(obj, proxy);
      proxyToRaw.set(proxy, obj);
      return proxy;
    }

    var state = wrap(initialData, '');

    state.subscribe = function(path, callback) {
      if (!listeners.has(path)) {
        listeners.set(path, new Set());
      }
      listeners.get(path).add(callback);
      return function() {
        var cbs = listeners.get(path);
        if (cbs) {
          cbs.delete(callback);
          if (cbs.size === 0) listeners.delete(path);
        }
      };
    };

    return state;
  }

  // ========== computed.js ==========
  var computedRegistry = new WeakMap();

  function getComputedRegistry(state) {
    if (!computedRegistry.has(state)) {
      computedRegistry.set(state, []);
    }
    return computedRegistry.get(state);
  }

  function flushDirty(state) {
    var computeds = getComputedRegistry(state);
    for (var i = 0; i < computeds.length; i++) {
      if (computeds[i].dirty) {
        computeds[i].recompute();
      }
    }
  }

  function createComputed(state, name, fn) {
    var entry = {
      name: name,
      fn: fn,
      dirty: true,
      cached: undefined,
      recompute: function() {
        entry.cached = fn(state);
        entry.dirty = false;
      }
    };

    var computeds = getComputedRegistry(state);
    computeds.push(entry);

    var getter = function() {
      if (entry.dirty) {
        flushDirty(state);
      }
      return entry.cached;
    };

    state.subscribe('*', function() {
      entry.dirty = true;
    });

    entry.recompute();
    return getter;
  }

  // ========== render.js ==========
  var templateRegistry = new Map();
  var jsonCache = new Map();
  var pendingFetches = new Map();

  function registerTemplate(name, fn) {
    templateRegistry.set(name, fn);
  }

  function getTemplate(name) {
    return templateRegistry.get(name);
  }

  function renderTemplate(name, data) {
    var fn = templateRegistry.get(name);
    if (!fn) throw new Error('Template not found: ' + name);
    return fn(data);
  }

  function hydrate(element, html) {
    var temp = document.createElement('div');
    temp.innerHTML = html;
    element.replaceChildren.apply(element, temp.childNodes);
  }

  function fetchJson(url) {
    if (jsonCache.has(url)) return Promise.resolve(jsonCache.get(url));
    if (pendingFetches.has(url)) return pendingFetches.get(url);

    var promise = fetch(url)
      .then(function(response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      })
      .then(function(data) {
        jsonCache.set(url, data);
        pendingFetches.delete(url);
        return data;
      })
      .catch(function(err) {
        pendingFetches.delete(url);
        throw err;
      });

    pendingFetches.set(url, promise);
    return promise;
  }

  // ========== binding.js ==========
  var actionRegistry = new Map();

  function setByPath(obj, path, value) {
    var keys = path.split('.');
    var current = obj;
    for (var i = 0; i < keys.length - 1; i++) {
      if (current[keys[i]] === undefined) current[keys[i]] = {};
      current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = value;
  }

  function getByPath(obj, path) {
    return path.split('.').reduce(function(cur, key) { return cur && cur[key]; }, obj);
  }

  function parseArgs(argsStr) {
    if (!argsStr || !argsStr.trim()) return [];
    return argsStr.split(',').map(function(arg) {
      var trimmed = arg.trim();
      if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
      if ((trimmed.startsWith("'") && trimmed.endsWith("'")) ||
          (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
        return trimmed.slice(1, -1);
      }
      return trimmed;
    });
  }

  function registerAction(name, fn) {
    actionRegistry.set(name, fn);
  }

  function initBinding(state, element) {
    if (element.dataset.ignitionBound) return;
    var path = element.getAttribute('data-ignition-binding');
    if (!path) return;

    element.dataset.ignitionBound = '1';
    var tag = element.tagName.toLowerCase();
    var eventType = tag === 'select' ? 'change' : 'input';

    element.addEventListener(eventType, function() {
      setByPath(state, path, element.value);
    });

    state.subscribe(path, function() {
      var val = getByPath(state, path);
      if (element.value !== val) {
        element.value = val != null ? val : '';
      }
    });

    var initial = getByPath(state, path);
    if (initial !== undefined && element.value !== initial) {
      element.value = initial;
    }
  }

  function processEventHandlers(state, element) {
    if (element.dataset.ignitionHandled) return;
    var attr = element.getAttribute('data-ignition-on');
    if (!attr) return;

    var match = attr.match(/^(\w+)\s*→\s*(\w+)(?:\s*\(([^)]*)\))?$/);
    if (!match) return;

    element.dataset.ignitionHandled = '1';
    var eventName = match[1];
    var actionName = match[2];
    var argsStr = match[3];
    var args = parseArgs(argsStr);

    element.addEventListener(eventName, function(e) {
      if (eventName === 'submit') e.preventDefault();
      var handler = actionRegistry.get(actionName);
      if (handler) handler(state, ...args, e);
    });
  }

  function processAllEventHandlers(state, root) {
    var elements = (root || document).querySelectorAll('[data-ignition-on]');
    elements.forEach(function(el) { processEventHandlers(state, el); });
  }

  function processAllBindings(state, root) {
    var elements = (root || document).querySelectorAll('[data-ignition-binding]');
    elements.forEach(function(el) { initBinding(state, el); });
  }

  function initBlocks(state, options) {
    var opts = options || {};
    var renderers = opts.renderers || {};
    var sourceDeps = opts.sourceDeps || {};
    var afterHydrate = opts.afterHydrate || null;
    var blocks = document.querySelectorAll('[data-ignition-block]');
    blocks.forEach(function(block) {
      var templateName = block.getAttribute('data-ignition-block');
      var dependsStr = block.getAttribute('data-ignition-depends') || '';
      var depends = dependsStr.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
      var extraDeps = sourceDeps[templateName] || [];
      var allDeps = depends.concat(extraDeps);
      var customRenderer = renderers[templateName] || null;

      function render() {
        try {
          var data = customRenderer ? customRenderer(state) : state;
          var html = renderTemplate(templateName, data);
          hydrate(block, html);
          processAllBindings(state, block);
          processAllEventHandlers(state, block);
          if (afterHydrate) afterHydrate(block, html);
        } catch (err) {
          console.error('[ignition] Block render error: ' + templateName, err);
        }
      }

      render();

      allDeps.forEach(function(dep) {
        state.subscribe(dep, function() { render(); });
      });
    });
  }

  // ========== Boot ==========
  function boot() {
    // Register core Handlebars helpers (same as server-side in handlebars.js)
    if (typeof Handlebars !== 'undefined') {
      Handlebars.registerHelper('times', function(n, block) {
        var accum = '';
        for (var i = 1; i <= n; ++i) { accum += block.fn(i); }
        return accum;
      });

      Handlebars.registerHelper('ifCond', function(v1, operator, v2, options) {
        switch (operator) {
          case '==':  return (v1 == v2) ? options.fn(this) : options.inverse(this);
          case '===': return (v1 === v2) ? options.fn(this) : options.inverse(this);
          case '!=':  return (v1 != v2) ? options.fn(this) : options.inverse(this);
          case '!==': return (v1 !== v2) ? options.fn(this) : options.inverse(this);
          case '<':   return (v1 < v2) ? options.fn(this) : options.inverse(this);
          case '<=':  return (v1 <= v2) ? options.fn(this) : options.inverse(this);
          case '>':   return (v1 > v2) ? options.fn(this) : options.inverse(this);
          case '>=':  return (v1 >= v2) ? options.fn(this) : options.inverse(this);
          case '&&':  return (v1 && v2) ? options.fn(this) : options.inverse(this);
          case '||':  return (v1 || v2) ? options.fn(this) : options.inverse(this);
          default:    return options.inverse(this);
        }
      });

      Handlebars.registerHelper('get', function(obj, path) {
        return path.split('.').reduce(function(cur, key) { return cur && cur[key]; }, obj);
      });

      Handlebars.registerHelper('concat', function() {
        return Array.prototype.slice.call(arguments, 0, -1).join('');
      });

      Handlebars.registerHelper('declineWord', function(count, one, two, five) {
        count = Math.abs(count) % 100;
        var n1 = count % 10;
        if (count > 10 && count < 20) return five;
        if (n1 > 1 && n1 < 5) return two;
        if (n1 === 1) return one;
        return five;
      });

      Handlebars.registerHelper('json', function(context) {
        return new Handlebars.SafeString(JSON.stringify(context));
      });
    }

    var rawTemplates = window.__IGNITION_TEMPLATES__ || {};
    Object.keys(rawTemplates).forEach(function(name) {
      var source = rawTemplates[name];
      if (typeof source === 'string') {
        var compiled = null;
        registerTemplate(name, function(data) {
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

    var initialData = window.__IGNITION_INITIAL_DATA__ || {};
    var state = createReactiveState(initialData);

    var blockOptions = { renderers: {}, sourceDeps: {}, afterHydrate: null };
    if (typeof window.__IGNITION_PAGE_CONFIG__ === 'function') {
      window.__IGNITION_PAGE_CONFIG__(state, {
        computed: createComputed,
        action: function(name, fn) { registerAction(name, fn); },
        registerTemplate: registerTemplate,
        registerHelper: function(name, fn) { Handlebars.registerHelper(name, fn); },
        blockOptions: blockOptions
      });
    }

    initBlocks(state, blockOptions);

    processAllBindings(state);
    processAllEventHandlers(state);

    window.__IGNITION_STATE__ = state;
  }

  // Auto-boot
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // Expose API for page configs
  window.ignition = {
    computed: createComputed,
    action: registerAction,
    registerTemplate: registerTemplate
  };

})();
