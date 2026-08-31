import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// engine/scripts/ -> project root (engine is the sibling of scripts/ inside ROOT)
const ROOT = path.resolve(__dirname, '..', '..');
const RUNTIME_DIR = path.join(ROOT, 'engine', 'core', 'runtime');
const OUTPUT = path.join(ROOT, 'engine', 'core', 'assets', 'ignition-runtime.js');

/**
 * Inline a source module: strip ESM import/export lines so it can live inside
 * a single IIFE scope. Declarations become IIFE-scoped, which mirrors how the
 * modules already refer to each other's top-level names.
 */
function inlineSource(filePath) {
  let src = fs.readFileSync(filePath, 'utf8');
  src = src.replace(/^import .*$/gm, '');
  src = src.replace(/^export /gm, '');
  // Strip const declarations that will be provided once at the top of the IIFE
  src = src.replace(/^const DANGEROUS_KEYS = new Set\(.*\);.*$/gm, '');
  return src.trim();
}

function build() {
  const parts = [];

  parts.push(`(function () {
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
  ${inlineSource(path.join(ROOT, 'engine', 'utils', 'parseBlockData.js'))}

  // ========== helpers.js (canonical, single source) ==========
  ${inlineSource(path.join(ROOT, 'engine', 'core', 'helpers.js'))}

  // ========== state.js ==========
  ${inlineSource(path.join(RUNTIME_DIR, 'state.js'))}

  // ========== render.js ==========
  ${inlineSource(path.join(RUNTIME_DIR, 'render.js'))}

  // ========== binding.js ==========
  ${inlineSource(path.join(RUNTIME_DIR, 'binding.js'))}

  // ========== computed.js ==========
  ${inlineSource(path.join(RUNTIME_DIR, 'computed.js'))}

  // ========== diff.js ==========
  ${inlineSource(path.join(RUNTIME_DIR, 'diff.js'))}

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
`);

  fs.writeFileSync(OUTPUT, parts.join(''), 'utf8');
  console.log(`Generated ${OUTPUT}`);
}

build();
