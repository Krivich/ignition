// @vitest-environment jsdom
/**
 * E1-E5: Personalized dataset — client loads a different dataset, diffs it
 * against the render manifest, and re-renders ONLY changed blocks.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createReactiveState } from '../../engine/core/runtime/state.js';
import { registerTemplate, resetRegistry } from '../../engine/core/runtime/render.js';
import { initBlocks } from '../../engine/core/runtime/binding.js';
import { getSlice, diffSlices, mergeSlices } from '../../engine/core/runtime/diff.js';

describe('E. Personalized dataset: diff manifest and partial re-render', () => {
  let state;

  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    state = createReactiveState({
      greeting: 'Привет',
      products: [
        { name: 'Ноутбук' },
        { name: 'Мышь' }
      ],
      footer: { copyright: '2026' }
    });
  });

  afterEach(() => {
    resetRegistry();
  });

  describe('E: getSlice resolves a path from data', () => {
    it('resolves nested path', () => {
      expect(getSlice({ a: { b: { c: 42 } } }, 'a.b.c')).toBe(42);
    });
    it('returns undefined for missing path', () => {
      expect(getSlice({ a: 1 }, 'x.y')).toBeUndefined();
    });
  });

  describe('E: diffSlices identifies which blocks changed', () => {
    it('detects only the blocks whose slice changed', () => {
      const manifest = {
        'ssr/greeting': 'Привет',
        'ssr/product-list': [
          { name: 'Ноутбук' },
          { name: 'Мышь' }
        ],
        'ssr/footer': { copyright: '2026' }
      };
      const blockPaths = {
        'ssr/greeting': 'greeting',
        'ssr/product-list': 'products',
        'ssr/footer': 'footer'
      };
      const newDataset = {
        greeting: 'Здравствуйте',
        products: [
          { name: 'Ноутбук' },
          { name: 'Мышь' }
        ],
        footer: { copyright: '2026' }
      };

      const changed = diffSlices(manifest, blockPaths, newDataset);
      expect(changed.has('ssr/greeting')).toBe(true);
      expect(changed.has('ssr/product-list')).toBe(false);
      expect(changed.has('ssr/footer')).toBe(false);
    });

    it('identical dataset → no changed blocks (no false positives)', () => {
      const manifest = { 'ssr/p': [{ n: 1 }] };
      const blockPaths = { 'ssr/p': 'products' };
      const newDataset = { products: [{ n: 1 }] };

      const changed = diffSlices(manifest, blockPaths, newDataset);
      expect(changed.size).toBe(0);
    });

    it('semantic equality: object key order does not trigger a false change', () => {
      // JSON.stringify-based comparison would flag these as different;
      // deep equality must treat them as the same slice.
      const manifest = { 'ssr/u': { a: 1, b: 2, c: 3 } };
      const blockPaths = { 'ssr/u': 'user' };
      const newDataset = { user: { c: 3, b: 2, a: 1 } };
      const changed = diffSlices(manifest, blockPaths, newDataset);
      expect(changed.size).toBe(0);
    });
  });

  describe('E: mergeSlices + only affected blocks re-render', () => {
    it('re-renders ONLY the block whose slice changed', () => {
      let greetingRenders = 0;
      let productsRenders = 0;

      registerTemplate('ssr/greeting', (data) => { greetingRenders++; return `<h1>${data}</h1>`; });
      registerTemplate('ssr/product-list', (data) => { productsRenders++; return data.map(p => `<p>${p.name}</p>`).join(''); });

      document.body.innerHTML = `
        <div data-ignition-block="ssr/greeting" data-ignition-data="greeting" data-ignition-depends="greeting"></div>
        <div data-ignition-block="ssr/product-list" data-ignition-data="products" data-ignition-depends="products"></div>
      `;

      initBlocks(state, { renderers: {} });
      expect(greetingRenders).toBe(1);
      expect(productsRenders).toBe(1);

      // Personalized dataset: only greeting differs
      const manifest = {
        'ssr/greeting': 'Привет',
        'ssr/product-list': [{ name: 'Ноутбук' }, { name: 'Мышь' }]
      };
      const blockPaths = {
        'ssr/greeting': 'greeting',
        'ssr/product-list': 'products'
      };
      const newDataset = {
        greeting: 'Личный привет, Алекс!',
        products: [{ name: 'Ноутбук' }, { name: 'Мышь' }]
      };

      const changed = diffSlices(manifest, blockPaths, newDataset);
      mergeSlices(state, changed, blockPaths, newDataset);

      // greeting re-rendered once more
      expect(greetingRenders).toBe(2);
      // products NOT re-rendered (unchanged)
      expect(productsRenders).toBe(1);
      const greetingBlock = document.querySelector('[data-ignition-block="ssr/greeting"]');
      expect(greetingBlock.innerHTML).toContain('Личный привет');
    });
  });
});
