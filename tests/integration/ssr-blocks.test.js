import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import config from '../../engine/config/default.js';
import { renderTemplate } from '../../engine/core/renderer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..', '..');

/**
 * Honest SSR tests: verify the REAL renderTemplate builds reactive blocks
 * into HTML (server-side) and embeds a COMPACT manifest (used data only),
 * per requirement groups A (server-render blocks) and B (compact manifest).
 */
describe('A+B: Server-side block rendering + compact manifest (real engine)', () => {
  let tmpDir;
  let originalConfig;

  beforeAll(async () => {
    originalConfig = {
      source: { ...config.source },
      output: { ...config.output },
    };
  });

  afterAll(async () => {
    config.source = originalConfig.source;
    config.output = originalConfig.output;
  });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(projectRoot, 'tmp', 'ignition-ssr-'));
    config.source.templates = path.join(tmpDir, 'input', 'templates');
    config.source.data = path.join(tmpDir, 'input', 'data');
    config.output.html = path.join(tmpDir, 'output', 'public');
    config.output.data = path.join(tmpDir, 'output', 'public', 'data');
    config.output.templates = path.join(tmpDir, 'output', 'public', 'templates');
    config.output.assets = path.join(tmpDir, 'output', 'public', 'assets');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function scaffold(overrides = {}) {
    const templatesDir = config.source.templates;
    const layoutDir = path.join(templatesDir, 'ssr');
    await fs.mkdir(layoutDir, { recursive: true });

    const layout = `
<!DOCTYPE html>
<html>
<head>
  <title>{{title}}</title>
  <script>window.__IGNITION_MANIFEST__ = {{{manifest}}};</script>
</head>
<body>
  {{#block name="product-list" data="products" depends="products"}}
     <p class="empty">Нет товаров</p>
  {{/block}}
</body>
</html>`;

    const block = `{{#each this}}<div class="product">{{name}}</div>{{/each}}`;

    await fs.writeFile(path.join(templatesDir, 'ssr.hbs'), layout);
    await fs.writeFile(path.join(layoutDir, 'product-list.hbs'), block);

    const dataDir = path.join(config.source.data, 'ssr');
    await fs.mkdir(dataDir, { recursive: true });
    const dataset = {
      title: 'Каталог',
      products: [
        { name: 'Товар А' },
        { name: 'Товар Б' },
      ],
      unused: { big: [1, 2, 3, 4, 5] },
    };
    await fs.writeFile(path.join(dataDir, 'main.json'), JSON.stringify(dataset));

    return { templatesDir, dataDir, dataset };
  }

  it('A1: server fills the block with content rendered from block partial + data slice', async () => {
    await scaffold();

    const templatePath = path.join(config.source.templates, 'ssr.hbs');
    const data = {
      title: 'Каталог',
      products: [
        { name: 'Товар А' },
        { name: 'Товар Б' },
      ],
      unused: { big: [1, 2, 3, 4, 5] },
      layout: 'ssr',
      dataset: 'main',
    };
    const outputDir = path.join(config.output.html, 'ssr');

    await renderTemplate(templatePath, data, outputDir, 'main', 'ssr');

    const html = await fs.readFile(path.join(outputDir, 'main.html'), 'utf8');
    expect(html).toContain('data-ignition-block="ssr/product-list"');
    expect(html).toContain('data-ignition-data="products"');
    expect(html).toContain('<div class="product">Товар А</div>');
    expect(html).toContain('<div class="product">Товар Б</div>');
  });

  it('A1: block content is INSIDE the data-ignition-block element', async () => {
    await scaffold();

    const templatePath = path.join(config.source.templates, 'ssr.hbs');
    const data = {
      products: [{ name: 'Товар А' }, { name: 'Товар Б' }],
      layout: 'ssr',
      dataset: 'main',
    };
    const outputDir = path.join(config.output.html, 'ssr');

    await renderTemplate(templatePath, data, outputDir, 'main', 'ssr');
    const html = await fs.readFile(path.join(outputDir, 'main.html'), 'utf8');

    const blockOpen = html.indexOf('data-ignition-block="ssr/product-list"');
    const blockClose = html.lastIndexOf('</div>', blockOpen + 500);
    const inner = html.slice(blockOpen, blockClose);
    expect(inner).toContain('<div class="product">Товар А</div>');
  });

  it('A2: block with empty/no data renders valid fallback content, no error', async () => {
    await scaffold();

    const templatePath = path.join(config.source.templates, 'ssr.hbs');
    const data = {
      products: [],
      layout: 'ssr',
      dataset: 'main',
    };
    const outputDir = path.join(config.output.html, 'ssr');

    await expect(
      renderTemplate(templatePath, data, outputDir, 'main', 'ssr')
    ).resolves.toBe(true);

    const html = await fs.readFile(path.join(outputDir, 'main.html'), 'utf8');
    expect(html).toContain('data-ignition-block="ssr/product-list"');
    expect(html).toContain('Нет товаров');
  });

  it('B1: embeds COMPACT manifest of used data, NOT the full dataset', async () => {
    await scaffold();

    const templatePath = path.join(config.source.templates, 'ssr.hbs');
    const data = {
      title: 'Каталог',
      products: [
        { name: 'Товар А' },
        { name: 'Товар Б' },
      ],
      unused: { big: [1, 2, 3, 4, 5] },
      layout: 'ssr',
      dataset: 'main',
    };
    const outputDir = path.join(config.output.html, 'ssr');

    await renderTemplate(templatePath, data, outputDir, 'main', 'ssr');
    const html = await fs.readFile(path.join(outputDir, 'main.html'), 'utf8');

    const match = html.match(/__IGNITION_MANIFEST__\s*=\s*(\{[\s\S]*?\});/);
    expect(match).not.toBeNull();
    const manifest = JSON.parse(match[1]);

    // Manifest is keyed by block name, mapping to the used data slice
    expect(manifest['ssr/product-list']).toBeDefined();
    expect(manifest['ssr/product-list'].length).toBe(2);

    // Manifest should NOT contain entire unused subtree
    expect(manifest.unused).toBeUndefined();

    // Manifest should be strictly smaller than the full dataset
    const fullSize = JSON.stringify(data).length;
    const manSize = JSON.stringify(manifest).length;
    expect(manSize).toBeLessThan(fullSize);
  });

  it('A4: rendered block HTML is present in the file (no client JS needed)', async () => {
    await scaffold();

    const templatePath = path.join(config.source.templates, 'ssr.hbs');
    const outputDir = path.join(config.output.html, 'ssr');
    const data = {
      products: [{ name: 'Товар А' }],
      layout: 'ssr',
      dataset: 'main',
    };

    await renderTemplate(templatePath, data, outputDir, 'main', 'ssr');
    const html = await fs.readFile(path.join(outputDir, 'main.html'), 'utf8');

    // Content visible pre-rendered; the page contains markup without runtime
    expect(html).toContain('<div class="product">Товар А</div>');
    expect(html).toContain('data-ignition-block');
  });

  it('A5: block can receive multiple named data slices', async () => {
    const templatesDir = config.source.templates;
    const layoutDir = path.join(templatesDir, 'ssr');
    await fs.mkdir(layoutDir, { recursive: true });

    const layout = `<!DOCTYPE html>
<html><head><script>window.__IGNITION_MANIFEST__ = {{{manifest}}};</script></head><body>
  {{#block name="multi-list" data="products, categories" depends="products, categories"}}
     <p class="empty">Нет данных</p>
  {{/block}}
</body></html>`;
    const block = `
{{#each products}}<span class="product">{{name}}</span>{{/each}}
{{#each categories}}<span class="category">{{this}}</span>{{/each}}
`;

    await fs.writeFile(path.join(templatesDir, 'ssr.hbs'), layout);
    await fs.writeFile(path.join(layoutDir, 'multi-list.hbs'), block);

    const data = {
      products: [{ name: 'A' }, { name: 'B' }],
      categories: ['cat1', 'cat2'],
      layout: 'ssr',
      dataset: 'main',
    };
    const outputDir = path.join(config.output.html, 'ssr');

    await renderTemplate(path.join(templatesDir, 'ssr.hbs'), data, outputDir, 'main', 'ssr');
    const html = await fs.readFile(path.join(outputDir, 'main.html'), 'utf8');

    expect(html).toContain('data-ignition-data="products, categories"');
    expect(html).toContain('<span class="product">A</span>');
    expect(html).toContain('<span class="category">cat2</span>');

    const match = html.match(/__IGNITION_MANIFEST__\s*=\s*(\{[\s\S]*?\});/);
    const manifest = JSON.parse(match[1]);
    expect(manifest['ssr/multi-list']).toEqual({
      products: data.products,
      categories: data.categories
    });
  });

  it('A6: inline initial state is derived from ignition attributes, not the full dataset', async () => {
    await scaffold();

    const templatesDir = config.source.templates;
    const layout = `<!DOCTYPE html>
<html>
<head>
  <title>{{title}}</title>
  <script>window.__IGNITION_INITIAL_DATA__ = {{{initialData}}};</script>
</head>
<body>
  {{#block name="product-list" data="products" depends="products"}}
     <p class="empty">Нет товаров</p>
  {{/block}}
</body>
</html>`;
    await fs.writeFile(path.join(templatesDir, 'ssr.hbs'), layout);

    const templatePath = path.join(config.source.templates, 'ssr.hbs');
    const data = {
      title: 'Каталог',
      products: [{ name: 'Товар А' }],
      unused: { big: [1, 2, 3, 4, 5] },
      layout: 'ssr',
      dataset: 'main',
    };
    const outputDir = path.join(config.output.html, 'ssr');

    await renderTemplate(templatePath, data, outputDir, 'main', 'ssr');
    const html = await fs.readFile(path.join(outputDir, 'main.html'), 'utf8');

    const match = html.match(/__IGNITION_INITIAL_DATA__\s*=\s*(\{[\s\S]*?\});/);
    expect(match).not.toBeNull();
    const initialData = JSON.parse(match[1]);

    expect(initialData.products).toEqual([{ name: 'Товар А' }]);
    expect(initialData.unused).toBeUndefined();
  });

  it('A7: `{{#block}}`-only page is static — no preload, no runtime', async () => {
    await scaffold();

    const templatePath = path.join(config.source.templates, 'ssr.hbs');
    const data = {
      title: 'Каталог',
      products: [{ name: 'Товар А' }],
      unused: { big: [1, 2, 3, 4, 5] },
      layout: 'ssr',
      dataset: 'main',
    };
    const outputDir = path.join(config.output.html, 'ssr');

    await renderTemplate(templatePath, data, outputDir, 'main', 'ssr');
    const html = await fs.readFile(path.join(outputDir, 'main.html'), 'utf8');

    // A {{#block}} with no bindings/controller/pagination is static: its content
    // is SSR-filled and no one re-renders it, so no preload and no runtime.
    expect(html).not.toContain('rel="preload"');
    expect(html).not.toContain('ignition-runtime.js');
  });

  it('A8: does not inject preload on pages without ignition attributes', async () => {
    const templatesDir = config.source.templates;
    await fs.mkdir(templatesDir, { recursive: true });
    const layout = `<!DOCTYPE html>
<html><head><title>{{title}}</title></head><body><p>{{title}}</p></body></html>`;
    await fs.writeFile(path.join(templatesDir, 'plain.hbs'), layout);

    const data = { title: 'Plain', layout: 'plain', dataset: 'main' };
    const outputDir = path.join(config.output.html, 'plain');
    await renderTemplate(path.join(templatesDir, 'plain.hbs'), data, outputDir, 'main', 'plain');
    const html = await fs.readFile(path.join(outputDir, 'main.html'), 'utf8');

    expect(html).not.toContain('rel="preload"');
  });

  it('B4: autoblock partial records its REAL slice in the manifest (not undefined)', async () => {
    const templatesDir = config.source.templates;
    const layoutDir = path.join(templatesDir, 'ssr');
    await fs.mkdir(layoutDir, { recursive: true });

    const layout = `<!DOCTYPE html>
<html><head><title>{{title}}</title>
  <script>window.__IGNITION_MANIFEST__ = {{{manifest}}};</script>
</head><body>
  {{> ssr/product-list products}}
</body></html>`;
    const block = `{{#each this}}<div class="product">{{name}}</div>{{/each}}`;

    await fs.writeFile(path.join(templatesDir, 'ssr.hbs'), layout);
    await fs.writeFile(path.join(layoutDir, 'product-list.hbs'), block);

    const dataDir = path.join(config.source.data, 'ssr');
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(path.join(dataDir, 'main.json'), '{}');

    const data = {
      title: 'Каталог',
      products: [{ name: 'Товар А' }, { name: 'Товар Б' }],
      unused: { big: [1, 2, 3, 4, 5] },
      layout: 'ssr',
      dataset: 'main',
    };
    const outputDir = path.join(config.output.html, 'ssr');
    await renderTemplate(path.join(templatesDir, 'ssr.hbs'), data, outputDir, 'main', 'ssr');
    const html = await fs.readFile(path.join(outputDir, 'main.html'), 'utf8');

    const match = html.match(/__IGNITION_MANIFEST__\s*=\s*(\{[\s\S]*?\});/);
    expect(match).not.toBeNull();
    const manifest = JSON.parse(match[1]);

    // SSR fills the block from the products slice
    expect(html).toContain('data-ignition-block="ssr/product-list"');
    expect(html).toContain('<div class="product">Товар А</div>');

    // The manifest must record the ACTUAL products slice, not undefined —
    // otherwise loadDataset would treat the identical dataset as always-changed.
    expect(manifest['ssr/product-list']).toBeDefined();
    expect(manifest['ssr/product-list']).toEqual(data.products);
  });

  it('B5: explicit qualified {{#block name="ssr/product-list"}} keeps its name (no double prefix)', async () => {
    const templatesDir = config.source.templates;
    const layoutDir = path.join(templatesDir, 'ssr');
    await fs.mkdir(layoutDir, { recursive: true });

    const layout = `<!DOCTYPE html>
<html><head><title>{{title}}</title></head><body>
  {{#block name="ssr/product-list" data="products"}}
     <p class="empty">Нет товаров</p>
  {{/block}}
</body></html>`;
    const block = `{{#each this}}<div class="product">{{name}}</div>{{/each}}`;

    await fs.writeFile(path.join(templatesDir, 'ssr.hbs'), layout);
    await fs.writeFile(path.join(layoutDir, 'product-list.hbs'), block);

    const dataDir = path.join(config.source.data, 'ssr');
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(path.join(dataDir, 'main.json'), '{}');

    const data = {
      title: 'Каталог',
      products: [{ name: 'Товар А' }],
      layout: 'ssr',
      dataset: 'main',
    };
    const outputDir = path.join(config.output.html, 'ssr');
    await renderTemplate(path.join(templatesDir, 'ssr.hbs'), data, outputDir, 'main', 'ssr');
    const html = await fs.readFile(path.join(outputDir, 'main.html'), 'utf8');

    // The block must be resolved by its full qualified name, resolving the
    // partial and rendering the product list — not the fallback body.
    expect(html).toContain('data-ignition-block="ssr/product-list"');
    expect(html).not.toContain('data-ignition-block="ssr/ssr/product-list"');
    expect(html).toContain('<div class="product">Товар А</div>');
  });

  it('B6: page with an external controller is live and inlines the FULL dataset', async () => {
    const templatesDir = config.source.templates;
    const layoutDir = path.join(templatesDir, 'ssr');
    await fs.mkdir(layoutDir, { recursive: true });

    const layout = `<!DOCTYPE html>
<html><head><title>{{title}}</title></head><body>
  {{#block name="product-list" data="products"}}
     <p class="empty">Нет товаров</p>
  {{/block}}
</body></html>`;
    const block = `{{#each this}}<div class="product">{{name}}</div>{{/each}}`;

    await fs.writeFile(path.join(templatesDir, 'ssr.hbs'), layout);
    await fs.writeFile(path.join(layoutDir, 'product-list.hbs'), block);

    const dataDir = path.join(config.source.data, 'ssr');
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(path.join(dataDir, 'main.json'), '{}');

    // Place an external controller for layout `ssr`.
    const savedControllerDir = config.source.controllers;
    const controllersDir = path.join(config.source.templates, '..', 'controllers');
    config.source.controllers = controllersDir;
    await fs.mkdir(controllersDir, { recursive: true });
    await fs.writeFile(path.join(controllersDir, 'ssr.js'), 'window.ignition.controller(function(state){})');

    try {
      const data = {
        title: 'Каталог',
        products: [{ name: 'Товар А' }],
        used: 'branch',
        bigUnused: { nested: [1, 2, 3, 4, 5] },
        layout: 'ssr',
        dataset: 'main',
      };
      const outputDir = path.join(config.output.html, 'ssr');
      await renderTemplate(path.join(templatesDir, 'ssr.hbs'), data, outputDir, 'main', 'ssr');
      const html = await fs.readFile(path.join(outputDir, 'main.html'), 'utf8');

      // The page must be live: runtime injected + dataset preloaded.
      expect(html).toContain('ignition-runtime.js');
      expect(html).toContain('rel="preload"');

      // §7: a controller may read arbitrary branches, so the FULL dataset is
      // inlined — including the big unused subtree a compact subset would drop.
      const match = html.match(/__IGNITION_INITIAL_DATA__\s*=\s*(\{[\s\S]*?\});/);
      expect(match).not.toBeNull();
      const initialData = JSON.parse(match[1]);
      expect(initialData.products).toEqual([{ name: 'Товар А' }]);
      expect(initialData.bigUnused).toEqual({ nested: [1, 2, 3, 4, 5] });
      expect(initialData.used).toBe('branch');
    } finally {
      config.source.controllers = savedControllerDir;
    }
  });
});
