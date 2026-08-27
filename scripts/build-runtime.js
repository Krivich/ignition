import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
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
  function processAllBindings(state, root) {
    var scope = root || document;
    scope.querySelectorAll('[data-ignition-binding], [data-ignition-class]').forEach(function (el) {
      initBinding(state, el);
    });
    scope.querySelectorAll('*').forEach(function (el) {
      var hasAttr = Array.prototype.some.call(el.attributes, function (a) {
        return a.name.indexOf('data-ignition-attr-') === 0;
      });
      if (hasAttr) initBinding(state, el);
    });
  }

  function processAllEventHandlers(state, root) {
    var elements = (root || document).querySelectorAll('[data-ignition-on]');
    elements.forEach(function (el) { processEventHandlers(state, el); });
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
    if (typeof window.__IGNITION_PAGE_CONFIG__ === 'function') {
      window.__IGNITION_PAGE_CONFIG__(state, {
        computed: createComputed,
        action: function (name, fn) { registerAction(name, fn); },
        registerTemplate: registerTemplate,
        registerHelper: function (name, fn) { Handlebars.registerHelper(name, fn); },
        loadDataset: function (url) { return loadDataset(state, url); },
        blockOptions: blockOptions
      });
    }

    initBlocks(state, blockOptions);

    processAllBindings(state);
    processAllEventHandlers(state);

    window.__IGNITION_STATE__ = state;

    // Expose the live runtime so pagination and other client controllers
    // reuse the SAME template registry, helpers and reactive state.
    window.ignition = {
      state: state,
      registerTemplate: registerTemplate,
      getTemplate: getTemplate,
      renderTemplate: renderTemplate,
      fetchJson: fetchJson,
      hydrate: hydrate,
      computed: createComputed,
      action: registerAction
    };
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
