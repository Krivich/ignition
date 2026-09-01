import { describe, it, expect, vi } from 'vitest';

// Импорт модуля, которого ещё нет —红灯直到 реализуем
// Когда создадим engine/core/runtime/state.js — эти тесты станут зелёными
import { createReactiveState } from '../../engine/core/runtime/state.js';

describe('ignition.state — реактивная модель', () => {

  describe('создание state', () => {
    it('создаёт реактивный state из plain object', () => {
      const state = createReactiveState({ count: 0 });
      expect(state.count).toBe(0);
    });

    it('сохраняет вложенные структуры', () => {
      const state = createReactiveState({
        products: { items: [1, 2, 3], loading: false }
      });
      expect(state.products.items).toEqual([1, 2, 3]);
      expect(state.products.loading).toBe(false);
    });

    it(' Proxy отслеживает чтение без ошибок', () => {
      const state = createReactiveState({ a: { b: { c: 1 } } });
      expect(state.a.b.c).toBe(1);
    });
  });

  describe('мутации — перехват set', () => {
    it('перехватывает изменение простого свойства', () => {
      const state = createReactiveState({ count: 0 });
      state.count = 5;
      expect(state.count).toBe(5);
    });

    it('перехватывает изменение вложенного свойства', () => {
      const state = createReactiveState({ form: { fields: { name: '' } } });
      state.form.fields.name = 'Алексей';
      expect(state.form.fields.name).toBe('Алексей');
    });

    it('перехватывает push в массив', () => {
      const state = createReactiveState({ cart: { items: [] } });
      state.cart.items.push({ id: 1, name: 'Товар' });
      expect(state.cart.items).toHaveLength(1);
      expect(state.cart.items[0].id).toBe(1);
    });

    it('перехватывает splice в массив', () => {
      const state = createReactiveState({ cart: { items: [{ id: 1 }, { id: 2 }] } });
      state.cart.items.splice(0, 1);
      expect(state.cart.items).toHaveLength(1);
      expect(state.cart.items[0].id).toBe(2);
    });

    it('перехватывает delete', () => {
      const state = createReactiveState({ form: { errors: { name: 'Ошибка' } } });
      delete state.form.errors.name;
      expect(state.form.errors.name).toBeUndefined();
    });

    it('не срабатывает при записи того же значения (primitives)', () => {
      const state = createReactiveState({ count: 5 });
      const onChange = vi.fn();
      state.subscribe('count', onChange);
      state.count = 5;
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('отслеживание пути изменения', () => {
    it('сообщает полный путь при изменении простого свойства', () => {
      const state = createReactiveState({ products: { loading: false } });
      const onChange = vi.fn();
      state.subscribe('products', onChange);
      state.products.loading = true;
      expect(onChange).toHaveBeenCalledWith('products.loading', expect.anything(), expect.anything(), 'leaf');
    });

    it('сообщает путь при push в массив', () => {
      const state = createReactiveState({ cart: { items: [] } });
      const onChange = vi.fn();
      state.subscribe('cart', onChange);
      state.cart.items.push({ id: 1 });
      expect(onChange).toHaveBeenCalled();
    });

    it('сообщает путь при splice в массив', () => {
      const state = createReactiveState({ cart: { items: [{ id: 1 }] } });
      const onChange = vi.fn();
      state.subscribe('cart', onChange);
      state.cart.items.splice(0, 1);
      expect(onChange).toHaveBeenCalled();
    });
  });

  describe('подписчики', () => {
    it('вызывает подписчика при изменении пути', () => {
      const state = createReactiveState({ products: { loading: false } });
      const onChange = vi.fn();
      state.subscribe('products', onChange);
      state.products.loading = true;
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('передаёт старое и новое значение', () => {
      const state = createReactiveState({ count: 0 });
      const onChange = vi.fn();
      state.subscribe('count', onChange);
      state.count = 10;
      const [, oldVal, newVal] = onChange.mock.calls[0];
      expect(oldVal).toBe(0);
      expect(newVal).toBe(10);
    });

    it('подписчик на "products" срабатывает при изменении products.loading', () => {
      const state = createReactiveState({ products: { loading: false }, cart: { items: [] } });
      const onProducts = vi.fn();
      const onCart = vi.fn();
      state.subscribe('products', onProducts);
      state.subscribe('cart', onCart);
      state.products.loading = true;
      expect(onProducts).toHaveBeenCalledTimes(1);
      expect(onCart).not.toHaveBeenCalled();
    });

    it('подписчик на "cart" НЕ срабатывает при изменении products', () => {
      const state = createReactiveState({ products: { loading: false }, cart: { items: [] } });
      const onCart = vi.fn();
      state.subscribe('cart', onCart);
      state.products.loading = true;
      expect(onCart).not.toHaveBeenCalled();
    });

    it('поддерживает несколько подписчиков на один путь', () => {
      const state = createReactiveState({ count: 0 });
      const fn1 = vi.fn();
      const fn2 = vi.fn();
      state.subscribe('count', fn1);
      state.subscribe('count', fn2);
      state.count = 1;
      expect(fn1).toHaveBeenCalledTimes(1);
      expect(fn2).toHaveBeenCalledTimes(1);
    });

    it('unsubscribe отключает подписчика', () => {
      const state = createReactiveState({ count: 0 });
      const onChange = vi.fn();
      const unsub = state.subscribe('count', onChange);
      state.count = 1;
      expect(onChange).toHaveBeenCalledTimes(1);
      unsub();
      state.count = 2;
      expect(onChange).toHaveBeenCalledTimes(1);
    });
  });

  describe('глубокие мутации', () => {
    it('перехватывает вложенную мутацию через Proxy', () => {
      const state = createReactiveState({
        form: { fields: { name: '', email: '' }, errors: {} }
      });
      state.form.fields.name = 'Тест';
      state.form.fields.email = 'test@example.com';
      expect(state.form.fields.name).toBe('Тест');
      expect(state.form.fields.email).toBe('test@example.com');
    });

    it('уведомляет подписчика родительского пути при глубокой мутации', () => {
      const state = createReactiveState({ form: { fields: { name: '' } } });
      const onChange = vi.fn();
      state.subscribe('form', onChange);
      state.form.fields.name = 'Тест';
      expect(onChange).toHaveBeenCalled();
    });
  });
});
