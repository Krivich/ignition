import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import config from '../../engine/config/default.js';
import { renderTemplate } from '../../engine/core/renderer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..', '..');

/**
 * B1-B4 (honest): The real renderTemplate embeds a COMPACT manifest of used
 * data — NOT the full dataset — so the first screen never ships the whole
 * dataset inline.
 */
describe('B. Page weight and data loading (real engine)', () => {
  let tmpDir;
  let originalConfig;

  beforeAll(async () => {
    originalConfig = { source: { ...config.source }, output: { ...config.output } };
  });

  afterAll(async () => {
    config.source = originalConfig.source;
    config.output = originalConfig.output;
  });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(projectRoot, 'tmp', 'ignition-b-'));
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

  async function scaffold() {
    const templatesDir = config.source.templates;
    const layoutDir = path.join(templatesDir, 'demo');
    await fs.mkdir(layoutDir, { recursive: true });

    await fs.writeFile(
      path.join(templatesDir, 'demo.hbs'),
      `<html>
<head>
  <title>{{title}}</title>
  <script>window.__IGNITION_MANIFEST__ = {{{manifest}}};</script>
</head>
<body>
  {{#block name="product-list" data="products"}}
     <p>нет</p>
  {{/block}}
  <p>{{siteName}}</p>
</body>
</html>`
    );
    await fs.writeFile(
      path.join(layoutDir, 'product-list.hbs'),
      `{{#each this}}<div class="product">{{name}}</div>{{/each}}`
    );

    const dataDir = path.join(config.source.data, 'demo');
    await fs.mkdir(dataDir, { recursive: true });
    const dataset = {
      title: 'Каталог',
      siteName: 'Ignition',
      products: [
        { name: 'Ноутбук' },
        { name: 'Мышь' },
        { name: 'Клавиатура' }
      ],
      secret: { large: Array.from({ length: 200 }, (_, i) => i) }
    };
    await fs.writeFile(path.join(dataDir, 'app.json'), JSON.stringify(dataset));
    return { templatesDir, dataDir, dataset };
  }

  async function buildPage() {
    const { dataset } = await scaffold();
    const data = { ...dataset, layout: 'demo', dataset: 'app' };
    const templatePath = path.join(config.source.templates, 'demo.hbs');
    const outputDir = path.join(config.output.html, 'demo');
    await renderTemplate(templatePath, data, outputDir, 'app', 'demo');
    return fs.readFile(path.join(outputDir, 'app.html'), 'utf8');
  }

  it('B1: embeds compact manifest, does NOT inline the full dataset', async () => {
    const html = await buildPage();

    const match = html.match(/__IGNITION_MANIFEST__\s*=\s*(\{[\s\S]*?\});/);
    expect(match).not.toBeNull();
    const manifest = JSON.parse(match[1]);

    // manifest is keyed by block, contains ONLY the used slice
    expect(manifest['demo/product-list'].length).toBe(3);
    expect(manifest.secret).toBeUndefined();
    expect(manifest.siteName).toBeUndefined();

    // The full dataset (with the 200-item secret subtree) is far larger
    const { dataset } = await scaffold();
    const fullSize = JSON.stringify({ ...dataset, layout: 'demo', dataset: 'app' }).length;
    const manSize = JSON.stringify(manifest).length;
    expect(manSize).toBeLessThan(fullSize);
  });

  it('B2: manifest is a strict subset of the dataset (used data only)', async () => {
    const html = await buildPage();
    const match = html.match(/__IGNITION_MANIFEST__\s*=\s*(\{[\s\S]*?\});/);
    const manifest = JSON.parse(match[1]);

    expect(Object.keys(manifest).length).toBe(1); // only demo/product-list
    expect(manifest['demo/product-list']).toEqual([
      { name: 'Ноутбук' },
      { name: 'Мышь' },
      { name: 'Клавиатура' }
    ]);
  });

  it('B3: first screen content lives in HTML, not in a runtime JSON blob', async () => {
    const html = await buildPage();

    // Server-rendered products are in the HTML
    expect(html).toContain('<div class="product">Ноутбук</div>');
    expect(html).toContain('<div class="product">Клавиатура</div>');

    // No full dataset object is inlined anywhere in the page
    expect(html).not.toContain('"secret"');
    expect(html).not.toContain('Array');
  });

  it('B4: the page does not require a runtime to display its rendered content', async () => {
    const html = await buildPage();
    // Content rendered without any script/block execution
    expect(html).toContain('<div class="product">Мышь</div>');
    expect(html).toContain('data-ignition-block="demo/product-list"');
  });
});
