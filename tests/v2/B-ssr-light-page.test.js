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
 * B. SSR и лёгкая страница
 */
describe('B. SSR и лёгкая страница', () => {
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
    tmpDir = await fs.mkdtemp(path.join(projectRoot, 'tmp', 'ignition-v2-b-'));
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

  it('B1: автоблоки заполнены сервером; пусты только при отсутствии данных', async () => {
    const templatesDir = config.source.templates;
    await fs.mkdir(path.join(templatesDir, 'b1'), { recursive: true });

    const layout = `<!DOCTYPE html>
<html><body>
  {{> b1/list items}}
</body></html>`;

    const partial = `{{#each this}}<div>{{name}}</div>{{/each}}`;

    await fs.writeFile(path.join(templatesDir, 'b1.hbs'), layout);
    await fs.writeFile(path.join(templatesDir, 'b1', 'list.hbs'), partial);

    const data = {
      items: [{ name: 'X' }],
      layout: 'b1',
      dataset: 'main',
    };

    const outputDir = path.join(config.output.html, 'b1');
    await renderTemplate(path.join(templatesDir, 'b1.hbs'), data, outputDir, 'main', 'b1');

    const html = await fs.readFile(path.join(outputDir, 'main.html'), 'utf8');

    expect(html).toContain('<div>X</div>');
  });

  it('B2: чисто блочная страница → компактный initialData', async () => {
    const templatesDir = config.source.templates;
    await fs.mkdir(path.join(templatesDir, 'b2'), { recursive: true });

    const layout = `<!DOCTYPE html>
<html>
<head><script>window.__IGNITION_INITIAL_DATA__ = {{{initialData}}};</script></head>
<body>
  {{> b2/list items}}
</body></html>`;

    const partial = `{{#each this}}<div>{{name}}</div>{{/each}}`;

    await fs.writeFile(path.join(templatesDir, 'b2.hbs'), layout);
    await fs.writeFile(path.join(templatesDir, 'b2', 'list.hbs'), partial);

    const data = {
      items: [{ name: 'X' }],
      unused: { big: [1, 2, 3, 4, 5] },
      layout: 'b2',
      dataset: 'main',
    };

    const outputDir = path.join(config.output.html, 'b2');
    await renderTemplate(path.join(templatesDir, 'b2.hbs'), data, outputDir, 'main', 'b2');

    const html = await fs.readFile(path.join(outputDir, 'main.html'), 'utf8');

    const match = html.match(/__IGNITION_INITIAL_DATA__\s*=\s*(\{[\s\S]*?\});/);
    expect(match).not.toBeNull();
    const initialData = JSON.parse(match[1]);

    // Compact: only items, not unused
    expect(initialData.items).toBeDefined();
    expect(initialData.unused).toBeUndefined();
  });

  it('B2: страница с автобиндингами → полный датасет', async () => {
    const templatesDir = config.source.templates;
    await fs.mkdir(path.join(templatesDir, 'b2b'), { recursive: true });

    const layout = `<!DOCTYPE html>
<html>
<head><script>window.__IGNITION_INITIAL_DATA__ = {{{initialData}}};</script></head>
<body>
  <input value="{{form.name}}">
  {{> b2b/list items}}
</body></html>`;

    const partial = `{{#each this}}<div>{{name}}</div>{{/each}}`;

    await fs.writeFile(path.join(templatesDir, 'b2b.hbs'), layout);
    await fs.writeFile(path.join(templatesDir, 'b2b', 'list.hbs'), partial);

    const data = {
      form: { name: '' },
      items: [{ name: 'X' }],
      unused: { big: [1, 2, 3, 4, 5] },
      layout: 'b2b',
      dataset: 'main',
    };

    const outputDir = path.join(config.output.html, 'b2b');
    await renderTemplate(path.join(templatesDir, 'b2b.hbs'), data, outputDir, 'main', 'b2b');

    const html = await fs.readFile(path.join(outputDir, 'main.html'), 'utf8');

    const match = html.match(/__IGNITION_INITIAL_DATA__\s*=\s*(\{[\s\S]*?\});/);
    expect(match).not.toBeNull();
    const initialData = JSON.parse(match[1]);

    // Full dataset because of autobinding
    expect(initialData.form).toBeDefined();
    expect(initialData.items).toBeDefined();
    expect(initialData.unused).toBeDefined();
  });

  it('B3: preload полного датасета инжектится неблокирующе', async () => {
    const templatesDir = config.source.templates;
    await fs.mkdir(path.join(templatesDir, 'b3'), { recursive: true });

    const layout = `<!DOCTYPE html>
<html>
<head><script>window.__IGNITION_INITIAL_DATA__ = {{{initialData}}};</script></head>
<body>
  {{> b3/list items}}
</body></html>`;

    const partial = `{{#each this}}<div>{{name}}</div>{{/each}}`;

    await fs.writeFile(path.join(templatesDir, 'b3.hbs'), layout);
    await fs.writeFile(path.join(templatesDir, 'b3', 'list.hbs'), partial);

    const data = {
      items: [{ name: 'X' }],
      layout: 'b3',
      dataset: 'main',
    };

    const outputDir = path.join(config.output.html, 'b3');
    await renderTemplate(path.join(templatesDir, 'b3.hbs'), data, outputDir, 'main', 'b3');

    const html = await fs.readFile(path.join(outputDir, 'main.html'), 'utf8');

    expect(html).toContain('<link rel="preload" href="/data/b3/main.json" as="fetch" crossorigin="anonymous">');
    const headClose = html.indexOf('</head>');
    const linkPos = html.indexOf('rel="preload"');
    expect(linkPos).toBeLessThan(headClose);
  });
});
