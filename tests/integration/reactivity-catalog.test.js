import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium } from 'playwright';
import { createServer } from 'http';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import { promisify } from 'util';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..', '..');
const cliPath = path.join(projectRoot, 'engine', 'bin', 'cli.js');
const execFileAsync = promisify(execFile);

describe('Reactivity: Catalog (search + cart)', () => {
  let server;
  let browser;
  let baseUrl;
  let tmpDir;

  beforeAll(async () => {
    // 1. Scaffold fixture into temp dir
    await fs.mkdir(path.join(projectRoot, 'tmp'), { recursive: true });
    tmpDir = await fs.mkdtemp(path.join(projectRoot, 'tmp', 'reactivity-catalog-'));
    const inputDir = path.join(tmpDir, 'input');
    const templatesDir = path.join(inputDir, 'templates');
    const dataDir = path.join(inputDir, 'data');

    // Copy fixture files
    await fs.cp(
      path.join(projectRoot, 'tests', 'fixtures', 'catalog', 'templates'),
      templatesDir,
      { recursive: true }
    );
    await fs.cp(
      path.join(projectRoot, 'tests', 'fixtures', 'catalog', 'data'),
      dataDir,
      { recursive: true }
    );

    // Copy ignition runtime assets (will exist after implementation)
    const assetsSrc = path.join(projectRoot, 'engine', 'core', 'assets');
    const assetsDest = path.join(tmpDir, 'output', 'public', 'assets');
    await fs.mkdir(assetsDest, { recursive: true });
    try {
      await fs.copyFile(
        path.join(assetsSrc, 'ignition-runtime.js'),
        path.join(assetsDest, 'ignition-runtime.js')
      );
    } catch {
      // Runtime not built yet — test will红灯, which is expected
    }

    // 2. Build
    try {
      await execFileAsync('node', [
        cliPath, 'build',
        '--source', path.join(tmpDir, 'input'),
        '--output', path.join(tmpDir, 'output'),
        '--domain', 'https://test.com'
      ], { timeout: 30000 });
    } catch {
      // Build may fail without runtime — expected at this stage
    }

    // 3. Start HTTP server
    const outputDir = path.join(tmpDir, 'output', 'public');
    server = createServer((req, res) => {
      const url = req.url === '/' ? '/index.html' : req.url;
      const filePath = path.join(outputDir, url);
      fs.readFile(filePath)
        .then(data => {
          const ext = path.extname(filePath);
          const mime = {
            '.html': 'text/html',
            '.json': 'application/json',
            '.js': 'application/javascript',
            '.css': 'text/css'
          }[ext] || 'text/plain';
          res.writeHead(200, { 'Content-Type': mime });
          res.end(data);
        })
        .catch(() => {
          res.writeHead(404);
          res.end('Not found');
        });
    });

    await new Promise(resolve => server.listen(0, resolve));
    baseUrl = `http://localhost:${server.address().port}`;

    // 4. Launch browser
    browser = await chromium.launch();
  });

  afterAll(async () => {
    await browser?.close();
    server?.close();
    if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('SSR renders catalog page with product list', async () => {
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/catalog/books.html`);
    await page.waitForLoadState('networkidle');

    // SSR should render the initial product list
    const items = await page.locator('.product-card').count();
    expect(items).toBe(4);

    await page.close();
  });

  it('search input filters products without reload', async () => {
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/catalog/books.html`);
    await page.waitForLoadState('networkidle');

    // Track no real navigation
    let hadUnload = false;
    await page.evaluate(() => {
      window.addEventListener('beforeunload', () => { window.__beforeUnload = true; });
    });

    // Type in search
    await page.fill('input[data-ignition-binding="ui.searchQuery"]', 'книг');

    // Wait for filtered results
    await page.waitForFunction(() => {
      const cards = document.querySelectorAll('.product-card');
      return cards.length === 1;
    }, { timeout: 5000 });

    const items = await page.locator('.product-card h3').allTextContents();
    expect(items).toEqual(['Книга по JavaScript']);

    // No full page reload
    hadUnload = await page.evaluate(() => window.__beforeUnload === true);
    expect(hadUnload).toBe(false);

    await page.close();
  });

  it('category select filters products', async () => {
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/catalog/books.html`);
    await page.waitForLoadState('networkidle');

    await page.selectOption('select[data-ignition-binding="ui.activeCategory"]', 'electronics');

    await page.waitForFunction(() => {
      const cards = document.querySelectorAll('.product-card');
      return cards.length === 2;
    }, { timeout: 5000 });

    const items = await page.locator('.product-card h3').allTextContents();
    expect(items).toContain('Ноутбук ThinkPad');
    expect(items).toContain('Мышь Logitech');

    await page.close();
  });

  it('"Add to cart" updates cart-header block', async () => {
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/catalog/books.html`);
    await page.waitForLoadState('networkidle');

    // Initially cart is empty
    const emptyText = await page.locator('.cart-empty').textContent();
    expect(emptyText).toContain('пуста');

    // Click "В корзину" on first product
    await page.click('.product-card:first-child button');

    // Cart header should update
    await page.waitForFunction(() => {
      const count = document.querySelector('.cart-count');
      return count && count.textContent.includes('1');
    }, { timeout: 5000 });

    const countText = await page.locator('.cart-count').textContent();
    expect(countText).toContain('1');

    await page.close();
  });

  it('cart details list shows added items', async () => {
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/catalog/books.html`);
    await page.waitForLoadState('networkidle');

    // Add two items
    await page.click('.product-card:nth-child(1) button');
    await page.waitForFunction(() => document.querySelector('.cart-count'));

    await page.click('.product-card:nth-child(2) button');

    // Cart details should show 2 items
    await page.waitForFunction(() => {
      const items = document.querySelectorAll('.cart-details li');
      return items.length === 2;
    }, { timeout: 5000 });

    const cartItems = await page.locator('.cart-details li').allTextContents();
    expect(cartItems).toHaveLength(2);

    await page.close();
  });

  it('remove item from cart updates both cart blocks', async () => {
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/catalog/books.html`);
    await page.waitForLoadState('networkidle');

    // Add item
    await page.click('.product-card:first-child button');
    await page.waitForFunction(() => document.querySelector('.cart-count'));

    // Remove it
    await page.click('.cart-details button');

    // Cart should be empty again
    await page.waitForFunction(() => {
      return document.querySelector('.cart-empty') !== null;
    }, { timeout: 5000 });

    const emptyVisible = await page.locator('.cart-empty').isVisible();
    expect(emptyVisible).toBe(true);

    await page.close();
  });

  it('entire interaction without beforeunload (pure CSR)', async () => {
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/catalog/books.html`);
    await page.waitForLoadState('networkidle');

    await page.evaluate(() => {
      window.addEventListener('beforeunload', () => { window.__beforeUnload = true; });
    });

    // Full cycle: search → filter → add to cart → remove → clear search
    await page.fill('input[data-ignition-binding="ui.searchQuery"]', 'мышь');
    await page.waitForFunction(() => document.querySelectorAll('.product-card').length === 1);

    await page.click('.product-card:first-child button');
    await page.waitForFunction(() => document.querySelector('.cart-count'));

    await page.click('.cart-details button');
    await page.waitForFunction(() => document.querySelector('.cart-empty'));

    await page.fill('input[data-ignition-binding="ui.searchQuery"]', '');
    await page.waitForFunction(() => document.querySelectorAll('.product-card').length === 4);

    // No full page reload throughout
    const hadUnload = await page.evaluate(() => window.__beforeUnload === true);
    expect(hadUnload).toBe(false);

    await page.close();
  });
});
