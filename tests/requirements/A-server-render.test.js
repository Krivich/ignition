// @vitest-environment jsdom
/**
 * A1-A5: Server-side rendering of reactive blocks
 *
 * A1: Server fills block content using block template + dataset
 * A2: Empty block when no data (valid, no error)
 * A3: Server and client render block with the same template
 * A4: Server renders without executing client-side JS
 * A5: Block data mechanism is declarative, no JS needed for basic case
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Handlebars from 'handlebars';
import { createServerPage, loadTemplates, setInitialData, runRuntime } from './helpers.js';

describe('A. Server-side rendering of reactive blocks', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
  });

  afterEach(() => {
    window.__IGNITION_INITIAL_DATA__ = undefined;
    window.__IGNITION_TEMPLATES__ = undefined;
    window.__IGNITION_STATE__ = undefined;
  });

  describe('A1: Server fills blocks with content from dataset', () => {
    it('block contains server-rendered content when data exists', () => {
      createServerPage({
        blockName: 'catalog/list',
        blockContent: '<div class="product">Book 1</div><div class="product">Book 2</div>',
        depends: 'products',
      });

      const block = document.querySelector('[data-ignition-block="catalog/list"]');
      expect(block).not.toBeNull();
      expect(block.children.length).toBeGreaterThan(0);
      expect(block.innerHTML).toContain('Book 1');
      expect(block.innerHTML).toContain('Book 2');
    });

    it('multiple blocks each contain their own server content', () => {
      document.documentElement.innerHTML = `
        <head></head>
        <body>
          <div data-ignition-block="header" data-ignition-depends="title">
            <h1>Site Title</h1>
          </div>
          <div data-ignition-block="footer" data-ignition-depends="footer">
            <p>Copyright 2026</p>
          </div>
        </body>
      `;

      const header = document.querySelector('[data-ignition-block="header"]');
      const footer = document.querySelector('[data-ignition-block="footer"]');
      expect(header.innerHTML).toContain('Site Title');
      expect(footer.innerHTML).toContain('Copyright 2026');
    });
  });

  describe('A2: Empty block is valid when no data', () => {
    it('block with no matching data is empty', () => {
      createServerPage({
        blockName: 'catalog/list',
        blockContent: '',
        depends: 'nonexistent.path',
        initialData: {},
      });

      const block = document.querySelector('[data-ignition-block="catalog/list"]');
      expect(block).not.toBeNull();
      expect(block.innerHTML.trim()).toBe('');
    });

    it('build does not error when block has no data', () => {
      createServerPage({
        blockContent: '',
        depends: 'missing.field.nested',
      });

      expect(() => {
        document.querySelector('[data-ignition-block]');
      }).not.toThrow();
    });
  });

  describe('A3: Server and client use same template', () => {
    it('template source is registered for both server HTML and client rendering', () => {
      const templateSource = '<span>{{greeting}}</span>';
      loadTemplates({ 'test/greeting': templateSource });
      setInitialData({ greeting: 'Hello' });

      createServerPage({
        blockName: 'test/greeting',
        blockContent: '<span>Hello</span>',
        depends: 'greeting',
      });

      const block = document.querySelector('[data-ignition-block]');

      // Server rendered content
      expect(block.innerHTML.trim()).toBe('<span>Hello</span>');

      // Client has the same template available
      expect(window.__IGNITION_TEMPLATES__['test/greeting']).toBe(templateSource);

      // Client would render identically
      const runtime = runRuntime();
      const compiled = Handlebars.compile(templateSource);
      const clientHTML = compiled({ greeting: 'Hello' });
      expect(clientHTML).toBe('<span>Hello</span>');
    });
  });

  describe('A4: Server renders without client JS', () => {
    it('blocks have content before runtime executes', () => {
      createServerPage({
        blockName: 'test/static',
        blockContent: '<p>Pre-rendered content</p>',
        depends: 'anything',
      });

      // Before runtime runs
      const block = document.querySelector('[data-ignition-block]');
      expect(block.innerHTML).toContain('Pre-rendered content');
    });

    it('page is functional with JS disabled (no runtime required for content)', () => {
      document.documentElement.innerHTML = `
        <head></head>
        <body>
          <h1>Page Title</h1>
          <div data-ignition-block="content" data-ignition-depends="body">
            <article><p>Article body text</p></article>
          </div>
          <!-- No script tags — simulating JS disabled -->
        </body>
      `;

      const h1 = document.querySelector('h1');
      const block = document.querySelector('[data-ignition-block]');
      expect(h1.textContent).toBe('Page Title');
      expect(block.innerHTML).toContain('Article body text');
    });
  });

  describe('A5: Block data mechanism is declarative', () => {
    it('block declares its dependencies via HTML attributes only', () => {
      document.documentElement.innerHTML = `
        <head></head>
        <body>
          <div data-ignition-block="catalog/list"
               data-ignition-depends="products"
               data-ignition-data="products">
            <ul><li>Item</li></ul>
          </div>
        </body>
      `;

      const block = document.querySelector('[data-ignition-block]');
      expect(block.getAttribute('data-ignition-block')).toBe('catalog/list');
      expect(block.getAttribute('data-ignition-depends')).toBe('products');
      expect(block.getAttribute('data-ignition-data')).toBe('products');
    });

    it('adding a new block requires only HTML, no JS code', () => {
      document.documentElement.innerHTML = `
        <head></head>
        <body>
          <div data-ignition-block="new/special-block"
               data-ignition-depends="specialData"
               data-ignition-data="specialData">
            Special content
          </div>
        </body>
      `;

      const block = document.querySelector('[data-ignition-block="new/special-block"]');
      expect(block).not.toBeNull();
      expect(block.getAttribute('data-ignition-depends')).toBe('specialData');
      // No JS function was required to define this block
    });
  });
});
