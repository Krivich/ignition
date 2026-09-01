// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { createReactiveState } from '../../engine/core/runtime/state.js';

describe('fine-grained: классификация изменений (leaf vs structural)', () => {
  let state;

  beforeEach(() => {
    state = createReactiveState({
      products: [
        { name: 'n0', price: 'p0' },
        { name: 'n1', price: 'p1' },
      ],
      ui: { period: 'week' },
      total: 5,
    });
  });

  function kindsOf(path, fn) {
    const kinds = [];
    const unsub = state.subscribe(path, (p, o, n, kind) => kinds.push(kind ?? 'none'));
    fn();
    unsub();
    return kinds;
  }

  it('присваивание примитива существующему полю — leaf', () => {
    expect(kindsOf('ui', () => { state.ui.period = 'month'; })).toEqual(['leaf']);
  });

  it('присваивание примитива в корне — leaf', () => {
    expect(kindsOf('total', () => { state.total = 7; })).toEqual(['leaf']);
  });

  it('замена объекта/массива — structural', () => {
    expect(kindsOf('ui', () => { state.ui = { period: 'month' }; })).toEqual(['structural']);
    expect(kindsOf('products', () => { state.products = [{ name: 'x', price: 'y' }]; })).toEqual(['structural']);
  });

  it('push/splice на массиве — только structural (индексные и length-сеты)', () => {
    const pushKinds = kindsOf('products', () => { state.products.push({ name: 'n2', price: 'p2' }); });
    expect(pushKinds.length).toBeGreaterThan(0);
    expect(pushKinds.every((k) => k === 'structural')).toBe(true);

    const spliceKinds = kindsOf('products', () => { state.products.splice(0, 1); });
    expect(spliceKinds.length).toBeGreaterThan(0);
    expect(spliceKinds.every((k) => k === 'structural')).toBe(true);
  });

  it('leaf-мутация внутри элемента массива — leaf (точечное обновление ячейки)', () => {
    expect(kindsOf('products', () => { state.products[1].price = 'CHANGED'; })).toEqual(['leaf']);
  });

  it('замена элемента массива объектом — structural', () => {
    expect(kindsOf('products', () => { state.products[1] = { name: 'x', price: 'y' }; })).toEqual(['structural']);
  });

  it('смена length массива — structural', () => {
    expect(kindsOf('products', () => { state.products.length = 1; })).toEqual(['structural']);
  });

  it('set() через API классифицирует так же, как proxy-мутации', () => {
    expect(kindsOf('ui', () => { state.set('ui.period', 'month'); })).toEqual(['leaf']);
    expect(kindsOf('products', () => { state.set('products', []); })).toEqual(['structural']);
  });

  it('подписка на точный leaf-путь получает свои kind', () => {
    expect(kindsOf('products.1.price', () => { state.products[1].price = 'X'; })).toEqual(['leaf']);
    expect(kindsOf('products.1', () => { state.products[1] = { name: 'a', price: 'b' }; })).toEqual(['structural']);
  });
});
