// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { createReactiveState } from '../../engine/core/runtime/state.js';
import {
  initBinding,
  initBlocks
} from '../../engine/core/runtime/binding.js';
import { registerTemplate, resetRegistry } from '../../engine/core/runtime/render.js';

describe('ignition — привязки и обработчики', () => {

  afterEach(() => {
    resetRegistry();
  });

  describe('двусторонняя привязка', () => {
    let state;

    beforeEach(() => {
      state = createReactiveState({
        ui: { searchQuery: '', activeCategory: 'all' }
      });
    });

    it('input → state: ввод мутирует state', () => {
      const input = document.createElement('input');
      input.setAttribute('data-ignition-binding', 'ui.searchQuery');
      document.body.appendChild(input);
      initBinding(state, input);
      input.value = 'тест';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      expect(state.ui.searchQuery).toBe('тест');
    });

    it('state → input: изменение state обновляет input value', () => {
      const input = document.createElement('input');
      input.setAttribute('data-ignition-binding', 'ui.searchQuery');
      document.body.appendChild(input);
      initBinding(state, input);
      state.ui.searchQuery = 'обновлено';
      expect(input.value).toBe('обновлено');
    });

    it('state → input: каретка не сбрасывается при синхронизации', () => {
      const input = document.createElement('input');
      input.setAttribute('data-ignition-binding', 'ui.searchQuery');
      document.body.appendChild(input);
      initBinding(state, input);
      input.value = 'hello';
      // Пользователь поставил каретку в середину.
      input.setSelectionRange(2, 2);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      // Синхронизация state → element не должна сбросить позицию каретки к концу.
      expect(state.ui.searchQuery).toBe('hello');
      expect(input.selectionStart).toBe(2);
    });

    it('select → state: селект мутирует state', () => {
      const select = document.createElement('select');
      select.setAttribute('data-ignition-binding', 'ui.activeCategory');
      const opt1 = document.createElement('option');
      opt1.value = 'all';
      const opt2 = document.createElement('option');
      opt2.value = 'electronics';
      select.appendChild(opt1);
      select.appendChild(opt2);
      document.body.appendChild(select);
      initBinding(state, select);
      select.value = 'electronics';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      expect(state.ui.activeCategory).toBe('electronics');
    });

    it('textarea → state: текстареа мутирует state', () => {
      state.form = { fields: { message: '' } };
      const textarea = document.createElement('textarea');
      textarea.setAttribute('data-ignition-binding', 'form.fields.message');
      document.body.appendChild(textarea);
      initBinding(state, textarea);
      textarea.value = 'Привет мир';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      expect(state.form.fields.message).toBe('Привет мир');
    });

    it('checkbox → state: checked мутирует boolean', () => {
      state.form = { consent: false };
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.setAttribute('data-ignition-binding', 'form.consent');
      document.body.appendChild(checkbox);
      initBinding(state, checkbox);
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
      expect(state.form.consent).toBe(true);
    });

    it('checkbox → state: unchecked ставит false', () => {
      state.form = { consent: true };
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.setAttribute('data-ignition-binding', 'form.consent');
      document.body.appendChild(checkbox);
      initBinding(state, checkbox);
      checkbox.checked = false;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
      expect(state.form.consent).toBe(false);
    });

    it('state → checkbox: изменение state обновляет checked', () => {
      state.form = { consent: false };
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.setAttribute('data-ignition-binding', 'form.consent');
      document.body.appendChild(checkbox);
      initBinding(state, checkbox);
      state.form.consent = true;
      expect(checkbox.checked).toBe(true);
    });

    it('checkbox начальное значение из state', () => {
      state.form = { consent: true };
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.setAttribute('data-ignition-binding', 'form.consent');
      document.body.appendChild(checkbox);
      initBinding(state, checkbox);
      expect(checkbox.checked).toBe(true);
    });
  });

  describe('data-ignition-block — блоки', () => {
    let state;

    beforeEach(() => {
      state = createReactiveState({
        products: {
          items: [
            { id: 1, name: 'Ноутбук' },
            { id: 2, name: 'Мышь' }
          ]
        }
      });
    });

    it('рендерит блок при инициализации', () => {
      registerTemplate('catalog/list', (data) => {
        return data.products.items.map(i => `<p>${i.name}</p>`).join('');
      });
      document.body.innerHTML = `
        <div data-ignition-block="catalog/list"
             data-ignition-depends="products">
        </div>
      `;
      initBlocks(state);
      const block = document.querySelector('[data-ignition-block]');
      expect(block.innerHTML).toContain('Ноутбук');
      expect(block.innerHTML).toContain('Мышь');
    });

    it('перерендеряет блок при изменении depends', () => {
      registerTemplate('catalog/list', (data) => {
        return data.products.items.map(i => `<p>${i.name}</p>`).join('');
      });
      document.body.innerHTML = `
        <div data-ignition-block="catalog/list"
             data-ignition-depends="products">
        </div>
      `;
      initBlocks(state);
      const block = document.querySelector('[data-ignition-block]');
      state.products.items = [{ id: 3, name: 'Клавиатура' }];
      expect(block.innerHTML).toContain('Клавиатура');
      expect(block.innerHTML).not.toContain('Ноутбук');
    });

    it('не перерендеряет блок, если dependency не изменилась', () => {
      const renderFn = vi.fn(() => '<p>ok</p>');
      registerTemplate('stable/block', renderFn);
      document.body.innerHTML = `
        <div data-ignition-block="stable/block"
             data-ignition-depends="products">
        </div>
      `;
      initBlocks(state);
      const callCount = renderFn.mock.calls.length;
      // изменяем cart — products не тронут
      state.products = state.products; // то же значение
      expect(renderFn).toHaveBeenCalledTimes(callCount);
    });

    it('обновляет несколько экземпляров одного шаблона', () => {
      registerTemplate('shared/block', (data) => `<span>${data.products.items.length}</span>`);
      document.body.innerHTML = `
        <div data-ignition-block="shared/block" data-ignition-depends="products"></div>
        <div data-ignition-block="shared/block" data-ignition-depends="products"></div>
      `;
      initBlocks(state);
      const blocks = document.querySelectorAll('[data-ignition-block]');
      state.products.items = [{ id: 1 }];
      blocks.forEach(b => expect(b.innerHTML).toContain('1'));
    });

    it('несколько блоков с разными depends обновляются независимо', () => {
      registerTemplate('a/block', () => '<p>block A</p>');
      registerTemplate('b/block', (data) => `<p>cart:${data.cart.items.length}</p>`);
      document.body.innerHTML = `
        <div data-ignition-block="a/block" data-ignition-depends="products"></div>
        <div data-ignition-block="b/block" data-ignition-depends="cart"></div>
      `;
      state.cart = { items: [] };
      initBlocks(state);
      const blockA = document.querySelector('[data-ignition-block="a/block"]');
      const blockB = document.querySelector('[data-ignition-block="b/block"]');
      const htmlA = blockA.innerHTML;
      state.cart.items = [{ id: 1 }];
      expect(blockA.innerHTML).toBe(htmlA);
      expect(blockB.innerHTML).toBe('<p>cart:1</p>');
    });

    it('afterHydrate вызывается после re-render блока', () => {
      const afterHydrate = vi.fn();
      registerTemplate('life/block', () => '<p>rendered</p>');
      document.body.innerHTML = `
        <div data-ignition-block="life/block"
             data-ignition-depends="items">
        </div>
      `;
      initBlocks(state, { afterHydrate });
      expect(afterHydrate).toHaveBeenCalledTimes(1);
      expect(afterHydrate).toHaveBeenCalledWith(
        expect.any(HTMLElement),
        expect.stringContaining('rendered')
      );
    });

    it('afterHydrate вызывается при re-render блока', () => {
      const afterHydrate = vi.fn();
      registerTemplate('life/block2', (data) => `<p>count:${data.items.length}</p>`);
      document.body.innerHTML = `
        <div data-ignition-block="life/block2"
             data-ignition-depends="items">
        </div>
      `;
      initBlocks(state, { afterHydrate });
      const callCount = afterHydrate.mock.calls.length;
      state.items = [1, 2, 3];
      expect(afterHydrate).toHaveBeenCalledTimes(callCount + 1);
    });
  });

  describe('data-ignition-data — декларативный срез данных (A5)', () => {
    let state;

    beforeEach(() => {
      state = createReactiveState({
        greeting: 'Привет',
        products: [
          { name: 'Ноутбук' },
          { name: 'Мышь' }
        ],
        categories: ['electronics', 'books'],
        footer: { copyright: '2026' }
      });
    });

    it('рендерит блок со СРЕЗОМ данных по пути, а не с целым state', () => {
      registerTemplate('ssr/product-list', (data) => {
        return data.map(p => `<p>${p.name}</p>`).join('');
      });
      document.body.innerHTML = `
        <div data-ignition-block="ssr/product-list"
             data-ignition-data="products"
             data-ignition-depends="products">
        </div>
      `;
      initBlocks(state);
      const block = document.querySelector('[data-ignition-block]');
      expect(block.innerHTML).toContain('Ноутбук');
      expect(block.innerHTML).toContain('Мышь');
    });

    it('без data-ignition-data блок получает целый state', () => {
      registerTemplate('ssr/footer', (data) => {
        return `<p>${data.footer.copyright}</p>`;
      });
      document.body.innerHTML = `
        <div data-ignition-block="ssr/footer"
             data-ignition-depends="footer">
        </div>
      `;
      initBlocks(state);
      const block = document.querySelector('[data-ignition-block]');
      expect(block.innerHTML).toContain('2026');
    });

    it('перерендеряет при изменении среза (depends = data-ignition-data)', () => {
      registerTemplate('ssr/product-list', (data) => {
        return data.map(p => `<p>${p.name}</p>`).join('');
      });
      document.body.innerHTML = `
        <div data-ignition-block="ssr/product-list"
             data-ignition-data="products"
             data-ignition-depends="products">
        </div>
      `;
      initBlocks(state);
      const block = document.querySelector('[data-ignition-block]');
      state.products = [{ name: 'Клавиатура' }];
      expect(block.innerHTML).toContain('Клавиатура');
      expect(block.innerHTML).not.toContain('Ноутбук');
    });

    it('рендерит блок с несколькими именованными срезами', () => {
      registerTemplate('ssr/multi-list', (data) => {
        const products = data.products.map(p => `<span class="product">${p.name}</span>`).join('');
        const categories = data.categories.map(c => `<span class="category">${c}</span>`).join('');
        return products + categories;
      });
      document.body.innerHTML = `
        <div data-ignition-block="ssr/multi-list"
             data-ignition-data="products, categories"
             data-ignition-depends="products, categories"></div>
      `;
      initBlocks(state);
      const block = document.querySelector('[data-ignition-block]');
      expect(block.innerHTML).toContain('<span class="product">Ноутбук</span>');
      expect(block.innerHTML).toContain('<span class="category">electronics</span>');
    });

    it('перерендеряет мульти-срезовый блок при изменении любого среза', () => {
      registerTemplate('ssr/multi-list', (data) => {
        const products = data.products.map(p => `<span class="product">${p.name}</span>`).join('');
        const categories = data.categories.map(c => `<span class="category">${c}</span>`).join('');
        return products + categories;
      });
      document.body.innerHTML = `
        <div data-ignition-block="ssr/multi-list"
             data-ignition-data="products, categories"
             data-ignition-depends="products, categories"></div>
      `;
      initBlocks(state);
      const block = document.querySelector('[data-ignition-block]');
      state.categories = ['books'];
      expect(block.innerHTML).toContain('<span class="category">books</span>');
      expect(block.innerHTML).not.toContain('electronics');
    });
  });

  describe('data-ignition-class — привязка классов', () => {
    let state;

    beforeEach(() => {
      state = createReactiveState({
        form: { errors: { email: null } },
        ui: { active: false }
      });
    });

    it('добавляет класс, когда значение truthy', () => {
      const div = document.createElement('div');
      div.setAttribute('data-ignition-class', 'is-active: ui.active');
      document.body.appendChild(div);
      initBinding(state, div);

      expect(div.classList.contains('is-active')).toBe(false);
      state.ui.active = true;
      expect(div.classList.contains('is-active')).toBe(true);
    });

    it('удаляет класс, когда значение falsy', () => {
      const div = document.createElement('div');
      div.setAttribute('data-ignition-class', 'is-invalid: form.errors.email');
      document.body.appendChild(div);
      initBinding(state, div);

      state.form.errors.email = 'required';
      expect(div.classList.contains('is-invalid')).toBe(true);
      state.form.errors.email = null;
      expect(div.classList.contains('is-invalid')).toBe(false);
    });

    it('поддерживает несколько class bindings через точку с запятой', () => {
      const div = document.createElement('div');
      div.setAttribute('data-ignition-class', 'is-active: ui.active; is-invalid: form.errors.email');
      document.body.appendChild(div);
      initBinding(state, div);

      state.ui.active = true;
      state.form.errors.email = 'required';
      expect(div.classList.contains('is-active')).toBe(true);
      expect(div.classList.contains('is-invalid')).toBe(true);
    });

    it('не дублирует обработчики при повторном вызове', () => {
      const div = document.createElement('div');
      div.setAttribute('data-ignition-class', 'is-active: ui.active');
      document.body.appendChild(div);
      initBinding(state, div);
      initBinding(state, div);

      state.ui.active = true;
      expect(div.classList.contains('is-active')).toBe(true);
    });
  });

  describe('data-ignition-attr-* — привязка атрибутов', () => {
    let state;

    beforeEach(() => {
      state = createReactiveState({
        ui: { valid: false },
        form: { consent: false }
      });
    });

    it('устанавливает boolean-атрибут, когда значение truthy', () => {
      const btn = document.createElement('button');
      btn.setAttribute('data-ignition-attr-disabled', 'ui.valid');
      document.body.appendChild(btn);
      initBinding(state, btn);

      expect(btn.disabled).toBe(false);
      state.ui.valid = true;
      expect(btn.disabled).toBe(true);
    });

    it('удаляет boolean-атрибут, когда значение falsy', () => {
      const btn = document.createElement('button');
      btn.setAttribute('data-ignition-attr-disabled', 'ui.valid');
      document.body.appendChild(btn);
      initBinding(state, btn);

      state.ui.valid = true;
      expect(btn.disabled).toBe(true);
      state.ui.valid = false;
      expect(btn.disabled).toBe(false);
    });

    it('поддерживает отрицание через префикс !', () => {
      const btn = document.createElement('button');
      btn.setAttribute('data-ignition-attr-disabled', '!ui.valid');
      document.body.appendChild(btn);
      initBinding(state, btn);

      expect(btn.disabled).toBe(true);
      state.ui.valid = true;
      expect(btn.disabled).toBe(false);
    });

    it('работает с произвольными атрибутами', () => {
      const input = document.createElement('input');
      input.setAttribute('data-ignition-attr-aria-invalid', 'form.consent');
      document.body.appendChild(input);
      initBinding(state, input);

      expect(input.getAttribute('aria-invalid')).toBe(null);
      state.form.consent = true;
      expect(input.getAttribute('aria-invalid')).toBe('true');
      state.form.consent = false;
      expect(input.getAttribute('aria-invalid')).toBe(null);
    });
  });
});
