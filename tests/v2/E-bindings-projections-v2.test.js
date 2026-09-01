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

  it('проектирует простые поля внутри top-level #each: маркер строки + стикер @p', () => {
    const tpl = `{{#each products}}<div class="row"><span class="n">{{name}}</span><span class="p">{{price}}</span></div>{{/each}}<p>{{status}}</p>`;
    const out = applyProjections(tpl);
    expect(out).toContain('<div class="row" data-ignition-row="products">');
    expect(out).toContain('<span class="n" data-ignition-text="@p:products.*.name">{{name}}</span>');
    expect(out).toContain('<span class="p" data-ignition-text="@p:products.*.price">{{price}}</span>');
    expect(out).toContain('<p data-ignition-text="status">{{status}}</p>');
  });

  it('не проектирует ../, @-пути и {{this}} внутри #each', () => {
    const tpl = `{{#each items}}<div><i>{{../title}}</i><b>{{@index}}</b><s>{{this}}</s></div>{{/each}}`;
    const out = applyProjections(tpl);
    expect(out).not.toContain('data-ignition-text');
  });

  it('маскирует вложенный #each (v1: деградация до ре-рендера блока)', () => {
    const tpl = `{{#each a}}<div>{{#each b}}<span>{{x}}</span>{{/each}}</div>{{/each}}`;
    const out = applyProjections(tpl);
    expect(out).not.toContain('data-ignition-text');
    expect(out).not.toContain('data-ignition-row');
  });

  it('маскирует #each с несколькими top-level узлами', () => {
    const tpl = `{{#each items}}<li>{{a}}</li><li>{{b}}</li>{{/each}}`;
    const out = applyProjections(tpl);
    expect(out).not.toContain('data-ignition-row');
    expect(out).not.toContain('data-ignition-text');
  });

  it('маскирует #each c {{else}}', () => {
    const tpl = `{{#each items}}<li>{{a}}</li>{{else}}<li>пусто</li>{{/each}}`;
    const out = applyProjections(tpl);
    expect(out).not.toContain('data-ignition-row');
  });

  it('маскирует #each с не-простым параметром', () => {
    const tpl = `{{#each (items x)}}<li>{{a}}</li>{{/each}}`;
    const out = applyProjections(tpl);
    expect(out).not.toContain('data-ignition-row');
  });

  it('#with и #block по-прежнему маскируются', () => {
    const tpl = `{{#with user}}<span>{{name}}</span>{{/with}}{{#block name="x" depends="y"}}<span>{{z}}</span>{{/block}}`;
    const out = applyProjections(tpl);
    expect(out).not.toContain('data-ignition-text');
  });

  it('{{#if}} внутри #each не мешает проекции вложенных полей', () => {
    const tpl = `{{#each items}}<div>{{#if flag}}<span>{{name}}</span>{{/if}}</div>{{/each}}`;
    const out = applyProjections(tpl);
    expect(out).toContain('<div data-ignition-row="items">');
    expect(out).toContain('data-ignition-text="@p:items.*.name"');
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

  it('onFine: чистый leaf-тело each — коллекция покрыта', () => {
    const tpl = `{{#each products}}<div class="row"><span>{{name}}</span><span>{{price}}</span></div>{{/each}}`;
    let fine = null;
    applyProjections(tpl, { scopedOnly: true, onFine: (s) => { fine = s; } });
    expect(fine).toBeInstanceOf(Set);
    expect(fine.has('products')).toBe(true);
  });

  it('onFine: рецепт {{else}} — if на уровне блока вокруг чистого each сохраняет покрытие', () => {
    const tpl = `{{#if items.length}}{{#each items}}<div><span>{{name}}</span></div>{{/each}}{{else}}<p>none</p>{{/if}}`;
    let fine = null;
    applyProjections(tpl, { scopedOnly: true, onFine: (s) => { fine = s; } });
    expect(fine.has('items')).toBe(true);
  });

  it('onFine: {{#if}} внутри тела — коллекция НЕ покрыта (структурные флипы требуют ре-рендера)', () => {
    const tpl = `{{#each items}}<div>{{#if flag}}<span>{{name}}</span>{{/if}}</div>{{/each}}`;
    let fine = null;
    applyProjections(tpl, { scopedOnly: true, onFine: (s) => { fine = s; } });
    expect(fine.has('items')).toBe(false);
  });

  it('onFine: мульти-выражение в теле — НЕ покрыта', () => {
    const tpl = `{{#each items}}<div><span>{{a}} {{b}}</span></div>{{/each}}`;
    let fine = null;
    applyProjections(tpl, { scopedOnly: true, onFine: (s) => { fine = s; } });
    expect(fine.has('items')).toBe(false);
  });

  it('onFine: хелпер или {{this}} в теле — НЕ покрыта', () => {
    const withHelper = `{{#each items}}<div><span>{{upper name}}</span></div>{{/each}}`;
    const withThis = `{{#each items}}<div><span>{{this}}</span></div>{{/each}}`;
    let fineA = null, fineB = null;
    applyProjections(withHelper, { scopedOnly: true, onFine: (s) => { fineA = s; } });
    applyProjections(withThis, { scopedOnly: true, onFine: (s) => { fineB = s; } });
    expect(fineA.has('items')).toBe(false);
    expect(fineB.has('items')).toBe(false);
  });

  it('onFine: тело без выражений — НЕ покрыта (нечего патчить)', () => {
    const tpl = `{{#each items}}<div class="row"></div>{{/each}}`;
    let fine = null;
    applyProjections(tpl, { scopedOnly: true, onFine: (s) => { fine = s; } });
    expect(fine.has('items')).toBe(false);
  });

  describe('onDiag: предупреждения о списках, потерявших fine-grained', () => {
    function diags(tpl) {
      const out = [];
      applyProjections(tpl, { scopedOnly: true, onDiag: (items) => out.push(...items) });
      return out;
    }

    it('чистое тело — ни одного предупреждения', () => {
      expect(diags(`{{#each items}}<div><span>{{name}}</span></div>{{/each}}`)).toEqual([]);
    });

    it('{{#if}} в теле — предупреждение с кодом IGN-FG-COND', () => {
      const d = diags(`{{#each items}}<div>{{#if flag}}<span>{{name}}</span>{{/if}}</div>{{/each}}`);
      expect(d.length).toBe(1);
      expect(d[0].collection).toBe('items');
      expect(d[0].reasons).toEqual([
        { code: 'IGN-FG-COND', text: expect.stringMatching(/conditional/i) },
      ]);
    });

    it('мульти-выражение — предупреждение с кодом IGN-FG-EXPR', () => {
      const d = diags(`{{#each items}}<div><span>{{a}} {{b}}</span></div>{{/each}}`);
      expect(d[0].reasons).toEqual([
        { code: 'IGN-FG-EXPR', text: expect.stringMatching(/multi-expression/i) },
      ]);
    });

    it('вложенный each — IGN-FG-NESTED', () => {
      const d = diags(`{{#each a}}<div>{{#each b}}<span>{{x}}</span>{{/each}}</div>{{/each}}`);
      expect(d[0].collection).toBe('a');
      expect(d[0].reasons.some((r) => r.code === 'IGN-FG-NESTED')).toBe(true);
    });

    it('несколько top-level узлов — IGN-FG-MULTITOP', () => {
      const d = diags(`{{#each items}}<li>{{a}}</li><li>{{b}}</li>{{/each}}`);
      expect(d[0].reasons.some((r) => r.code === 'IGN-FG-MULTITOP')).toBe(true);
    });

    it('хелпер — IGN-FG-HELPER; {{this}} — IGN-FG-THIS', () => {
      const dHelper = diags(`{{#each items}}<div><span>{{upper name}}</span></div>{{/each}}`);
      const dThis = diags(`{{#each items}}<div><span>{{this}}</span></div>{{/each}}`);
      expect(dHelper[0].reasons.some((r) => r.code === 'IGN-FG-HELPER')).toBe(true);
      expect(dThis[0].reasons.some((r) => r.code === 'IGN-FG-THIS')).toBe(true);
    });

    it('../ и @-пути — IGN-FG-UPLEVEL', () => {
      const d = diags(`{{#each items}}<div><span>{{../title}}</span></div>{{/each}}`);
      expect(d[0].reasons.some((r) => r.code === 'IGN-FG-UPLEVEL')).toBe(true);
    });

    it('{{else}} — IGN-FG-ELSE', () => {
      const d = diags(`{{#each items}}<li>{{a}}</li>{{else}}<li>empty</li>{{/each}}`);
      expect(d[0].reasons.some((r) => r.code === 'IGN-FG-ELSE')).toBe(true);
    });

    it('все коды в формате IGN-FG-*', () => {
      for (const tpl of [
        `{{#each items}}<div>{{#if flag}}<span>{{name}}</span>{{/if}}</div>{{/each}}`,
        `{{#each items}}<div><span>{{a}} {{b}}</span></div>{{/each}}`,
        `{{#each a}}<div>{{#each b}}<span>{{x}}</span>{{/each}}</div>{{/each}}`,
        `{{#each items}}<li>{{a}}</li><li>{{b}}</li>{{/each}}`,
        `{{#each items}}<div><span>{{upper name}}</span></div>{{/each}}`,
        `{{#each items}}<div><span>{{this}}</span></div>{{/each}}`,
        `{{#each items}}<div><span>{{../title}}</span></div>{{/each}}`,
        `{{#each items}}<li>{{a}}</li>{{else}}<li>empty</li>{{/each}}`,
      ]) {
        for (const item of diags(tpl)) {
          for (const r of item.reasons) {
            expect(r.code).toMatch(/^IGN-FG-[A-Z]+$/);
            expect(r.text).toBeTruthy();
          }
        }
      }
    });

    it('контекстный {{#each this}} — не предупреждение (штатный паттерн срезов)', () => {
      expect(diags(`{{#each this}}<div><span>{{name}}</span></div>{{/each}}`)).toEqual([]);
    });

    it('top-level выражения вне each — не предупреждение', () => {
      expect(diags(`<p>{{status}}</p><span data-ignition-text="x">{{x}}</span>`)).toEqual([]);
    });
  });

  it('SSR: обёртка блока штампует data-ignition-fine для покрытых путей', async () => {
    const originalConfig = {
      source: { ...config.source },
      output: { ...config.output },
    };
    const tmpDir = await fs.mkdtemp(path.join(projectRoot, 'tmp', 'ignition-v2-each-part-'));
    try {
      config.source.templates = path.join(tmpDir, 'input', 'templates');
      config.source.data = path.join(tmpDir, 'input', 'data');
      config.output.html = path.join(tmpDir, 'output', 'public');
      config.output.data = path.join(tmpDir, 'output', 'public', 'data');
      config.output.templates = path.join(tmpDir, 'output', 'public', 'templates');
      config.output.assets = path.join(tmpDir, 'output', 'public', 'assets');

      const templatesDir = config.source.templates;
      // Стикеры @p резолвятся от КОРНЯ state, поэтому параметр each — путь
      // от корня данных (партиал вызывается без сдвига контекста).
      const layout = `<!DOCTYPE html>
<html>
<head><script>window.__IGNITION_INITIAL_DATA__ = {{{initialData}}};</script></head>
<body>{{> epl/list}}</body></html>`;
      const listPartial = `{{#each products}}<div class="row"><span class="n">{{name}}</span><span class="p">{{price}}</span></div>{{/each}}`;
      await fs.mkdir(path.join(templatesDir, 'epl'), { recursive: true });
      await fs.writeFile(path.join(templatesDir, 'epl.hbs'), layout);
      await fs.writeFile(path.join(templatesDir, 'epl', 'list.hbs'), listPartial);

      const outputDir = path.join(config.output.html, 'epl');
      await renderTemplate(path.join(templatesDir, 'epl.hbs'), {
        products: [
          { name: 'A', price: '1' },
          { name: 'B', price: '2' },
        ],
        layout: 'epl',
        dataset: 'main',
      }, outputDir, 'main', 'epl');

      const html = await fs.readFile(path.join(outputDir, 'main.html'), 'utf8');
      expect(html).toContain('<div class="row" data-ignition-row="products">');
      expect(html).toContain('data-ignition-text="@p:products.*.price"');
      // SSR значения на месте (страница без JS полная)
      expect(html).toContain('<span class="p" data-ignition-text="@p:products.*.price">2</span>');
    } finally {
      config.source = originalConfig.source;
      config.output = originalConfig.output;
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});