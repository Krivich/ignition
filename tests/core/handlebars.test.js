import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import Handlebars from 'handlebars';
import { registerHelpers, detectPaginationInTemplate, compileTemplate } from '../../core/handlebars.js';
import { parseHandlebarsParams } from '../../core/renderer.js';

// Register helpers before tests
registerHelpers();

describe('parseHandlebarsParams', () => {
  it('parses quoted string values', () => {
    const result = parseHandlebarsParams('collection="products" pageTemplate="catalog/page"');
    expect(result.collection).toBe('products');
    expect(result.pageTemplate).toBe('catalog/page');
  });

  it('parses numeric values', () => {
    const result = parseHandlebarsParams('perPage=10');
    expect(result.perPage).toBe(10);
  });

  it('parses unquoted variable names', () => {
    const result = parseHandlebarsParams('layout=layout dataset=dataset');
    expect(result.layout).toBe('layout');
    expect(result.dataset).toBe('dataset');
  });

  it('parses mixed parameters', () => {
    const result = parseHandlebarsParams(
      'collection="items" perPage=10 pageTemplate="catalog/page" layout=layout dataset=dataset'
    );
    expect(result.collection).toBe('items');
    expect(result.perPage).toBe(10);
    expect(result.pageTemplate).toBe('catalog/page');
    expect(result.layout).toBe('layout');
    expect(result.dataset).toBe('dataset');
  });

  it('derives fullTemplatePath from pageTemplate', () => {
    const result = parseHandlebarsParams('pageTemplate="catalog/page"');
    expect(result.fullTemplatePath).toBe('catalog/page');
    expect(result.templateName).toBe('catalog');
    expect(result.template).toBe('page');
  });

  it('uses fallback format when no pageTemplate', () => {
    const result = parseHandlebarsParams('layout=catalog template=mytemplate');
    expect(result.fullTemplatePath).toBe('catalog/mytemplate');
    expect(result.templateName).toBe('catalog');
  });
});

describe('detectPaginationInTemplate', () => {
  it('detects pagination call with all parameters', () => {
    const template = `
      {{> ignition/pagination collection="products" perPage=10 pageTemplate="catalog/page" layout=layout dataset=dataset}}
    `;
    const config = detectPaginationInTemplate(template);
    expect(config.enabled).toBe(true);
    expect(config.collection).toBe('products');
    expect(config.perPage).toBe(10);
    expect(config.fullTemplatePath).toBe('catalog/page');
  });

  it('returns enabled=false when no pagination call', () => {
    const template = '<div>Hello World</div>';
    const config = detectPaginationInTemplate(template);
    expect(config.enabled).toBe(false);
  });

    it('uses defaults for missing parameters', () => {
    const template = '{{> ignition/pagination collection="items"}}';
    const config = detectPaginationInTemplate(template);
    expect(config.enabled).toBe(true);
    expect(config.collection).toBe('items');
    expect(config.perPage).toBe(10);
  });

  it('does not match bare partial without params', () => {
    const template = '{{> ignition/pagination}}';
    const config = detectPaginationInTemplate(template);
    expect(config.enabled).toBe(false);
  });
});

describe('compileTemplate', () => {
  it('compiles a simple template', () => {
    const template = compileTemplate('<h1>{{title}}</h1>');
    const result = template({ title: 'Hello' });
    expect(result).toBe('<h1>Hello</h1>');
  });

  it('removes ignition directives before compilation', () => {
    const template = compileTemplate(`
      {{!-- ignition: my custom directive --}}
      <h1>{{title}}</h1>
      {{!-- ignition: another directive --}}
    `);
    const result = template({ title: 'Hello' });
    expect(result).toContain('<h1>Hello</h1>');
    expect(result).not.toContain('ignition:');
  });
});

describe('Handlebars helpers', () => {
  describe('times', () => {
    it('iterates from 1 to N', () => {
      const template = Handlebars.compile('{{#times 3}}{{this}} {{/times}}');
      expect(template({})).toBe('1 2 3 ');
    });

    it('returns empty for 0', () => {
      const template = Handlebars.compile('{{#times 0}}x{{/times}}');
      expect(template({})).toBe('');
    });
  });

  describe('ifCond', () => {
    it('evaluates ==', () => {
      const template = Handlebars.compile('{{#ifCond a "==" b}}yes{{else}}no{{/ifCond}}');
      expect(template({ a: 1, b: 1 })).toBe('yes');
      expect(template({ a: 1, b: 2 })).toBe('no');
    });

    it('evaluates >', () => {
      const template = Handlebars.compile('{{#ifCond a ">" b}}yes{{else}}no{{/ifCond}}');
      expect(template({ a: 5, b: 3 })).toBe('yes');
      expect(template({ a: 2, b: 3 })).toBe('no');
    });

    it('evaluates <', () => {
      const template = Handlebars.compile('{{#ifCond a "<" b}}yes{{else}}no{{/ifCond}}');
      expect(template({ a: 2, b: 5 })).toBe('yes');
      expect(template({ a: 5, b: 2 })).toBe('no');
    });

    it('evaluates >=', () => {
      const template = Handlebars.compile('{{#ifCond a ">=" b}}yes{{else}}no{{/ifCond}}');
      expect(template({ a: 3, b: 3 })).toBe('yes');
      expect(template({ a: 2, b: 3 })).toBe('no');
    });

    it('evaluates !=', () => {
      const template = Handlebars.compile('{{#ifCond a "!=" b}}yes{{else}}no{{/ifCond}}');
      expect(template({ a: 1, b: 2 })).toBe('yes');
      expect(template({ a: 1, b: 1 })).toBe('no');
    });
  });

  describe('get', () => {
    it('retrieves nested property', () => {
      const template = Handlebars.compile('{{get obj "a.b.c"}}');
      expect(template({ obj: { a: { b: { c: 42 } } } })).toBe('42');
    });

    it('returns empty for missing path', () => {
      const template = Handlebars.compile('{{get obj "x.y"}}');
      expect(template({ obj: {} })).toBe('');
    });
  });

  describe('concat', () => {
    it('concatenates multiple values', () => {
      const template = Handlebars.compile('{{concat a b c}}');
      expect(template({ a: 'hello', b: ' ', c: 'world' })).toBe('hello world');
    });
  });

  describe('declineWord', () => {
    it('returns singular form for 1', () => {
      const template = Handlebars.compile('{{declineWord count "товар" "товара" "товаров"}}');
      expect(template({ count: 1 })).toBe('товар');
    });

    it('returns dual form for 2-4', () => {
      const template = Handlebars.compile('{{declineWord count "товар" "товара" "товаров"}}');
      expect(template({ count: 2 })).toBe('товара');
      expect(template({ count: 3 })).toBe('товара');
      expect(template({ count: 4 })).toBe('товара');
    });

    it('returns plural form for 5+', () => {
      const template = Handlebars.compile('{{declineWord count "товар" "товара" "товаров"}}');
      expect(template({ count: 5 })).toBe('товаров');
      expect(template({ count: 11 })).toBe('товаров');
      expect(template({ count: 21 })).toBe('товар');
    });

    it('returns five form for 11-19', () => {
      const template = Handlebars.compile('{{declineWord count "товар" "товара" "товаров"}}');
      expect(template({ count: 11 })).toBe('товаров');
      expect(template({ count: 12 })).toBe('товаров');
      expect(template({ count: 19 })).toBe('товаров');
    });

    it('returns one form for 21', () => {
      const template = Handlebars.compile('{{declineWord count "товар" "товара" "товаров"}}');
      expect(template({ count: 21 })).toBe('товар');
    });
  });

  describe('json', () => {
    it('serializes object to JSON', () => {
      const template = Handlebars.compile('{{json value}}');
      const result = template({ value: { a: 1, b: 'hello' } });
      expect(JSON.parse(result)).toEqual({ a: 1, b: 'hello' });
    });

    it('serializes array to JSON', () => {
      const template = Handlebars.compile('{{json value}}');
      const result = template({ value: [1, 2, 3] });
      expect(JSON.parse(result)).toEqual([1, 2, 3]);
    });
  });
});
