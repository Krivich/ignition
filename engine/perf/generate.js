import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_OUT = path.resolve(__dirname, '..', '..', 'tmp', 'perf', 'input');

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CATEGORIES = ['fiction', 'tech', 'cooking', 'travel', 'kids', 'history', 'science', 'design'];

function genProducts(rnd, count) {
  const items = [];
  for (let i = 0; i < count; i++) {
    const cat = CATEGORIES[(rnd() * CATEGORIES.length) | 0];
    items.push({
      id: i + 1,
      name: `Product ${i + 1} - ${cat} line ${((rnd() * 20) | 0) + 1}`,
      price: ((rnd() * 8000) + 200).toFixed(2),
      category: cat,
      rating: (rnd() * 5).toFixed(1),
    });
  }
  return items;
}

function genSales(rnd, count) {
  const rows = [];
  for (let i = 0; i < count; i++) {
    rows.push({
      date: `2026-0${(rnd() * 9) | 0}-1${(rnd() * 9) | 0}`,
      amount: (rnd() * 9000) + 100,
      region: ['north', 'south', 'east', 'west'][(rnd() * 4) | 0],
    });
  }
  return rows;
}

async function write(root, rel, content) {
  const p = path.join(root, rel);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, content, 'utf8');
}

// ---------------------------------------------------------------
// catalog: paginated product grid + reactive cart (header+details
// share the SAME cart path -> the "double re-render of twin blocks"
// grable from fixture 1), controller recompute via subscribe.
// ---------------------------------------------------------------
const CATALOG_LAYOUT = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>{{title}} - page {{pagination.currentPage}}</title>
  <meta name="robots" content="{{#ifCond pagination.currentPage '==' 1}}index, follow{{else}}noindex, follow{{/ifCond}}">
</head>
<body>
  <header>
    <h1>{{title}}</h1>
  </header>
  <main>
    {{> ignition/pagination
        collection="products"
        perPage=12
        pageTemplate="catalog/page"
        layout=layout
        dataset=dataset
    }}
    {{> catalog/cart-header cart}}
    {{> catalog/cart-details cart}}
  </main>
</body>
</html>
`;

const CATALOG_PAGE = `<div class="catalog-grid">
  {{#each items}}
    <article class="product-card" data-id="{{id}}" data-price="{{price}}" data-name="{{name}}">
      <h3>{{name}}</h3>
      <p class="price">\${{price}}</p>
      <span class="rating">{{rating}} / 5</span>
    </article>
  {{/each}}
  {{#unless items.length}}<p class="empty">None</p>{{/unless}}
</div>
<nav class="pagination">
  {{#if pagination.hasPrev}}<a href="{{basePath}}{{pagination.prevPage}}" data-page="{{pagination.prevPage}}">&laquo;</a>{{/if}}
  {{#times pagination.totalPages}}<a href="{{basePath}}{{this}}" class="{{#ifCond this '==' ../pagination.currentPage}}active{{/ifCond}}" data-page="{{this}}">{{this}}</a>{{/times}}
  {{#if pagination.hasNext}}<a href="{{basePath}}{{pagination.nextPage}}" data-page="{{pagination.nextPage}}">&raquo;</a>{{/if}}
</nav>
`;

const CATALOG_CART_HEADER = `{{#if items.length}}
  <span class="cart-count">{{items.length}} in cart</span>
{{else}}
  <span class="cart-empty">Cart is empty</span>
{{/if}}
`;

const CATALOG_CART_DETAILS = `<div class="cart-details" data-ignition-class="visible:cart.items.length">
  <ul>
    {{#each items}}
      <li>
        <span>{{name}} - {{price}}</span>
        <button class="remove-from-cart" data-id="{{id}}">x</button>
      </li>
    {{/each}}
  </ul>
</div>
`;

// ---------------------------------------------------------------
// dashboard: 4 blocks ALL depending on metrics.sales overhead -> the
// "4 parts flicker together" grable (fixture 3, #1), computed-on-
// computed (totalSales -> avgSales, bestDay), filteredSales, refresh.
// ---------------------------------------------------------------
const DASHBOARD_LAYOUT = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Dashboard</title></head>
<body>
  <div class="controls">
    <button id="refreshBtn">Refresh</button>
    <select id="periodSelect" value="{{ui.period}}">
      <option value="week">Week</option>
      <option value="month">Month</option>
    </select>
  </div>

  {{#block name="summary" depends="totalSales, avgSales"}}{{/block}}
  {{#block name="sales-list" depends="filteredSales"}}{{/block}}
  {{#block name="best-day" depends="bestDay"}}{{/block}}
  {{#block name="footer" depends="totalSales, bestDay"}}{{/block}}
</body>
</html>
`;

const DASHBOARD_SUMMARY = `{{#if metrics.loading}}
  <div class="skeleton">loading</div>
{{else}}
  <div class="metric">Total: {{totalSales}}</div>
  <div>Avg: {{avgSales}}</div>
{{/if}}
`;

const DASHBOARD_SALES = `{{#if metrics.loading}}
  <div class="skeleton">loading</div>
{{else}}
  {{#each filteredSales}}
    <div class="sale-item"><span>{{date}}</span><span>{{amount}}</span><span>{{region}}</span></div>
  {{/each}}
  {{#unless filteredSales.length}}<p class="empty">No sales</p>{{/unless}}
{{/if}}
`;

const DASHBOARD_BEST = `<div class="best-day">{{bestDay}} / {{bestAmount}}</div>`;

const DASHBOARD_FOOTER = `<footer>Sales: {{totalSales}} Best: {{bestDay}}</footer>`;

// ---------------------------------------------------------------
// form: deep nested proxy fields with two-way bindings + computed
// validation -> the "form fields Proxy" (fixture 2) grable at scale.
// ---------------------------------------------------------------
const FORM_LAYOUT = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Form</title></head>
<body>
  {{#block name="contact" data="." depends="form"}}{{/block}}
</body>
</html>
`;

const FORM_CONTACT = `{{#if form.submitted}}
  <div class="success"><p>Submitted</p><button id="resetBtn">Reset</button></div>
{{else if form.submitting}}
  <div class="spinner">Submitting...</div>
{{else}}
  <form id="contactForm">
    {{#each form.fields}}
      <div class="form-group">
        <label>{{name}}</label>
        <input type="text" id="{{name}}" value="{{value}}" placeholder="{{name}}">
        {{#if (lookup ../form.errors name)}}<div class="error">{{lookup ../form.errors name}}</div>{{/if}}
      </div>
    {{/each}}
    <button type="submit">{{#if isFormValid}}Submit{{else}}Disabled{{/if}}</button>
  </form>
{{/if}}
`;

// ---------------------------------------------------------------
// content: many SSR-heavy sections, each with an #each list of
// entries -> raw server-rendering + boot binding volume.
// ---------------------------------------------------------------
function contentLayout(scale) {
  const sections = Array.from({ length: 6 + scale * 2 }, (_, i) => i + 1)
    .map(
      (s) => `  <section class="block-s" data-ignition-text="text${s}">
    <h2>Section ${s}</h2>
    {{#each items}}
      <div class="item"><span>{{label}}</span><span>{{value}}</span></div>
    {{/each}}
  </section>`
    )
    .join('\n');
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Content {{dataset}}</title></head>
<body>
<header><h1>{{title}}</h1></header>
<main>
${sections}
</main>
</body>
</html>
`;
}

// Index of every static line so the controller can re-render cheaply.
function contentItems(scale) {
  return Array.from({ length: scale * 30 }, (_, i) => ({
    label: `entry ${i}`,
    value: ((i * 2654435761) >>> 0).toString(),
  }));
}

function controllerCatalog(scale) {
  return `window.ignition.controller(function(state, api) {
  function recompute(s) {
    s.cartCount = s.cart.items.length;
  }
  recompute(state);
  state.subscribe('cart', function() { recompute(state); });

  api.blockOptions.renderers['catalog/cart-header'] = function(s) { return s.cart; };
  api.blockOptions.renderers['catalog/cart-details'] = function(s) { return s.cart; };
  api.blockOptions.sourceDeps['catalog/cart-header'] = ['cart'];
  api.blockOptions.sourceDeps['catalog/cart-details'] = ['cart'];

  document.body.addEventListener('click', function(e) {
    var card = e.target.closest('.product-card');
    if (card && e.target.tagName === 'H3') {
      e.preventDefault();
      state.cart.items.push({ id: +card.getAttribute('data-id'), price: +card.getAttribute('data-price'), name: card.getAttribute('data-name') });
      return;
    }
    var removeBtn = e.target.closest('.remove-from-cart');
    if (removeBtn) {
      e.preventDefault();
      var rid = +removeBtn.getAttribute('data-id');
      for (var i = 0; i < state.cart.items.length; i++) {
        if (state.cart.items[i].id === rid) { state.cart.items.splice(i, 1); break; }
      }
    }
  });
});
`;
}

function controllerDashboard(scale) {
  return `window.ignition.controller(function(state, api) {
  function recomputeAll(s) {
    var sales = s.metrics.sales;
    var total = 0, best = null;
    for (var i = 0; i < sales.length; i++) { total += sales[i].amount; if (!best || sales[i].amount > best.amount) best = sales[i]; }
    s.totalSales = total;
    s.avgSales = sales.length ? Math.round(total / sales.length) : 0;
    s.bestDay = best ? best.date : '-';
    s.bestAmount = best ? best.amount : 0;
    s.filteredSales = s.ui.period === 'month' ? sales : sales.slice(0, 7);
  }
  recomputeAll(state);
  state.subscribe('metrics', function() { recomputeAll(state); });
  state.subscribe('ui.period', function() { recomputeAll(state); });

  api.blockOptions.renderers['dashboard/summary'] = function(s) { return { metrics: s.metrics, totalSales: s.totalSales, avgSales: s.avgSales }; };
  api.blockOptions.renderers['dashboard/sales-list'] = function(s) { return { metrics: s.metrics, filteredSales: s.filteredSales }; };
  api.blockOptions.renderers['dashboard/best-day'] = function(s) { return { metrics: s.metrics, bestDay: s.bestDay, bestAmount: s.bestAmount }; };
  api.blockOptions.renderers['dashboard/footer'] = function(s) { return { metrics: s.metrics, totalSales: s.totalSales, bestDay: s.bestDay }; };

  document.getElementById('refreshBtn').addEventListener('click', function() {
    state.metrics.loading = true;
    setTimeout(function() {
      state.metrics.sales = window.__IGNITION_STATIC_SALES__ || state.metrics.sales;
      state.metrics.loading = false;
    }, 100);
  });
  document.getElementById('periodSelect').addEventListener('change', function(e) {
    state.ui.period = e.target.value;
  });
});
`;
}

function controllerForm(scale) {
  return `window.ignition.controller(function(state, api) {
  api.blockOptions.renderers['form/contact'] = function(s) { return { form: s.form, isFormValid: s.isFormValid }; };

  function validate(s) {
    var errors = {}, v = s.form.fields;
    for (var k in v) { if (!v[k]) errors[k] = 'required'; }
    s.form.errors = errors;
    return Object.keys(errors).length === 0;
  }
  function isFormValid(s) {
    var v = s.form.fields, missing = 0;
    for (var k in v) { if (!v[k]) missing++; }
    return missing === 0;
  }
  function recompute(s) { s.isFormValid = isFormValid(s); }
  recompute(state);
  state.subscribe('form.fields', function() { recompute(state); });
  state.subscribe('form', function() { recompute(state); });

  document.body.addEventListener('submit', function(e) {
    if (e.target.id !== 'contactForm') return;
    e.preventDefault();
    if (!validate(state)) return;
    state.form.submitting = true;
    setTimeout(function() { state.form.submitting = false; state.form.submitted = true; }, 100);
  });
  document.body.addEventListener('click', function(e) {
    if (e.target.id === 'resetBtn') {
      Object.keys(state.form.fields).forEach(function(k) { state.form.fields[k] = ''; });
      state.form.errors = {};
      state.form.submitting = false;
      state.form.submitted = false;
    }
  });
});
`;
}

export async function generate(outDir = DEFAULT_OUT) {
  const scale = Number(process.env.PERF_SCALE || 1) || 1;

  const rndC = mulberry32(42);
  const rndD = mulberry32(7);
  const catCount = scale * 2000;
  const saleCount = scale * 200;

  const files = {
    'templates/catalog.hbs': CATALOG_LAYOUT,
    'templates/catalog/page.hbs': CATALOG_PAGE,
    'templates/catalog/cart-header.hbs': CATALOG_CART_HEADER,
    'templates/catalog/cart-details.hbs': CATALOG_CART_DETAILS,
    'templates/dashboard.hbs': DASHBOARD_LAYOUT,
    'templates/dashboard/summary.hbs': DASHBOARD_SUMMARY,
    'templates/dashboard/sales-list.hbs': DASHBOARD_SALES,
    'templates/dashboard/best-day.hbs': DASHBOARD_BEST,
    'templates/dashboard/footer.hbs': DASHBOARD_FOOTER,
    'templates/form.hbs': FORM_LAYOUT,
    'templates/form/contact.hbs': FORM_CONTACT,
    'templates/content.hbs': contentLayout(scale),
    'data/catalog/books.json': JSON.stringify({
      title: 'Saturated Catalog',
      products: genProducts(rndC, catCount),
      cart: { items: [] },
      ui: { activeCategory: 'all' },
    }),
    'data/dashboard/main.json': JSON.stringify({
      metrics: { sales: genSales(rndD, saleCount), loading: false, error: null },
      ui: { period: 'week' },
    }),
    'data/form/main.json': JSON.stringify({
      form: {
        fields: (() => {
          const o = {};
          for (let i = 0; i < scale * 20; i++) o[`field${i}`] = i % 3 === 0 ? '' : `value-${i}`;
          return o;
        })(),
        errors: {},
        submitting: false,
        submitted: false,
      },
    }),
    'controllers/catalog.js': controllerCatalog(scale),
    'controllers/dashboard.js': controllerDashboard(scale),
    'controllers/form.js': controllerForm(scale),
  };

  const contentPages = Math.max(4, scale * 10);
  const items = contentItems(scale);
  const sectionCount = 6 + scale * 2;
  for (let i = 0; i < contentPages; i++) {
    const texts = {};
    for (let s = 1; s <= sectionCount; s++) {
      texts[`text${s}`] = `Static body text for section ${s} of page${i} with a bit of length to make paragraphs realistic.`;
    }
    files[`data/content/page${i}.json`] = JSON.stringify({
      title: `Content page${i}`,
      items,
      ...texts,
    });
  }

  // wire __IGNITION_STATIC_SALES__ into the dashboard HTML
  files['templates/dashboard.hbs'] += `\n<script>window.__IGNITION_STATIC_SALES__ = ${JSON.stringify(
    genSales(mulberry32(7), saleCount)
  )};<\/script>\n`;

  // The pagination system partial must be present in the user templates
  // tree (registered as "ignition/pagination"). Copy the canonical engine
  // source so the generated input stays in sync with the engine.
  const systemPartial = await fs.readFile(
    path.resolve(__dirname, '..', 'core', 'partials', 'pagination.hbs'),
    'utf8'
  );
  files['templates/ignition/pagination.hbs'] = systemPartial;

  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(outDir, { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    await write(outDir, rel, content);
  }
  return { outDir, scale, fileCount: Object.keys(files).length };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  generate().then((r) => {
    console.log(`Generated ${r.fileCount} files @ scale=${r.scale} into ${r.outDir}`);
  }).catch((e) => { console.error(e); process.exit(1); });
}
