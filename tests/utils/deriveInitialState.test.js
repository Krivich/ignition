import { describe, it, expect } from 'vitest';
import { extractIgnitionPaths, deriveInitialState, needsRuntime } from '../../engine/utils/deriveInitialState.js';

describe('needsRuntime — активация реактивного рантайма', () => {
  it('НЕТ: чистая статическая страница без признаков живости', () => {
    expect(needsRuntime('<html><body><h1 data-ignition-text="title">Welcome</h1></body></html>')).toBe(false);
  });

  it('НЕТ: data-ignition-block без пагинации/контроллера/интерактива (статическая композиция)', () => {
    const html = '<div data-ignition-block="layout/footer" data-ignition-data="footer" data-ignition-depends="footer"></div>';
    expect(needsRuntime(html)).toBe(false);
  });

  it('ДА: пагинация — системный мини-контроллер (data-ignition-pagination)', () => {
    const html = '<div id="p" data-ignition-pagination=\'{"collection":"products"}\'></div>';
    expect(needsRuntime(html)).toBe(true);
  });

  it('ДА: интерактивные атрибуты (binding/class/attr)', () => {
    expect(needsRuntime('<input data-ignition-binding="ui.query">')).toBe(true);
    expect(needsRuntime('<button data-ignition-class="is-active: ui.valid"></button>')).toBe(true);
  });

  it('ДА: автобиндинги из анализа шаблона (value="{{path}}")', () => {
    expect(needsRuntime('<input value="{{ui.query}}">', { autobindings: [{ path: 'ui.query' }] })).toBe(true);
  });
});

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

  it('includes auto-generated data-ignition-text paths in the compact subset', () => {
    const html = '<span data-ignition-text="ui.query">{{ui.query}}</span>';
    const subset = deriveInitialState(html, fullData);
    expect(extractIgnitionPaths(html)).toContain('ui.query');
    expect(subset).toEqual({ ui: { query: '' } });
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
