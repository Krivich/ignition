// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { createReactiveState } from '../../engine/core/runtime/state.js';
import { initBinding } from '../../engine/core/runtime/binding.js';
import { applyProjections } from '../../engine/core/compiler.js';
import config from '../../engine/config/default.js';
import { renderTemplate } from '../../engine/core/renderer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..', '..');

/**
 * E. Биндинги и проекции (v2: автобиндинги)
 * 
 * v2: автобиндинги через value="{{path}}" и checked="{{path}}"
 * Точечные проекции: data-ignition-text, data-ignition-class, data-ignition-attr-*
 */
describe('E. Биндинги и проекции (v2)', () => {
  let state;

  beforeEach(() => {
    state = createReactiveState({
      form: { name: '', agree: false },
      ui: { active: false, count: 5 },
    });
  });

  afterEach(() => {
  });

  it('E1: input value="{{path}}": ввод пишет в стейт', () => {
    const input = document.createElement('input');
    input.setAttribute('value', '{{form.name}}');
    input.setAttribute('data-ignition-path', 'form.name');
    document.body.appendChild(input);

    initBinding(state, input);

    input.value = 'test';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(state.form.name).toBe('test');
  });

  it('E1: программная мутация пишет в элемент без прыжка курсора', () => {
    const input = document.createElement('input');
    input.setAttribute('value', '{{form.name}}');
    input.setAttribute('data-ignition-path', 'form.name');
    document.body.appendChild(input);

    initBinding(state, input);

    state.form.name = 'updated';
    expect(input.value).toBe('updated');
  });

  it('E2: checkbox checked="{{path}}" (boolean)', () => {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.setAttribute('checked', '{{form.agree}}');
    checkbox.setAttribute('data-ignition-path', 'form.agree');
    document.body.appendChild(checkbox);

    initBinding(state, checkbox);

    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));

    expect(state.form.agree).toBe(true);
  });

  it('E5: data-ignition-text обновляется точечно', () => {
    const span = document.createElement('span');
    span.setAttribute('data-ignition-text', 'ui.count');
    document.body.appendChild(span);

    initBinding(state, span);

    expect(span.textContent).toBe('5');

    state.ui.count = 10;
    expect(span.textContent).toBe('10');
  });

  it('E5: data-ignition-class обновляется точечно', () => {
    const div = document.createElement('div');
    div.setAttribute('data-ignition-class', 'is-active: ui.active');
    document.body.appendChild(div);

    initBinding(state, div);

    expect(div.classList.contains('is-active')).toBe(false);

    state.ui.active = true;
    expect(div.classList.contains('is-active')).toBe(true);
  });

  it('E5: data-ignition-attr-* обновляется точечно', () => {
    const button = document.createElement('button');
    button.setAttribute('data-ignition-attr-disabled', '!ui.active');
    document.body.appendChild(button);

    initBinding(state, button);

    expect(button.disabled).toBe(true);

    state.ui.active = true;
    expect(button.disabled).toBe(false);
  });
});

describe('E5/E6: автопроекции (data-ignition-text из {{expr}} в теле)', () => {
  let state;

  beforeEach(() => {
    state = createReactiveState({ ui: { count: 5 } });
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('компилятор генерирует data-ignition-text для {{expr}} в теле', () => {
    const out = applyProjections('<span>{{ui.count}}</span>');
    expect(out).toContain('data-ignition-text="ui.count"');
    expect(out).toContain('{{ui.count}}');
  });

  it('не трогает relative-пути внутри #each/#with/#block', () => {
    const tpl = `{{#each products}}<div>{{name}}</div>{{/each}}<p>{{status}}</p>`;
    const out = applyProjections(tpl);
    expect(out).toContain('<div>{{name}}</div>');
    expect(out).not.toContain('data-ignition-text="name"');
    expect(out).toContain('<p data-ignition-text="status">{{status}}</p>');
  });

  it('не дублирует существующий data-ignition-text и не трогает title/textarea/script', () => {
    const tpl = `<span data-ignition-text="ui.count">{{ui.count}}</span><title>{{title}}</title><textarea>{{desc}}</textarea>`;
    const out = applyProjections(tpl);
    expect((out.match(/data-ignition-text="ui.count"/g) || []).length).toBe(1);
    expect(out.match(/<title[^>]*>/)[0]).not.toContain('data-ignition-text');
    expect(out.match(/<textarea[^>]*>/)[0]).not.toContain('data-ignition-text');
  });

  it('рантайм обновляет автопроецированный текст точечно (E5)', () => {
    const span = document.createElement('span');
    span.setAttribute('data-ignition-text', 'ui.count');
    span.textContent = '5';
    document.body.appendChild(span);

    initBinding(state, span);

    expect(span.textContent).toBe('5');
    state.ui.count = 10;
    expect(span.textContent).toBe('10');
  });

  it('SSR заполняет {{expr}} значением, а компилятор достраивает атрибут (E6)', async () => {
    const originalConfig = {
      source: { ...config.source },
      output: { ...config.output },
    };
    const tmpDir = await fs.mkdtemp(path.join(projectRoot, 'tmp', 'ignition-v2-e6-'));
    try {
      config.source.templates = path.join(tmpDir, 'input', 'templates');
      config.source.data = path.join(tmpDir, 'input', 'data');
      config.output.html = path.join(tmpDir, 'output', 'public');
      config.output.data = path.join(tmpDir, 'output', 'public', 'data');
      config.output.templates = path.join(tmpDir, 'output', 'public', 'templates');
      config.output.assets = path.join(tmpDir, 'output', 'public', 'assets');

      const templatesDir = config.source.templates;
      const layout = `<!DOCTYPE html>
<html>
<head><script>window.__IGNITION_INITIAL_DATA__ = {{{initialData}}};</script></head>
<body>
  <span class="counter">{{ui.count}}</span>
</body></html>`;
      await fs.mkdir(templatesDir, { recursive: true });
      await fs.writeFile(path.join(templatesDir, 'e6.hbs'), layout);

      const outputDir = path.join(config.output.html, 'e6');
      await renderTemplate(path.join(templatesDir, 'e6.hbs'), {
        ui: { count: 5 },
        layout: 'e6',
        dataset: 'main',
      }, outputDir, 'main', 'e6');

      const html = await fs.readFile(path.join(outputDir, 'main.html'), 'utf8');

      // SSR value present in the tag body (no-JS page complete, E6)
      expect(html).toMatch(/<span class="counter" data-ignition-text="ui.count">5<\/span>/);
    } finally {
      config.source = originalConfig.source;
      config.output = originalConfig.output;
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('SSR→CSR: text-only страница не затирает SSR-текст и реактивна (регрессия)', async () => {
    const originalConfig = {
      source: { ...config.source },
      output: { ...config.output },
    };
    const tmpDir = await fs.mkdtemp(path.join(projectRoot, 'tmp', 'ignition-v2-text-ssr-csr-'));
    try {
      config.source.templates = path.join(tmpDir, 'input', 'templates');
      config.source.data = path.join(tmpDir, 'input', 'data');
      config.output.html = path.join(tmpDir, 'output', 'public');
      config.output.data = path.join(tmpDir, 'output', 'public', 'data');
      config.output.templates = path.join(tmpDir, 'output', 'public', 'templates');
      config.output.assets = path.join(tmpDir, 'output', 'public', 'assets');

      const templatesDir = config.source.templates;
      // Только text-projection: нет блоков, биндингов, class/attr-проекций.
      const layout = `<!DOCTYPE html>
<html>
<head><script>window.__IGNITION_INITIAL_DATA__ = {{{initialData}}};</script></head>
<body>
  <span class="counter">{{ui.count}}</span>
  <p class="title">{{title}}</p>
</body></html>`;
      await fs.mkdir(templatesDir, { recursive: true });
      await fs.writeFile(path.join(templatesDir, 'text.hbs'), layout);

      const outputDir = path.join(config.output.html, 'text');
      await renderTemplate(path.join(templatesDir, 'text.hbs'), {
        ui: { count: 5 },
        title: 'Привет',
        layout: 'text',
        dataset: 'main',
      }, outputDir, 'main', 'text');

      const html = await fs.readFile(path.join(outputDir, 'main.html'), 'utf8');

      // Компактный initialData должен включать пути text-проекций.
      const match = html.match(/__IGNITION_INITIAL_DATA__ = (\{.*?\});/s);
      expect(match).toBeTruthy();
      const initialData = JSON.parse(match[1]);
      expect(initialData).toHaveProperty('ui.count', 5);
      expect(initialData).toHaveProperty('title', 'Привет');

      // Загружаем серверный HTML в DOM (гидрация куска без рантайма).
      document.body.innerHTML = '<span class="counter" data-ignition-text="ui.count">5</span>' +
        '<p class="title" data-ignition-text="title">Привет</p>';

      // Имитируем boot: state из initialData + processAllBindings.
      const clientState = createReactiveState(initialData);
      document.querySelectorAll('[data-ignition-text]').forEach(el => initBinding(clientState, el));

      // SSR-текст переживает гидрацию — не затёрт пустотой.
      expect(document.querySelector('.counter').textContent).toBe('5');
      expect(document.querySelector('.title').textContent).toBe('Привет');

      // И реактивно обновляется.
      clientState.ui.count = 10;
      expect(document.querySelector('.counter').textContent).toBe('10');
      clientState.title = 'Мир';
      expect(document.querySelector('.title').textContent).toBe('Мир');
    } finally {
      config.source = originalConfig.source;
      config.output = originalConfig.output;
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});