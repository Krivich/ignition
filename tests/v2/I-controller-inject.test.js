import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import config from '../../engine/config/default.js';
import { renderTemplate } from '../../engine/core/renderer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..', '..');

describe('I: Контроллер страницы — автоинжект', () => {
  let originalConfig;
  let tmpDir;

  beforeAll(() => {
    originalConfig = {
      source: { ...config.source },
      output: { ...config.output },
    };
  });

  afterAll(() => {
    config.source = originalConfig.source;
    config.output = originalConfig.output;
  });

  beforeEach(async () => {
    await fs.mkdir(path.join(projectRoot, 'tmp'), { recursive: true });
    tmpDir = await fs.mkdtemp(path.join(projectRoot, 'tmp', 'ignition-ctrl-'));
    config.source.templates = path.join(tmpDir, 'input', 'templates');
    config.source.data = path.join(tmpDir, 'input', 'data');
    config.source.controllers = path.join(tmpDir, 'input', 'controllers');
    config.output.html = path.join(tmpDir, 'output', 'public');
    config.output.data = path.join(tmpDir, 'output', 'public', 'data');
    config.output.templates = path.join(tmpDir, 'output', 'public', 'templates');
    config.output.assets = path.join(tmpDir, 'output', 'public', 'assets');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('контроллер для layout инжектится и копируется, рантайм активен', async () => {
    const templatesDir = config.source.templates;
    await fs.mkdir(templatesDir, { recursive: true });
    await fs.writeFile(
      path.join(templatesDir, 'page.hbs'),
      '<html><body><p>stat</p></body></html>'
    );

    const controllersDir = config.source.controllers;
    await fs.mkdir(controllersDir, { recursive: true });
    await fs.writeFile(
      path.join(controllersDir, 'page.js'),
      'window.ignition.controller(function(state, api) {});'
    );

    await renderTemplate(path.join(templatesDir, 'page.hbs'), {}, path.join(config.output.html, 'page'), 'main', 'page');

    const html = await fs.readFile(path.join(config.output.html, 'page', 'main.html'), 'utf8');
    expect(html).toContain('<script src="/assets/controllers/page.js"></script>');
    expect(html).toContain('ignition-runtime.js');
    expect(html).toContain('__IGNITION_INITIAL_DATA__');

    const copied = await fs.readFile(path.join(config.output.assets, 'controllers', 'page.js'), 'utf8');
    expect(copied).toContain('window.ignition.controller');
  });

  it('контроллер отсутствует → страница остаётся статикой без рантайма', async () => {
    const templatesDir = config.source.templates;
    await fs.mkdir(templatesDir, { recursive: true });
    await fs.writeFile(
      path.join(templatesDir, 'page.hbs'),
      '<html><body><p>stat</p></body></html>'
    );

    await renderTemplate(path.join(templatesDir, 'page.hbs'), {}, path.join(config.output.html, 'page'), 'main', 'page');

    const html = await fs.readFile(path.join(config.output.html, 'page', 'main.html'), 'utf8');
    expect(html).not.toContain('ignition-runtime.js');
    expect(html).not.toContain('__IGNITION_INITIAL_DATA__');
  });
});
