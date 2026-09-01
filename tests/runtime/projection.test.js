// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { createReactiveState } from '../../engine/core/runtime/state.js';
import { initBinding, initBlocks, rescopeEachBindings } from '../../engine/core/runtime/binding.js';
import { registerTemplate, renderTemplate, resetRegistry, hydrate } from '../../engine/core/runtime/render.js';

function rowHtml(i, { key = null } = {}) {
  const keyAttr = key ? ` data-ignition-key="${key}"` : '';
  return `<div class="row"${keyAttr} data-ignition-row="products">` +
    `<span class="n" data-ignition-text="@p:products.*.name">n${i}</span>` +
    `<span class="p" data-ignition-text="@p:products.*.price">p${i}</span>` +
    `</div>`;
}

describe('fine-grained: row-scoped проекции (@p) внутри #each', () => {
  let state;

  beforeEach(() => {
    document.body.innerHTML = '';
    resetRegistry();
    state = createReactiveState({
      products: [
        { name: 'n0', price: 'p0' },
        { name: 'n1', price: 'p1' },
        { name: 'n2', price: 'p2' },
      ],
    });
  });

  afterEach(() => {
    resetRegistry();
  });

  function bootStickers(root = document) {
    root.querySelectorAll('[data-ignition-text]').forEach((el) => initBinding(state, el));
  }

  it('стикер в строке i биндится на products.<i>.<leaf> и обновляется точечно', () => {
    document.body.innerHTML = rowHtml(0) + rowHtml(1) + rowHtml(2);
    bootStickers();

    state.products[1].price = 'CHANGED';

    const spans = document.querySelectorAll('.p');
    expect(spans[1].textContent).toBe('CHANGED');
    expect(spans[0].textContent).toBe('p0');
    expect(spans[2].textContent).toBe('p2');
  });

  it('исходный SSR-текст сохраняется и синхронизирован со state', () => {
    document.body.innerHTML = rowHtml(0);
    bootStickers();

    expect(document.querySelector('.p').textContent).toBe('p0');
    expect(document.querySelector('.n').textContent).toBe('n0');
  });

  it('стикер без предка data-ignition-row инертен (без крэша)', () => {
    document.body.innerHTML =
      '<span class="lonely" data-ignition-text="@p:products.*.price">static</span>';
    bootStickers();

    state.products[0].price = 'CHANGED';
    expect(document.querySelector('.lonely').textContent).toBe('static');
  });

  it('rescope после keyed reorder: переезжающие строки переподписываются, старые пути отвязаны', () => {
    document.body.innerHTML = rowHtml(0, { key: 'k0' }) + rowHtml(1, { key: 'k1' }) + rowHtml(2, { key: 'k2' });
    bootStickers();

    // reorder DOM: k2, k0, k1 (как сделал бы keyed reconcile)
    const container = document.createElement('div');
    container.innerHTML = rowHtml(2, { key: 'k2' }) + rowHtml(0, { key: 'k0' }) + rowHtml(1, { key: 'k1' });
    hydrate(document.body, container.innerHTML);

    // ДО rescope старые подписки ещё живы: первый ряд (был k2/products.2) указывает на products.2
    // state теперь в другом порядке: products[0] = старый item2
    state.products = [
      { name: 'n2', price: 'p2' },
      { name: 'n0', price: 'p0' },
      { name: 'n1', price: 'p1' },
    ];

    rescopeEachBindings(document.body);

    const spans = document.querySelectorAll('.p');
    expect(spans[0].textContent).toBe('p2');
    state.products[0].price = 'NEW0';
    expect(spans[0].textContent).toBe('NEW0');
    state.products[1].price = 'NEW1';
    expect(spans[1].textContent).toBe('NEW1');
    // старая подписка первой строки на products.2.* отвязана: products.2.price = 'x' не трогает её
    state.products[2].price = 'OLDPATH';
    expect(spans[0].textContent).toBe('NEW0');
    expect(spans[2].textContent).toBe('OLDPATH');
  });

  it('block re-render: свежая строка после push получает стикер на своём индексе', () => {
    registerTemplate('proj/list', () =>
      rowHtml(0) + rowHtml(1) + rowHtml(2) + rowHtml(3)
    );
    document.body.innerHTML =
      '<div data-ignition-block="proj/list" data-ignition-data="products">' +
      rowHtml(0) + rowHtml(1) + rowHtml(2) +
      '</div>';
    bootStickers(document.body.querySelector('[data-ignition-block]'));

    initBlocks(state);

    state.products[1].price = 'CHANGED';
    expect(document.querySelectorAll('.p')[1].textContent).toBe('CHANGED');

    state.products.push({ name: 'n3', price: 'p3' });
    const rows = document.querySelectorAll('.row');
    expect(rows.length).toBe(4);
    // свежая строка гидратилась из зарегистрированного шаблона со стикером
    state.products[3].price = 'NEW3';
    expect(document.querySelectorAll('.p')[3].textContent).toBe('NEW3');
    // а ряды 0..2 не перерисовались мусором
    expect(document.querySelectorAll('.p')[0].textContent).toBe('p0');
  });
});
