// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createReactiveState } from '../../engine/core/runtime/state.js';
import { initBlocks } from '../../engine/core/runtime/binding.js';
import { registerTemplate, resetRegistry } from '../../engine/core/runtime/render.js';
import { diffSlices, mergeSlices } from '../../engine/core/runtime/diff.js';

/**
 * I. Персонализированные датасеты
 */
describe('I. Персонализированные датасеты', () => {
  let state;

  beforeEach(() => {
    state = createReactiveState({
      products: [{ name: 'A' }],
      user: { name: 'Alice' },
    });
    registerTemplate('test/list', (data) => {
      return data.map(item => `<div>${item.name}</div>`).join('');
    });
  });

  afterEach(() => {
    resetRegistry();
  });

  it('I1: loadDataset — дифф с манифестом, перерендер только изменившихся блоков', () => {
    document.body.innerHTML = `
      <div data-ignition-block="test/list" data-ignition-data="products" data-ignition-depends="products"></div>
    `;

    initBlocks(state);

    const block = document.querySelector('[data-ignition-block]');
    expect(block.innerHTML).toContain('A');

    // Simulate loadDataset: new dataset with changed products
    const newDataset = {
      products: [{ name: 'X' }, { name: 'Y' }],
      user: { name: 'Alice' }, // Unchanged
    };

    const manifest = { 'test/list': [{ name: 'A' }] };
    const blockPaths = { 'test/list': 'products' };

    const changed = diffSlices(manifest, blockPaths, newDataset);
    expect(changed.has('test/list')).toBe(true);

    mergeSlices(state, changed, blockPaths, newDataset);
    expect(state.products).toEqual([{ name: 'X' }, { name: 'Y' }]);

    // Block should re-render
    expect(block.innerHTML).toContain('X');
    expect(block.innerHTML).toContain('Y');
  });

  it('I2: идентичный датасет — ноль перерендеров', () => {
    document.body.innerHTML = `
      <div data-ignition-block="test/list" data-ignition-data="products" data-ignition-depends="products"></div>
    `;

    initBlocks(state);

    const block = document.querySelector('[data-ignition-block]');
    const originalHTML = block.innerHTML;

    // Identical dataset
    const newDataset = {
      products: [{ name: 'A' }],
      user: { name: 'Alice' },
    };

    const manifest = { 'test/list': [{ name: 'A' }] };
    const blockPaths = { 'test/list': 'products' };

    const changed = diffSlices(manifest, blockPaths, newDataset);
    expect(changed.size).toBe(0);

    // No merge, no re-render
    expect(block.innerHTML).toBe(originalHTML);
  });

  it('I3: манифест — подмножество; лишние поля датасета не ошибка', () => {
    const newDataset = {
      products: [{ name: 'X' }],
      user: { name: 'Bob' }, // Extra field not in manifest
      extra: { data: 123 }, // Another extra field
    };

    const manifest = { 'test/list': [{ name: 'A' }] };
    const blockPaths = { 'test/list': 'products' };

    const changed = diffSlices(manifest, blockPaths, newDataset);
    expect(changed.has('test/list')).toBe(true);

    mergeSlices(state, changed, blockPaths, newDataset);
    expect(state.products).toEqual([{ name: 'X' }]);
    // Extra fields are ignored, no error
  });
});
