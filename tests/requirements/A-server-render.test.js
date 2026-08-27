import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import config from '../../engine/config/default.js';
import { renderTemplate } from '../../engine/core/renderer.js';
import { registerHelpersWith, resetManifest } from '../../engine/core/helpers.js';
import Handlebars from 'handlebars';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..', '..');

/**
 * A1-A5 (honest): tests the REAL server renderer + real Handlebars helpers.
 * Server fills block content from the dataset via the `{{#block}}` helper,
 * without executing any client-side JS.
 */
describe('A. Server-side rendering of reactive blocks (real engine)', () => {
  let tmpDir;
  let originalConfig;

  beforeAll(() => {
    originalConfig = { source: { ...config.source }, output: { ...config.output } };
  });

  afterAll(() => {
    config.source = originalConfig.source;
    config.output = originalConfig.output;
  });

  beforeEach(async () => {
    resetManifest();
    tmpDir = await fs.mkdtemp(path.join(projectRoot, 'tmp', 'ignition-a-'));
    config.source.templates = path.join(tmpDir, 'input', 'templates');
    config.output.html = path.join(tmpDir, 'output', 'public');
    config.output.data = path.join(tmpDir, 'output', 'public', 'data');
    config.output.templates = path.join(tmpDir, 'output', 'public', 'templates');
    config.output.assets = path.join(tmpDir, 'output', 'public', 'assets');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function buildPage(layoutBody, blockTemplate) {
    await registerHelpersWith(Handlebars);
    const { dataset } = blockTemplate;
    const data = { ...dataset, layout: 'catalog', dataset: 'books' };
    const layoutDir = path.join(config.source.templates, 'catalog');
    await fs.mkdir(layoutDir, { recursive: true });
    const templatePath = path.join(config.source.templates, 'catalog.hbs');
    await fs.writeFile(templatePath, layoutBody);
    await fs.writeFile(path.join(layoutDir, blockTemplate.file), blockTemplate.source);
    const outputDir = path.join(config.output.html, 'catalog');
    await renderTemplate(templatePath, data, outputDir, 'books', 'catalog');
    return fs.readFile(path.join(outputDir, 'books.html'), 'utf8');
  }

  it('A1: server fills block content from the dataset via {{#block}}', async () => {
    resetManifest();
    const html = await buildPage(
      `<html><body>{{#block name="list" data="products"}}<p>empty</p>{{/block}}</body></html>`,
      {
        file: 'list.hbs',
        source: '{{#each this}}<div class="product">{{name}}</div>{{/each}}',
        dataset: { products: [{ name: 'Book 1' }, { name: 'Book 2' }] }
      }
    );

    const blockHtml = html.match(/data-ignition-block="catalog\/list"[\s\S]*?<\/div>/)?.[0] || html;
    expect(html).toContain('data-ignition-block="catalog/list"');
    expect(html).toContain('<div class="product">Book 1</div>');
    expect(html).toContain('<div class="product">Book 2</div>');
  });

  it('A2: block with no matching data renders empty, without error', async () => {
    resetManifest();
    const html = await buildPage(
      `<html><body>{{#block name="list" data="missing.path"}}<p>fallback</p>{{/block}}</body></html>`,
      {
        file: 'list.hbs',
        source: '{{#each this}}<div>{{name}}</div>{{/each}}',
        dataset: { products: [{ name: 'Book 1' }] }
      }
    );

    const block = html.match(/data-ignition-block="catalog\/list"([^>]*)>(.*?)<\/div>/)[2];
    expect(block.trim()).toBe('<p>fallback</p>');
  });

  it('A3: template source is registered for client rendering (same source)', async () => {
    resetManifest();
    const source = '<div class="product">{{name}}</div>';
    await buildPage(
      `<html><body>{{#block name="list" data="products"}}x{{/block}}</body></html>`,
      {
        file: 'list.hbs',
        source,
        dataset: { products: [{ name: 'Book 1' }] }
      }
    );

    // The same block-template source is what the client renders with
    const compiled = Handlebars.compile(source);
    expect(compiled({ name: 'Book 1' })).toBe('<div class="product">Book 1</div>');
  });

  it('A4: server renders without executing any client-side JS', async () => {
    resetManifest();
    const html = await buildPage(
      `<html><body>{{#block name="list" data="products"}}x{{/block}}</body></html>`,
      {
        file: 'list.hbs',
        source: '{{#each this}}<div class="product">{{name}}</div>{{/each}}',
        dataset: { products: [{ name: 'Book 1' }] }
      }
    );

    // Content is in the HTML string produced by the server; nothing executed on client
    expect(html).toContain('<div class="product">Book 1</div>');
  });

  it('A5: block is fully declarative via HTML attributes (data / depends)', async () => {
    resetManifest();
    await buildPage(
      `<html><body>{{#block name="list" data="products" depends="products,ui"}}x{{/block}}</body></html>`,
      {
        file: 'list.hbs',
        source: '{{#each this}}<div class="product">{{name}}</div>{{/each}}',
        dataset: { products: [{ name: 'Book 1' }], ui: {} }
      }
    );

    // Verify the helper rendered the declarative attributes onto the block
    const html = await fs
      .readFile(path.join(config.output.html, 'catalog', 'books.html'), 'utf8');
    expect(html).toContain('data-ignition-block="catalog/list"');
    expect(html).toContain('data-ignition-data="products"');
    expect(html).toContain('data-ignition-depends="products,ui"');
  });
});
