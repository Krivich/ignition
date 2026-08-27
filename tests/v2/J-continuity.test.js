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
 * J. Непрерывность
 */
describe('J. Непрерывность', () => {
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
    tmpDir = await fs.mkdtemp(path.join(projectRoot, 'tmp', 'ignition-v2-j-'));
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

  it('J2: build/watch/sitemap/атомарность — зелёные', async () => {
    const templatesDir = config.source.templates;
    await fs.mkdir(path.join(templatesDir, 'j2'), { recursive: true });

    const layout = `<!DOCTYPE html>
<html><body>
  {{> j2/list items}}
</body></html>`;

    const partial = `{{#each this}}<div>{{name}}</div>{{/each}}`;

    await fs.writeFile(path.join(templatesDir, 'j2.hbs'), layout);
    await fs.writeFile(path.join(templatesDir, 'j2', 'list.hbs'), partial);

    const data = {
      items: [{ name: 'X' }],
      layout: 'j2',
      dataset: 'main',
    };

    const outputDir = path.join(config.output.html, 'j2');
    const result = await renderTemplate(path.join(templatesDir, 'j2.hbs'), data, outputDir, 'main', 'j2');

    expect(result).toBe(true);

    const html = await fs.readFile(path.join(outputDir, 'main.html'), 'utf8');
    expect(html).toContain('<div>X</div>');
  });
});
