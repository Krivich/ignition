/**
 * Shared helpers for Ignition reactivity requirement tests.
 *
 * These helpers simulate the server-side rendered HTML that Ignition should
 * produce, so that client-side runtime tests can verify hydration behavior.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Handlebars from 'handlebars';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const OUTPUT_PUBLIC = path.join(PROJECT_ROOT, 'output', 'public');

/**
 * Read a built HTML file from output/public/
 */
export function readBuiltHTML(relativePath) {
  return fs.readFileSync(path.join(OUTPUT_PUBLIC, relativePath), 'utf8');
}

/**
 * Load the Ignition runtime script as a string (for injection into jsdom)
 */
export function loadRuntimeScript() {
  return fs.readFileSync(
    path.join(OUTPUT_PUBLIC, 'assets', 'ignition-runtime.js'),
    'utf8'
  );
}

/**
 * Load the templates script as a string
 */
export function loadTemplatesScript() {
  return fs.readFileSync(
    path.join(OUTPUT_PUBLIC, 'assets', 'templates.js'),
    'utf8'
  );
}

/**
 * Create a minimal server-rendered page in jsdom with reactive blocks.
 *
 * @param {Object} options
 * @param {string} options.blockName - Block template name
 * @param {string} options.blockContent - Server-rendered HTML inside the block
 * @param {string} options.depends - Comma-separated dependency paths
 * @param {string} [options.dataPath] - data-ignition-data value (for A5)
 * @param {Object} [options.initialData] - State data
 * @param {string} [options.templateSource] - Handlebars template source
 */
export function createServerPage({
  blockName = 'test/block',
  blockContent = '<p>server rendered</p>',
  depends = '',
  dataPath = '',
  initialData = {},
  templateSource = null,
} = {}) {
  const dataAttr = dataPath ? ` data-ignition-data="${dataPath}"` : '';
  const dependsAttr = depends ? ` data-ignition-depends="${depends}"` : '';

  document.documentElement.innerHTML = `
    <head></head>
    <body>
      <div id="app">
        <div data-ignition-block="${blockName}"${dependsAttr}${dataAttr}>
          ${blockContent}
        </div>
      </div>
    </body>
  `;

  // Set initial data and templates (don't overwrite templates if already loaded)
  window.__IGNITION_INITIAL_DATA__ = initialData;
  if (templateSource) {
    window.__IGNITION_TEMPLATES__ = { [blockName]: templateSource };
  } else if (!window.__IGNITION_TEMPLATES__) {
    window.__IGNITION_TEMPLATES__ = {};
  }
}

/**
 * Inject and execute the Ignition runtime in the current document.
 * Uses Function constructor to avoid jsdom script sandboxing.
 */
export function runRuntime() {
  window.Handlebars = Handlebars;

  // Use Function constructor to execute IIFE in current window context
  const fn = new Function(loadRuntimeScript());
  fn();

  // IIFE defers boot() to DOMContentLoaded when readyState is 'loading'
  if (!window.__IGNITION_STATE__) {
    document.dispatchEvent(new Event('DOMContentLoaded'));
  }

  return window.__IGNITION_STATE__;
}

/**
 * Load templates into window.__IGNITION_TEMPLATES__ (Handlebars source strings).
 */
export function loadTemplates(templates) {
  window.__IGNITION_TEMPLATES__ = templates;
}

/**
 * Set initial data into window.__IGNITION_INITIAL_DATA__.
 */
export function setInitialData(data) {
  window.__IGNITION_INITIAL_DATA__ = data;
}

/**
 * Compile a Handlebars template (assumes Handlebars is globally available).
 * Use after loading the runtime (which loads Handlebars).
 */
export function compileTemplate(name) {
  const source = window.__IGNITION_TEMPLATES__[name];
  if (!source) throw new Error(`Template not found: ${name}`);
  return Handlebars.compile(source);
}
