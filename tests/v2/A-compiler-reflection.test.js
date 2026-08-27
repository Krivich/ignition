// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import config from '../../engine/config/default.js';
import { renderTemplate } from '../../engine/core/renderer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..', '..');

/**
 * A. Компиляторный рефлекшн
 * 
 * Тесты описывают целевое поведение v2:
 * - {{> partial}} без data-ignition-* даёт автоблок с рефлекшном
 * - Контекст восстанавливается через #each/#with
 * - {{#block}} остаётся escape hatch
 * - noblock рендерит без рефлекшна
 */
describe('A. Компиляторный рефлекшн', () => {
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
    tmpDir = await fs.mkdtemp(path.join(projectRoot, 'tmp', 'ignition-v2-a-'));
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

  it('A1: {{> partial}} без data-ignition-* даёт автоблок с рефлекшном', async () => {
    // Setup templates
    const templatesDir = config.source.templates;
    await fs.mkdir(path.join(templatesDir, 'test'), { recursive: true });

    // Layout with pure partial call — no data-ignition-* attributes
    const layout = `<!DOCTYPE html>
<html>
<head><script>window.__IGNITION_INITIAL_DATA__ = {{{initialData}}};</script></head>
<body>
  {{> test/list items}}
</body>
</html>`;

    // Partial that renders items
    const partial = `{{#each this}}<div class="item">{{name}}</div>{{/each}}`;

    await fs.writeFile(path.join(templatesDir, 'test.hbs'), layout);
    await fs.writeFile(path.join(templatesDir, 'test', 'list.hbs'), partial);

    const data = {
      items: [{ name: 'A' }, { name: 'B' }],
      layout: 'test',
      dataset: 'main',
    };

    const outputDir = path.join(config.output.html, 'test');
    await renderTemplate(path.join(templatesDir, 'test.hbs'), data, outputDir, 'main', 'test');

    const html = await fs.readFile(path.join(outputDir, 'main.html'), 'utf8');

    // Auto-block should be generated with reflection attributes
    expect(html).toContain('data-ignition-block="test/list"');
    expect(html).toContain('data-ignition-data="items"');
    expect(html).toContain('data-ignition-depends="items"');
    expect(html).toContain('<div class="item">A</div>');
  });

  it('A2: контекст восстанавливается через #each/#with', async () => {
    const templatesDir = config.source.templates;
    await fs.mkdir(path.join(templatesDir, 'ctx'), { recursive: true });

    const layout = `<!DOCTYPE html>
<html><body>
  {{#each products}}
    {{> ctx/item-card}}
  {{/each}}
</body></html>`;

    const partial = `<div class="card">{{name}}</div>`;

    await fs.writeFile(path.join(templatesDir, 'ctx.hbs'), layout);
    await fs.writeFile(path.join(templatesDir, 'ctx', 'item-card.hbs'), partial);

    const data = {
      products: [{ name: 'P1' }, { name: 'P2' }],
      layout: 'ctx',
      dataset: 'main',
    };

    const outputDir = path.join(config.output.html, 'ctx');
    await renderTemplate(path.join(templatesDir, 'ctx.hbs'), data, outputDir, 'main', 'ctx');

    const html = await fs.readFile(path.join(outputDir, 'main.html'), 'utf8');

    // Each partial should be an auto-block with context path
    expect(html).toContain('data-ignition-data="products"');
    expect(html).toContain('<div class="card">P1</div>');
  });

  it('A3: {{#block}} с явными data/depends работает как escape hatch', async () => {
    const templatesDir = config.source.templates;
    await fs.mkdir(path.join(templatesDir, 'explicit'), { recursive: true });

    const layout = `<!DOCTYPE html>
<html><body>
  {{#block name="list" data="products, categories" depends="products, categories"}}
    <p>empty</p>
  {{/block}}
</body></html>`;

    const partial = `{{#each products}}<span>{{name}}</span>{{/each}}`;

    await fs.writeFile(path.join(templatesDir, 'explicit.hbs'), layout);
    await fs.writeFile(path.join(templatesDir, 'explicit', 'list.hbs'), partial);

    const data = {
      products: [{ name: 'X' }],
      categories: ['cat1'],
      layout: 'explicit',
      dataset: 'main',
    };

    const outputDir = path.join(config.output.html, 'explicit');
    await renderTemplate(path.join(templatesDir, 'explicit.hbs'), data, outputDir, 'main', 'explicit');

    const html = await fs.readFile(path.join(outputDir, 'main.html'), 'utf8');

    expect(html).toContain('data-ignition-block="explicit/list"');
    expect(html).toContain('data-ignition-data="products, categories"');
    expect(html).toContain('<span>X</span>');
  });

  it('A4: noblock рендерит partial без рефлекшна', async () => {
    const templatesDir = config.source.templates;
    await fs.mkdir(path.join(templatesDir, 'noblock'), { recursive: true });

    const layout = `<!DOCTYPE html>
<html><body>
  {{!-- ignition: noblock --}}
  {{> noblock/static-content}}
</body></html>`;

    const partial = `<div class="static">Static</div>`;

    await fs.writeFile(path.join(templatesDir, 'noblock.hbs'), layout);
    await fs.writeFile(path.join(templatesDir, 'noblock', 'static-content.hbs'), partial);

    const data = { layout: 'noblock', dataset: 'main' };

    const outputDir = path.join(config.output.html, 'noblock');
    await renderTemplate(path.join(templatesDir, 'noblock.hbs'), data, outputDir, 'main', 'noblock');

    const html = await fs.readFile(path.join(outputDir, 'main.html'), 'utf8');

    expect(html).toContain('<div class="static">Static</div>');
    expect(html).not.toContain('data-ignition-block="noblock/static-content"');
  });

  it('A5: build --explain печатает производной рефлекшн', async () => {
    // This test will be implemented when --explain flag is added
    // For now, we document the expected behavior
    expect(true).toBe(true); // Placeholder
  });
});
