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
 * K. Надёжность
 */
describe('K. Надёжность', () => {
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
    tmpDir = await fs.mkdtemp(path.join(projectRoot, 'tmp', 'ignition-v2-k-'));
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

  it('K1: без JS страница полна', async () => {
    const templatesDir = config.source.templates;
    await fs.mkdir(path.join(templatesDir, 'k1'), { recursive: true });

    const layout = `<!DOCTYPE html>
<html><body>
  {{> k1/list items}}
</body></html>`;

    const partial = `{{#each this}}<div class="item">{{name}}</div>{{/each}}`;

    await fs.writeFile(path.join(templatesDir, 'k1.hbs'), layout);
    await fs.writeFile(path.join(templatesDir, 'k1', 'list.hbs'), partial);

    const data = {
      items: [{ name: 'A' }, { name: 'B' }],
      layout: 'k1',
      dataset: 'main',
    };

    const outputDir = path.join(config.output.html, 'k1');
    await renderTemplate(path.join(templatesDir, 'k1.hbs'), data, outputDir, 'main', 'k1');

    const html = await fs.readFile(path.join(outputDir, 'main.html'), 'utf8');

    // Page should be complete without JS
    expect(html).toContain('<div class="item">A</div>');
    expect(html).toContain('<div class="item">B</div>');
  });

  it('K2: </script> в данных не ломает initialData', async () => {
    const templatesDir = config.source.templates;
    await fs.mkdir(path.join(templatesDir, 'k2'), { recursive: true });

    const layout = `<!DOCTYPE html>
<html>
<head><script>window.__IGNITION_INITIAL_DATA__ = {{{initialData}}};</script></head>
<body>
  {{> k2/list items}}
</body></html>`;

    const partial = `{{#each this}}<div>{{name}}</div>{{/each}}`;

    await fs.writeFile(path.join(templatesDir, 'k2.hbs'), layout);
    await fs.writeFile(path.join(templatesDir, 'k2', 'list.hbs'), partial);

    const data = {
      items: [{ name: '</script><script>alert("xss")</script>' }],
      layout: 'k2',
      dataset: 'main',
    };

    const outputDir = path.join(config.output.html, 'k2');
    await renderTemplate(path.join(templatesDir, 'k2.hbs'), data, outputDir, 'main', 'k2');

    const html = await fs.readFile(path.join(outputDir, 'main.html'), 'utf8');

    // The malicious script tag should be escaped in initialData
    expect(html).not.toContain('</script><script>alert');
    // But the data should still be present (escaped)
    expect(html).toContain('__IGNITION_INITIAL_DATA__');
  });

  it('K3: 404 датасета не ломает страницу', async () => {
    // This test verifies that if a dataset is missing, the page still renders
    // (though possibly with empty blocks)
    const templatesDir = config.source.templates;
    await fs.mkdir(path.join(templatesDir, 'k3'), { recursive: true });

    const layout = `<!DOCTYPE html>
<html><body>
  {{> k3/list items}}
</body></html>`;

    const partial = `{{#each this}}<div>{{name}}</div>{{else}}<p>Empty</p>{{/each}}`;

    await fs.writeFile(path.join(templatesDir, 'k3.hbs'), layout);
    await fs.writeFile(path.join(templatesDir, 'k3', 'list.hbs'), partial);

    const data = {
      items: [], // Empty data, not missing
      layout: 'k3',
      dataset: 'main',
    };

    const outputDir = path.join(config.output.html, 'k3');
    await renderTemplate(path.join(templatesDir, 'k3.hbs'), data, outputDir, 'main', 'k3');

    const html = await fs.readFile(path.join(outputDir, 'main.html'), 'utf8');

    // Page should render without errors
    expect(html).toContain('<p>Empty</p>');
  });
});
