// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createReactiveState } from '../../engine/core/runtime/state.js';
import { initBlocks } from '../../engine/core/runtime/binding.js';
import { registerTemplate, resetRegistry } from '../../engine/core/runtime/render.js';

/**
 * D. Реактивность
 */
describe('D. Реактивность', () => {
  let state;

  beforeEach(() => {
    state = createReactiveState({
      items: [{ name: 'A' }],
      count: 0,
    });
    registerTemplate('test/list', (data) => {
      return data.map(item => `<div class="item">${item.name}</div>`).join('');
    });
    registerTemplate('test/counter', (data) => {
      return `<span class="count">${data}</span>`;
    });
  });

  afterEach(() => {
    resetRegistry();
  });

  it('D1: мутация пути перерендеривает только зависимые блоки', () => {
    document.body.innerHTML = `
      <div data-ignition-block="test/list" data-ignition-data="items" data-ignition-depends="items"></div>
      <div data-ignition-block="test/counter" data-ignition-data="count" data-ignition-depends="count"></div>
    `;

    initBlocks(state);

    const listBlock = document.querySelector('[data-ignition-block="test/list"]');
    const counterBlock = document.querySelector('[data-ignition-block="test/counter"]');

    const listHTML = listBlock.innerHTML;
    const counterHTML = counterBlock.innerHTML;

    // Mutate count
    state.count = 5;
    state.flush();

    // Counter should re-render
    expect(counterBlock.innerHTML).toContain('5');
    // List should NOT re-render (innerHTML unchanged)
    expect(listBlock.innerHTML).toBe(listHTML);
  });

  it('D2: depends по умолчанию = data', () => {
    document.body.innerHTML = `
      <div data-ignition-block="test/list" data-ignition-data="items"></div>
    `;

    initBlocks(state);

    const block = document.querySelector('[data-ignition-block]');
    expect(block.innerHTML).toContain('A');

    state.items = [{ name: 'X' }];
    state.flush();
    expect(block.innerHTML).toContain('X');
  });

  it('D3: присвоение того же значения — не перерендер', () => {
    document.body.innerHTML = `
      <div data-ignition-block="test/counter" data-ignition-data="count" data-ignition-depends="count"></div>
    `;

    initBlocks(state);

    const block = document.querySelector('[data-ignition-block]');
    const originalHTML = block.innerHTML;

    state.count = 0; // Same value
    expect(block.innerHTML).toBe(originalHTML);
  });

  it('D5: ошибка рендера блока не ломает прежний контент', () => {
    registerTemplate('test/error', () => {
      throw new Error('Render error');
    });

    document.body.innerHTML = `
      <div data-ignition-block="test/error" data-ignition-data="items" data-ignition-depends="items">
        <div class="fallback">Fallback content</div>
      </div>
    `;

    initBlocks(state);

    const block = document.querySelector('[data-ignition-block]');
    // Block should keep its original content despite error
    expect(block.innerHTML).toContain('Fallback content');
  });
});
