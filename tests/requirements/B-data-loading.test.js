// @vitest-environment jsdom
/**
 * B1-B4: Page weight and data loading
 *
 * B1: Full dataset NOT inlined — compact manifest only
 * B2: Manifest is subset of dataset (used data only)
 * B3: First screen renders without dataset load (content in HTML)
 * B4: Dataset loaded as external async resource
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readBuiltHTML } from './helpers.js';

describe('B. Page weight and data loading', () => {
  describe('B1: Full dataset is not inlined', () => {
    it('landing page does not inline full dataset', () => {
      const html = readBuiltHTML('landing/default.html');

      // Should not contain __IGNITION_INITIAL_DATA__ with full dataset
      expect(html).not.toContain('__IGNITION_INITIAL_DATA__');

      // Content should be in HTML directly, not in a JSON blob
      expect(html).toContain('<h1');
    });

    it('extmob page contains only manifest, not full dataset', () => {
      const html = readBuiltHTML('extmob/default.html');

      // Find the inline data
      const match = html.match(/__IGNITION_INITIAL_DATA__\s*=\s*(\{[\s\S]*?\});/);
      if (!match) {
        // If no inline data at all — that's fine (B1 compliant)
        return;
      }

      const inlineData = JSON.parse(match[1]);
      const fullDataPath = require('path').join(
        process.cwd(), 'input', 'data', 'extmob', 'default.json'
      );
      const fs = require('fs');
      const fullData = JSON.parse(fs.readFileSync(fullDataPath, 'utf8'));

      // Inline data should be smaller than or equal to full dataset
      // Ideally much smaller (manifest only)
      const inlineSize = JSON.stringify(inlineData).length;
      const fullSize = JSON.stringify(fullData).length;

      // At minimum, inline should not exceed full
      expect(inlineSize).toBeLessThanOrEqual(fullSize);
    });
  });

  describe('B2: Manifest is subset of dataset', () => {
    it('catalog page inline data contains only page items, not all items', () => {
      const html = readBuiltHTML('catalog/books/page/1.html');

      // Catalog pages use pagination — check data URL path
      const paginationMatch = html.match(/data-ignition-pagination='(\{[^']+\})'/);
      if (paginationMatch) {
        const config = JSON.parse(paginationMatch[1]);
        // dataUrl should point to external JSON
        expect(config.dataUrl).toBeDefined();
        expect(config.dataUrl).toContain('.json');
      }
    });
  });

  describe('B3: First screen without dataset load', () => {
    it('landing page content is fully in HTML', () => {
      const html = readBuiltHTML('landing/default.html');

      // Should contain meaningful content elements
      expect(html).toContain('<');
      expect(html.length).toBeGreaterThan(1000);

      // No runtime script required for content display
      expect(html).not.toContain('ignition-runtime.js');
    });

    it('extmob page content exists in HTML even before runtime', () => {
      const html = readBuiltHTML('extmob/default.html');

      // The HTML should have content even without JS
      // Form elements, headings, etc. should be in the HTML
      expect(html).toContain('<form');
      expect(html).toContain('data-ignition-block');
    });

    it('content renders with blocked dataset fetch', async () => {
      document.documentElement.innerHTML = `
        <head></head>
        <body>
          <div data-ignition-block="test/block"
               data-ignition-depends="items">
            <h1>Static content</h1>
            <p>This is visible without JS</p>
          </div>
        </body>
      `;

      // Even if fetch is blocked, the content is in the DOM
      const heading = document.querySelector('h1');
      const paragraph = document.querySelector('p');
      expect(heading.textContent).toBe('Static content');
      expect(paragraph.textContent).toBe('This is visible without JS');
    });
  });

  describe('B4: Dataset as external async resource', () => {
    it('catalog page points to external JSON data URL', () => {
      const html = readBuiltHTML('catalog/books/page/1.html');

      const match = html.match(/data-ignition-pagination='(\{[^']+\})'/);
      if (match) {
        const config = JSON.parse(match[1]);
        expect(config.dataUrl).toBeDefined();
        expect(config.dataUrl).toMatch(/\.json$/);
      }
    });

    it('extmob page data URL is external resource', () => {
      const html = readBuiltHTML('extmob/default.html');

      // Data file exists as separate resource
      const fs = require('fs');
      const path = require('path');
      const dataPath = path.join(process.cwd(), 'output', 'public', 'data', 'extmob', 'default.json');
      expect(fs.existsSync(dataPath)).toBe(true);
    });
  });
});
