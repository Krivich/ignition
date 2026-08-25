import { describe, it, expect, vi, beforeEach } from 'vitest';

import { createReactiveState } from '../../engine/core/runtime/state.js';
import {
  initBinding,
  initBlocks,
  registerAction,
  processEventHandlers
} from '../../engine/core/runtime/binding.js';
import { registerTemplate } from '../../engine/core/runtime/render.js';

describe('ignition — привязки и обработчики', () => {

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
  });

  describe('data-ignition-on — обработчики событий', () => {
    let state;

    beforeEach(() => {
      state = createReactiveState({
        cart: { items: [], total: 0 }
      });
    });

    it('click → actionName(): вызывает зарегистрированное действие', () => {
      const handler = vi.fn();
      registerAction('cartAdd', handler);
      const btn = document.createElement('button');
      btn.setAttribute('data-ignition-on', 'click → cartAdd()');
      document.body.appendChild(btn);
      processEventHandlers(state, btn);
      btn.click();
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(state);
    });

    it('click → actionName(args): аргументы передаются в action', () => {
      const handler = vi.fn();
      registerAction('addItem', handler);
      const btn = document.createElement('button');
      btn.setAttribute('data-ignition-on', 'click → addItem(42, 990)');
      document.body.appendChild(btn);
      processEventHandlers(state, btn);
      btn.click();
      expect(handler).toHaveBeenCalledWith(state, 42, 990);
    });

    it('submit → actionName: предотвращает дефолтное поведение формы', () => {
      const handler = vi.fn();
      registerAction('formSubmit', handler);
      const form = document.createElement('form');
      form.setAttribute('data-ignition-on', 'submit → formSubmit');
      document.body.appendChild(form);
      processEventHandlers(state, form);
      const event = new Event('submit', { bubbles: true, cancelable: true });
      form.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    });

    it('action может мутировать state', () => {
      registerAction('cartAdd', (s) => {
        s.cart.items.push({ id: 1 });
        s.cart.total = s.cart.items.length;
      });
      const btn = document.createElement('button');
      btn.setAttribute('data-ignition-on', 'click → cartAdd()');
      document.body.appendChild(btn);
      processEventHandlers(state, btn);
      btn.click();
      expect(state.cart.items).toHaveLength(1);
      expect(state.cart.total).toBe(1);
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
        return data.items.map(i => `<p>${i.name}</p>`).join('');
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
        return data.items.map(i => `<p>${i.name}</p>`).join('');
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

    it(' several блоков с разными depends обновляются независимо', () => {
      registerTemplate('a/block', () => '<p>block A</p>');
      registerTemplate('b/block', () => '<p>block B</p>');
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
      expect(blockA.innerHTML).toBe(htmlA); // A не изменился
      expect(blockB.innerHTML).not.toBe('<p>block B</p>'); // B обновился
    });
  });
});
