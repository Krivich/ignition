import { describe, it, expect, vi } from 'vitest';

import { createReactiveState } from '../../engine/core/runtime/state.js';
import { createComputed } from '../../engine/core/runtime/computed.js';

describe('ignition.computed — производные данные', () => {

  describe('базовый computed', () => {
    it('вычисляет значение из state', () => {
      const state = createReactiveState({ items: [1, 2, 3] });
      const total = createComputed(state, 'total', (s) => s.items.length);
      expect(total()).toBe(3);
    });

    it('возвращает начальное значение сразу', () => {
      const state = createReactiveState({ price: 100, quantity: 5 });
      const sum = createComputed(state, 'sum', (s) => s.price * s.quantity);
      expect(sum()).toBe(500);
    });
  });

  describe('пересчёт при изменении зависимостей', () => {
    it('пересчитывается при изменении зависимого свойства', () => {
      const state = createReactiveState({ items: [1, 2, 3] });
      const total = createComputed(state, 'total', (s) => s.items.length);
      state.items.push(4);
      expect(total()).toBe(4);
    });

    it('пересчитывается при изменении вложенного свойства', () => {
      const state = createReactiveState({ products: { loading: false, items: [] } });
      const hasData = createComputed(state, 'hasData', (s) => s.products.items.length > 0);
      expect(hasData()).toBe(false);
      state.products.items = [{ id: 1 }];
      expect(hasData()).toBe(true);
    });

    it('не пересчитывается, если依赖 не изменились', () => {
      const state = createReactiveState({ a: 1, b: 2 });
      const fn = vi.fn((s) => s.a + s.b);
      const sum = createComputed(state, 'sum', fn);
      expect(sum()).toBe(3);
      expect(fn).toHaveBeenCalledTimes(1);
      state.b = 2; // то же значение
      expect(sum()).toBe(3);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('не пересчитывается при изменении независимого свойства', () => {
      const state = createReactiveState({ a: 1, b: 2, c: 100 });
      const fn = vi.fn((s) => s.a + s.b);
      const sum = createComputed(state, 'sum', fn);
      expect(sum()).toBe(3);
      expect(fn).toHaveBeenCalledTimes(1);
      state.c = 200;
      expect(sum()).toBe(3);
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('цепочки computed', () => {
    it('computed зависит от другого computed', () => {
      const state = createReactiveState({
        metrics: { sales: [{ amount: 100 }, { amount: 200 }] }
      });
      const total = createComputed(state, 'total', (s) =>
        s.metrics.sales.reduce((sum, i) => sum + i.amount, 0)
      );
      const avg = createComputed(state, 'avg', (s) =>
        total() / s.metrics.sales.length
      );
      expect(total()).toBe(300);
      expect(avg()).toBe(150);
    });

    it('цепочка пересчитывается в правильном порядке', () => {
      const state = createReactiveState({
        metrics: { sales: [{ amount: 100 }, { amount: 200 }] }
      });
      const log = [];
      const total = createComputed(state, 'total', (s) => {
        log.push('total');
        return s.metrics.sales.reduce((sum, i) => sum + i.amount, 0);
      });
      const avg = createComputed(state, 'avg', (s) => {
        log.push('avg');
        return total() / s.metrics.sales.length;
      });
      // инициализация
      avg(); //触发 ленивый вычисление
      expect(log).toEqual(['total', 'avg']);

      log.length = 0;
      state.metrics.sales.push({ amount: 300 });
      // пересчёт
      avg();
      expect(log).toEqual(['total', 'avg']);
    });

    it('глубокая цепочка: 3 уровня', () => {
      const state = createReactiveState({ x: 2 });
      const doubled = createComputed(state, 'doubled', (s) => s.x * 2);
      const quadrupled = createComputed(state, 'quadrupled', () => doubled() * 2);
      const result = createComputed(state, 'result', () => quadrupled() + 1);
      expect(result()).toBe(9); // 2*2*2 + 1
      state.x = 3;
      expect(result()).toBe(13); // 3*2*2 + 1
    });
  });

  describe('кейс 1: filteredProducts', () => {
    function setup() {
      const state = createReactiveState({
        products: {
          items: [
            { id: 1, name: 'Ноутбук', category: 'electronics' },
            { id: 2, name: 'Книга по JS', category: 'books' },
            { id: 3, name: 'Мышь', category: 'electronics' },
            { id: 4, name: 'Роман', category: 'books' }
          ]
        },
        ui: { searchQuery: '', activeCategory: 'all' }
      });
      const filtered = createComputed(state, 'filteredProducts', (s) => {
        let items = s.products.items;
        if (s.ui.activeCategory !== 'all') {
          items = items.filter(i => i.category === s.ui.activeCategory);
        }
        if (s.ui.searchQuery) {
          const q = s.ui.searchQuery.toLowerCase();
          items = items.filter(i => i.name.toLowerCase().includes(q));
        }
        return items;
      });
      return { state, filtered };
    }

    it('возвращает все товары без фильтров', () => {
      const { filtered } = setup();
      expect(filtered()).toHaveLength(4);
    });

    it('фильтрует по searchQuery', () => {
      const { state, filtered } = setup();
      state.ui.searchQuery = 'ноут';
      expect(filtered()).toHaveLength(1);
      expect(filtered()[0].name).toBe('Ноутбук');
    });

    it('фильтрует по activeCategory', () => {
      const { state, filtered } = setup();
      state.ui.activeCategory = 'books';
      expect(filtered()).toHaveLength(2);
    });

    it('фильтрует по обоим сразу', () => {
      const { state, filtered } = setup();
      state.ui.searchQuery = 'книг';
      state.ui.activeCategory = 'all';
      expect(filtered()).toHaveLength(1);
      expect(filtered()[0].name).toBe('Книга по JS');
    });

    it('возвращает пустой массив, если ничего не найдено', () => {
      const { state, filtered } = setup();
      state.ui.searchQuery = 'несуществующий товар';
      expect(filtered()).toHaveLength(0);
    });
  });

  describe('кейс 3:销售агрегация', () => {
    function setup() {
      const state = createReactiveState({
        metrics: {
          sales: [
            { date: '2026-08-01', amount: 15000 },
            { date: '2026-08-02', amount: 23000 },
            { date: '2026-08-03', amount: 8000 }
          ]
        }
      });
      const total = createComputed(state, 'totalSales', (s) =>
        s.metrics.sales.reduce((sum, i) => sum + i.amount, 0)
      );
      const avg = createComputed(state, 'avgSales', (s) =>
        total() / s.metrics.sales.length
      );
      const best = createComputed(state, 'bestDay', (s) =>
        s.metrics.sales.reduce((best, i) => i.amount > best.amount ? i : best, s.metrics.sales[0])
      );
      return { state, total, avg, best };
    }

    it('totalSales = sum of amounts', () => {
      const { total } = setup();
      expect(total()).toBe(46000);
    });

    it('avgSales = total / count', () => {
      const { avg } = setup();
      expect(avg()).toBeCloseTo(15333.33);
    });

    it('bestDay = max amount', () => {
      const { best } = setup();
      expect(best().date).toBe('2026-08-02');
      expect(best().amount).toBe(23000);
    });

    it('пересчитывается при изменении metrics.sales', () => {
      const { state, total, best } = setup();
      state.metrics.sales.push({ date: '2026-08-04', amount: 50000 });
      expect(total()).toBe(96000);
      expect(best().date).toBe('2026-08-04');
    });
  });
});
