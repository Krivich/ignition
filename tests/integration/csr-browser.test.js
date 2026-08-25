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

describe('CSR pagination in real browser', () => {
  let server;
  let browser;
  let baseUrl;
  let tmpDir;

  beforeAll(async () => {
    // 1. Build a site with pagination via CLI
    tmpDir = await fs.mkdtemp(path.join(projectRoot, 'tmp', 'csr-test-'));
    const inputDir = path.join(tmpDir, 'input');
    const templatesDir = path.join(inputDir, 'templates');
    const catalogDir = path.join(templatesDir, 'catalog');
    const dataDir = path.join(inputDir, 'data');

    await fs.mkdir(catalogDir, { recursive: true });

    // Copy pagination partial
    const ignitionDir = path.join(templatesDir, 'ignition');
    await fs.mkdir(ignitionDir, { recursive: true });
    await fs.copyFile(
      path.join(projectRoot, 'engine', 'core', 'partials', 'pagination.hbs'),
      path.join(ignitionDir, 'pagination.hbs')
    );

    // Layout with Handlebars + CSR script
    await fs.writeFile(
      path.join(templatesDir, 'catalog.hbs'),
      `<!DOCTYPE html>
<html>
<head>
  <title>{{title}}</title>
  <script src="https://cdn.jsdelivr.net/npm/handlebars@4.7.8/dist/handlebars.min.js"></script>
  <script src="/assets/ignition-pagination.js" defer></script>
</head>
<body>
  <h1>{{title}}</h1>
  <div id="content">
    {{> ignition/pagination collection="products" perPage=2 pageTemplate="catalog/page" layout=layout dataset=dataset}}
  </div>
</body>
</html>`
    );

    // Page partial
    await fs.writeFile(
      path.join(catalogDir, 'page.hbs'),
      `<div class="items">{{#each items}}<span class="item" data-id="{{id}}">{{name}}</span>{{/each}}</div>
<nav class="pagination">
  {{#times pagination.totalPages}}
    <a href="{{basePath}}{{this}}" data-page="{{this}}">{{this}}</a>
  {{/times}}
</nav>`
    );

    // Data: 5 products
    await fs.mkdir(path.join(dataDir, 'catalog'), { recursive: true });
    await fs.writeFile(
      path.join(dataDir, 'catalog', 'phones.json'),
      JSON.stringify({
        title: 'Phones',
        products: [
          { id: '1', name: 'iPhone' },
          { id: '2', name: 'Samsung' },
          { id: '3', name: 'Pixel' },
          { id: '4', name: 'OnePlus' },
          { id: '5', name: 'Xiaomi' }
        ]
      })
    );

    // Run build
    await execFileAsync('node', [
      cliPath, 'build',
      '--source', path.join(tmpDir, 'input'),
      '--output', path.join(tmpDir, 'output'),
      '--domain', 'https://test.com'
    ], { timeout: 30000 });

    // 2. Start HTTP server
    const outputDir = path.join(tmpDir, 'output', 'public');
    server = createServer((req, res) => {
      const filePath = path.join(outputDir, req.url === '/' ? '/index.html' : req.url);
      fs.readFile(filePath)
        .then(data => {
          const ext = path.extname(filePath);
          const mime = { '.html': 'text/html', '.json': 'application/json', '.js': 'application/javascript' }[ext] || 'text/plain';
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

    // 3. Launch browser
    browser = await chromium.launch();
  });

  afterAll(async () => {
    await browser?.close();
    server?.close();
    if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('SSR renders page 1, then CSR switches pages without reload', async () => {
    const page = await browser.newPage();

    // Track if a full navigation happens (not pushState)
    let navigationCount = 0;
    page.on('framenavigated', frame => {
      if (frame === page.mainFrame()) {
        navigationCount++;
      }
    });

    // Also track beforeunload which only fires on real navigation, not pushState
    let beforeUnloadCount = 0;
    await page.evaluate(() => {
      window.addEventListener('beforeunload', () => { window.__beforeUnload = true; });
    });

    // 1. Open page 1 (SSR)
    await page.goto(`${baseUrl}/catalog/phones/page/1.html`);
    await page.waitForLoadState('networkidle');

    // SSR content is visible immediately
    const ssrItems = await page.locator('.item').allTextContents();
    expect(ssrItems).toEqual(['iPhone', 'Samsung']);

    // Reset counters after initial load
    navigationCount = 1;

    // 2. Click page 2 via CSR
    await page.click('a[data-page="2"]');

    // Wait for CSR to update DOM
    await page.waitForFunction(() => {
      const items = document.querySelectorAll('.item');
      return items.length === 2 && items[0].textContent === 'Pixel';
    });

    // Content changed to page 2 items — CSR fetched JSON + compiled template
    const csrItems2 = await page.locator('.item').allTextContents();
    expect(csrItems2).toEqual(['Pixel', 'OnePlus']);

    // URL updated via history.pushState
    expect(page.url()).toContain('/catalog/phones/page/2');

    // Check beforeunload did NOT fire (means no real navigation happened)
    const hadUnload = await page.evaluate(() => window.__beforeUnload === true);
    expect(hadUnload).toBe(false);

    // 3. Click page 3 via CSR
    await page.click('a[data-page="3"]');

    await page.waitForFunction(() => {
      const items = document.querySelectorAll('.item');
      return items.length === 1 && items[0].textContent === 'Xiaomi';
    });

    const csrItems3 = await page.locator('.item').allTextContents();
    expect(csrItems3).toEqual(['Xiaomi']);
    expect(page.url()).toContain('/catalog/phones/page/3');

    // 4. Click page 1 via CSR — back to first items
    await page.click('a[data-page="1"]');

    await page.waitForFunction(() => {
      const items = document.querySelectorAll('.item');
      return items.length === 2 && items[0].textContent === 'iPhone';
    });

    const backToPage1 = await page.locator('.item').allTextContents();
    expect(backToPage1).toEqual(['iPhone', 'Samsung']);

    // Still no real navigation throughout the entire session
    expect(hadUnload).toBe(false);

    await page.close();
  });
});
