import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import config from '../../engine/config/default.js';
import { renderTemplate, _clearTemplateCache } from '../../engine/core/renderer.js';
import { resetManifest } from '../../engine/core/helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..', '..');

/**
 * Container auto-block: a partial whose root {{#each}} body is a NESTED
 * PARTIAL CALL (not inline fields) has no fine coverage, so it used to get
 * depends="" — the block subscribed to nothing and never re-rendered.
 * The block must depend on the each collection (structural changes like
 * push re-render it).
 */
describe('A. Container auto-block (each body = nested partial call)', () => {
  let tmpDir;
  let originalConfig;

  beforeAll(() => {
    originalConfig = { source: { ...config.source }, output: { ...config.output } };
  });

  afterAll(() => {
    config.source = originalConfig.source;
  });

  beforeEach(async () => {
    resetManifest();
    _clearTemplateCache();
    tmpDir = path.join(projectRoot, 'tmp', `ignition-container-${Date.now()}`);
    await fs.mkdir(path.join(tmpDir, 'templates', 'cat'), { recursive: true });
    await fs.mkdir(path.join(tmpDir, 'out'), { recursive: true });
    config.source.templates = path.join(tmpDir, 'templates');
    config.output.html = path.join(tmpDir, 'out');
    config.output.data = path.join(tmpDir, 'out', 'data');
    config.output.templates = path.join(tmpDir, 'out', 'templates');
    config.output.assets = path.join(tmpDir, 'out', 'assets');
  });

  it('block depends on the each collection when the body is a partial call', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'templates', 'cat.hbs'),
      '<html><body>{{> cat/list}}</body></html>'
    );
    await fs.writeFile(
      path.join(tmpDir, 'templates', 'cat', 'list.hbs'),
      '{{#each items}}{{> cat/row}}{{/each}}'
    );
    await fs.writeFile(
      path.join(tmpDir, 'templates', 'cat', 'row.hbs'),
      '<div class="row">{{name}}</div>'
    );

    const ok = await renderTemplate(
      path.join(tmpDir, 'templates', 'cat.hbs'),
      { layout: 'cat', dataset: 'app' },
      path.join(tmpDir, 'out'),
      'app',
      'cat'
    );
    expect(ok).toBe(true);

    const html = await fs.readFile(path.join(tmpDir, 'out', 'app.html'), 'utf8');
    expect(html).toContain('data-ignition-block="cat/list"');
    expect(html).toContain('data-ignition-depends="items"');
  });

  it('inline-field lists keep their fine-grained depends (coverage wins)', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'templates', 'cat.hbs'),
      '<html><body>{{> cat/list}}</body></html>'
    );
    await fs.writeFile(
      path.join(tmpDir, 'templates', 'cat', 'list.hbs'),
      '{{#each items}}<div class="row">{{name}}</div>{{/each}}'
    );

    await renderTemplate(
      path.join(tmpDir, 'templates', 'cat.hbs'),
      { layout: 'cat', dataset: 'app2' },
      path.join(tmpDir, 'out'),
      'app2',
      'cat'
    );

    const html = await fs.readFile(path.join(tmpDir, 'out', 'app2.html'), 'utf8');
    expect(html).toMatch(/data-ignition-depends="[^"]*items[^"]*"/);
  });

  it('explicit depends in a wrap block are not clobbered', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'templates', 'cat.hbs'),
      '<html><body>{{#block name="cat/list" data="items" depends="items, extra"}}{{/block}}</body></html>'
    );

    await renderTemplate(
      path.join(tmpDir, 'templates', 'cat.hbs'),
      { layout: 'cat', dataset: 'app3' },
      path.join(tmpDir, 'out'),
      'app3',
      'cat'
    );

    const html = await fs.readFile(path.join(tmpDir, 'out', 'app3.html'), 'utf8');
    expect(html).toContain('data-ignition-depends="items, extra"');
  });
});
