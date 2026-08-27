import { describe, it, expect } from 'vitest';
import { extractIgnitionPaths, deriveInitialState } from '../../engine/utils/deriveInitialState.js';

describe('deriveInitialState', () => {
  const fullData = {
    title: 'Каталог',
    products: [{ id: 1, name: 'A' }, { id: 2, name: 'B' }],
    categories: ['x', 'y'],
    ui: { query: '', valid: false },
    form: { email: '', errors: { email: null } },
    unused: { big: [1, 2, 3, 4, 5] }
  };

  it('extracts paths from bindings, class, attr and block data', () => {
    const html = `
      <div data-ignition-block="list" data-ignition-data="products" data-ignition-depends="products"></div>
      <input data-ignition-binding="ui.query">
      <button data-ignition-class="is-active: ui.valid" data-ignition-attr-disabled="!ui.valid"></button>
      <span data-ignition-attr-aria-invalid="form.errors.email"></span>
    `;
    const paths = extractIgnitionPaths(html);
    expect(paths).toContain('products');
    expect(paths).toContain('ui.query');
    expect(paths).toContain('ui.valid');
    expect(paths).toContain('form.errors.email');
  });

  it('returns full data when interactive attributes are present', () => {
    const html = `
      <div data-ignition-block="list" data-ignition-data="products" data-ignition-depends="products"></div>
      <input data-ignition-binding="ui.query">
    `;
    const subset = deriveInitialState(html, fullData);
    expect(subset).toEqual(fullData);
  });

  it('derives a compact subset for pure block pages', () => {
    const html = `
      <div data-ignition-block="list" data-ignition-data="products, categories" data-ignition-depends="products, categories"></div>
    `;
    const subset = deriveInitialState(html, fullData);
    expect(subset).toEqual({
      products: fullData.products,
      categories: fullData.categories
    });
  });

  it('honors data-ignition-include for hidden state on pure block pages', () => {
    const html = `
      <div data-ignition-block="list" data-ignition-data="products" data-ignition-depends="products"></div>
      <meta data-ignition-include="unused">
    `;
    const subset = deriveInitialState(html, fullData);
    expect(subset.products).toEqual(fullData.products);
    expect(subset.unused).toEqual({ big: [1, 2, 3, 4, 5] });
  });
});
