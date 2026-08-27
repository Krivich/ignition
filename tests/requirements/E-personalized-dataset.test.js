// @vitest-environment jsdom
/**
 * E1-E5 (honest): Personalized dataset and partial re-rendering — via the
 * REAL runtime diff module (engine/core/runtime/diff.js), not a local copy.
 *
 * Manifest semantics (matches engine/core/helpers.js): manifest[blockName]
 * holds the BARE slice at the block's data-ignition-data path.
 *   manifest = { 'catalog/list': <value at path 'products'> }
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createReactiveState } from '../../engine/core/runtime/state.js';
import { registerTemplate, resetRegistry } from '../../engine/core/runtime/render.js';
import { initBlocks, resetActions } from '../../engine/core/runtime/binding.js';
import { getSlice, diffSlices, mergeSlices } from '../../engine/core/runtime/diff.js';

describe('E. Personalized dataset and partial pre-rendering (real diff module)', () => {
  // manifest values are the bare slices at each block's data-ignition-data path
  const manifest = {
    'block/ref': { industries: ['IT'] },
    'block/form': { name: 'Alice' }
  };
  const blockPaths = {
    'block/ref': 'reference',
    'block/form': 'form'
  };

  let state;

  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    state = createReactiveState({
      reference: { industries: ['IT'] },
      form: { name: 'Alice' }
    });
  });

  afterEach(() => {
    resetRegistry();
    resetActions();
  });

  describe('E1: Client can load different dataset (getSlice)', () => {
    it('getSlice extracts the exact block slice from a dataset', () => {
      const full = {
        reference: { industries: ['IT', 'Finance'] },
        form: { name: 'Bob' },
        products: ['Book1', 'Book2']
      };
      expect(getSlice(full, 'reference')).toEqual({ industries: ['IT', 'Finance'] });
      expect(getSlice(full, 'form')).toEqual({ name: 'Bob' });
      expect(getSlice(full, 'missing')).toBeUndefined();
    });

    it('substituting a different dataset does not break the page', () => {
      registerTemplate('block/form', (d) => `<p>${d.name}</p>`);
      document.body.innerHTML = `
        <div data-ignition-block="block/form" data-ignition-depends="form">
          <p>server content</p>
        </div>
      `;
      expect(document.querySelector('[data-ignition-block]').innerHTML).toContain('server content');

      // load a different dataset: reference changed, form unchanged
      const full = { reference: { industries: ['X'] }, form: { name: 'Alice' } };
      const changed = diffSlices(manifest, blockPaths, full);
      mergeSlices(state, changed, blockPaths, full);

      expect(document.querySelector('[data-ignition-block]')).not.toBeNull();
      expect(changed.has('block/ref')).toBe(true);
      expect(changed.has('block/form')).toBe(false);
    });
  });

  describe('E2: Client diffs loaded dataset against render manifest (diffSlices)', () => {
    it('reports only blockPaths whose slice changed', () => {
      const full = {
        reference: { industries: ['IT', 'Finance', 'Trade'] },
        form: { name: 'Alice' },
        products: ['Book1', 'Book2']
      };
      const changed = diffSlices(manifest, blockPaths, full);

      expect(changed.has('block/ref')).toBe(true);
      expect(changed.has('block/form')).toBe(false);
    });

    it('returns an empty set for an unchanged dataset', () => {
      const full = { reference: { industries: ['IT'] }, form: { name: 'Alice' } };
      expect(diffSlices(manifest, blockPaths, full).size).toBe(0);
    });
  });

  describe('E3: Only changed slices are merged / re-render', () => {
    it('mergeSlices writes only changed block slices into reactive state', () => {
      let refRenderCount = 0;
      let formRenderCount = 0;

      registerTemplate('block/ref', (d) => { refRenderCount++; return `<p>${d.industries.join(',')}</p>`; });
      registerTemplate('block/form', (d) => { formRenderCount++; return `<p>${d.name}</p>`; });

      document.body.innerHTML = `
        <div data-ignition-block="block/ref" data-ignition-depends="reference"></div>
        <div data-ignition-block="block/form" data-ignition-depends="form"></div>
      `;
      initBlocks(state);
      expect(refRenderCount).toBe(1);
      expect(formRenderCount).toBe(1);

      // reference changed, form unchanged
      const full = { reference: { industries: ['IT', 'Finance', 'Trade'] }, form: { name: 'Alice' } };
      const changed = diffSlices(manifest, blockPaths, full);
      mergeSlices(state, changed, blockPaths, full);

      expect(refRenderCount).toBe(2);
      expect(formRenderCount).toBe(1);
    });
  });

  describe('E4: Identical dataset → no re-render', () => {
    it('diffSlices reports no changes for an identical dataset', () => {
      const full = { reference: { industries: ['IT'] }, form: { name: 'Alice' } };
      expect(diffSlices(manifest, blockPaths, full).size).toBe(0);
    });
  });

  describe('E5: Extra dataset keys never false-positive', () => {
    it('extra keys in the full dataset do not affect existing blocks', () => {
      const full = {
        reference: { industries: ['IT'] },
        form: { name: 'Alice' },
        extraSection: { data: 'not in manifest' },
        anotherSection: { nested: { deep: true } }
      };
      const changed = diffSlices(manifest, blockPaths, full);
      expect(changed.has('block/ref')).toBe(false);
      expect(changed.has('block/form')).toBe(false);
      expect(changed.has('block/extra')).toBe(false);
    });
  });
});
