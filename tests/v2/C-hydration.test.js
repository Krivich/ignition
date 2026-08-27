// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createReactiveState } from '../../engine/core/runtime/state.js';
import { initBlocks } from '../../engine/core/runtime/binding.js';
import { registerTemplate, resetRegistry } from '../../engine/core/runtime/render.js';

/**
 * C. Гидратация
 */
describe('C. Гидратация', () => {
  let state;

  beforeEach(() => {
    state = createReactiveState({
      items: [{ name: 'A' }, { name: 'B' }],
    });
    registerTemplate('test/list', (data) => {
      return data.map(item => `<div class="item">${item.name}</div>`).join('');
    });
  });

  afterEach(() => {
    resetRegistry();
  });

  it('C1: при старте innerHTML заполненных блоков не меняется', () => {
    document.body.innerHTML = `
      <div data-ignition-block="test/list" data-ignition-data="items" data-ignition-depends="items">
        <div class="item">A</div>
        <div class="item">B</div>
      </div>
    `;

    const block = document.querySelector('[data-ignition-block]');
    const originalHTML = block.innerHTML;

    initBlocks(state);

    // After hydration, innerHTML should remain the same (no re-render)
    expect(block.innerHTML).toBe(originalHTML);
  });

  it('C2: пустой серверный блок рендерится клиентом при появлении данных', () => {
    document.body.innerHTML = `
      <div data-ignition-block="test/list" data-ignition-data="items" data-ignition-depends="items"></div>
    `;

    const block = document.querySelector('[data-ignition-block]');
    expect(block.innerHTML).toBe('');

    initBlocks(state);

    // Block should render with data
    expect(block.innerHTML).toContain('<div class="item">A</div>');
    expect(block.innerHTML).toContain('<div class="item">B</div>');
  });
});
