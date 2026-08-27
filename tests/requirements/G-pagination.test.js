// @vitest-environment jsdom
/**
 * G1-G6: Pagination
 *
 * G1: Server generates separate HTML files per page
 * G2: Pagination links are real anchors (work without JS)
 * G3: Client intercept only after dataset loaded
 * G4: Client pagination doesn't reload page
 * G5: Pagination via common reactivity mechanism
 * G6: URL updates on client navigation
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readBuiltHTML } from './helpers.js';
import fs from 'fs';
import path from 'path';

const OUTPUT_PUBLIC = path.join(process.cwd(), 'output', 'public');

describe('G. Pagination', () => {
  describe('G1: Server generates separate HTML files per page', () => {
    it('each page is a separate HTML file', () => {
      const page1Path = path.join(OUTPUT_PUBLIC, 'catalog', 'books', 'page', '1.html');
      const page2Path = path.join(OUTPUT_PUBLIC, 'catalog', 'books', 'page', '2.html');
      const page3Path = path.join(OUTPUT_PUBLIC, 'catalog', 'books', 'page', '3.html');

      expect(fs.existsSync(page1Path)).toBe(true);
      expect(fs.existsSync(page2Path)).toBe(true);
      expect(fs.existsSync(page3Path)).toBe(true);
    });

    it('5 books with perPage=2 generates 3 pages', () => {
      const pageDir = path.join(OUTPUT_PUBLIC, 'catalog', 'books', 'page');
      const files = fs.readdirSync(pageDir).filter(f => f.endsWith('.html'));

      expect(files.length).toBe(3);
    });

    it('each page contains its portion of items', () => {
      const page1 = readBuiltHTML('catalog/books/page/1.html');
      const page2 = readBuiltHTML('catalog/books/page/2.html');
      const page3 = readBuiltHTML('catalog/books/page/3.html');

      // Page 1: first 2 books
      expect(page1).toContain('Мастер и Маргарита');
      expect(page1).toContain('1984');

      // Page 2: next 2 books
      expect(page2).toContain('Война и мир');
      expect(page2).toContain('Преступление и наказание');

      // Page 3: last book
      expect(page3).toContain('Гарри Поттер');
    });
  });

  describe('G2: Pagination links are real anchors', () => {
    it('page links are <a> tags with href to other pages', () => {
      const html = readBuiltHTML('catalog/books/page/1.html');

      // Should contain links to other pages
      expect(html).toContain('page/2');
      expect(html).toContain('data-page');
    });

    it('links work without JavaScript (are real anchors)', () => {
      const html = readBuiltHTML('catalog/books/page/1.html');

      // Links should be standard <a> tags
      const linkMatch = html.match(/<a[^>]*href="[^"]*page\/2[^"]*"[^>]*>/);
      expect(linkMatch).not.toBeNull();
    });

    it('last page only has prev, no next', () => {
      const html = readBuiltHTML('catalog/books/page/3.html');

      // Should have rel="prev" but not rel="next"
      expect(html).toContain('rel="prev"');
      expect(html).not.toContain('rel="next"');
    });
  });

  describe('G3: Client intercept only after dataset loaded', () => {
    it('before dataset load, pagination links cause page navigation', () => {
      const html = readBuiltHTML('catalog/books/page/1.html');

      // The page should be fully functional as a static page
      // Pagination links should be real anchors by default
      expect(html).toContain('href=');
      expect(html).toContain('page/2');
    });
  });

  describe('G4: Client pagination does not reload page', () => {
    it('pagination container has data-ignition-pagination attribute', () => {
      const html = readBuiltHTML('catalog/books/page/1.html');

      expect(html).toContain('data-ignition-pagination');
    });

    it('pagination config contains dataUrl for client-side fetch', () => {
      const html = readBuiltHTML('catalog/books/page/1.html');

      const match = html.match(/data-ignition-pagination='(\{[^']+\})'/);
      expect(match).not.toBeNull();

      const config = JSON.parse(match[1]);
      expect(config.dataUrl).toBeDefined();
      expect(config.dataUrl).toMatch(/\.json$/);
      expect(config.templateUrl).toBeDefined();
    });
  });

  describe('G5: Pagination via common reactivity mechanism', () => {
    it('pagination client script integrates with the common runtime, no duplicated helpers', () => {
      const jsPath = path.join(process.cwd(), 'engine', 'core', 'assets', 'ignition-pagination.js');
      const src = fs.readFileSync(jsPath, 'utf8');

      // Reuses the common runtime rather than a bespoke class
      expect(src).toContain('window.ignition');
      expect(src).toContain('runtime.registerTemplate');
      expect(src).toContain('runtime.fetchJson');
      expect(src).toContain('runtime.hydrate');

      // No longer re-implements helper registration (single source from helpers.js)
      expect(src).not.toContain("registerHelper('times'");
      expect(src).not.toContain('Register ONLY if helper');

      // Exposes the page slice as reactive state (state[collection] + currentPage)
      expect(src).toContain('state[config.collection]');
      expect(src).toContain('__pagination');
    });

    it('pagination data is in output/data/ as external JSON', () => {
      const dataPath = path.join(OUTPUT_PUBLIC, 'data', 'catalog', 'books.json');
      expect(fs.existsSync(dataPath)).toBe(true);

      const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      expect(Array.isArray(data.products)).toBe(true);
      expect(data.products.length).toBe(5);
    });

    it('pagination template is in output/templates/ for client use', () => {
      const templatePath = path.join(OUTPUT_PUBLIC, 'templates', 'catalog', 'page.hbs');
      expect(fs.existsSync(templatePath)).toBe(true);
    });
  });

  describe('G6: URL updates on client navigation', () => {
    it('pagination config includes page info for URL updates', () => {
      const html = readBuiltHTML('catalog/books/page/1.html');

      const match = html.match(/data-ignition-pagination='(\{[^']+\})'/);
      expect(match).not.toBeNull();

      const config = JSON.parse(match[1]);
      expect(config.currentPage).toBe(1);
      expect(config.totalPages).toBeDefined();
    });
  });
});
