import deepGet from '../utils/deepGet.js';
import { parseBlockData, buildBlockContext } from '../utils/parseBlockData.js';
import { fineCoverage, blockSignals } from './fineRegistry.js';

let manifest = {};

export function resetManifest() {
  manifest = {};
}

export function getManifest() {
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
export function registerHelpersWith(Handlebars) {
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

export function registerBlockHelper(Handlebars, env) {
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
