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

// Real-browser validation of fine-grained row-scoped projections. jsdom DOM-op
// metrics are unreliable (documented methodology trap), so the point update
// must be proven in Chromium: mutate one cell -> only that cell's text changes.
describe('fine-grained row projections in a real browser', () => {
  let server;
  let browser;
  let baseUrl;
  let tmpDir;

  beforeAll(async () => {
    await fs.mkdir(path.join(projectRoot, 'tmp'), { recursive: true });
    tmpDir = await fs.mkdtemp(path.join(projectRoot, 'tmp', 'fine-grained-browser-'));
    const outputDir = path.join(tmpDir, 'output');

    // Build the real project input (includes the demo layout + controller)
    // into an isolated temp output so we never touch output/public.
    await execFileAsync('node', [
      cliPath, 'build',
      '--source', path.join(projectRoot, 'input'),
      '--output', outputDir,
      '--domain', 'https://example.com'
    ], { timeout: 60000 });

    const publicDir = path.join(outputDir, 'public');
    server = createServer((req, res) => {
      const urlPath = req.url === '/' ? '/index.html' : req.url;
      const filePath = path.join(publicDir, decodeURIComponent(urlPath.split('?')[0]));
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
    browser = await chromium.launch();
  });

  afterAll(async () => {
    await browser?.close();
    server?.close();
    if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('SSR страницы содержит row-маркеры, авто-ключи и @p-стикеры', async () => {
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/demo/app.html`);
    await page.waitForLoadState('networkidle');

    // Row markers: one per product (5 in the demo data).
    expect(await page.locator('[data-ignition-row="products"]').count()).toBe(5);
    // Auto-keyed rows: the row references {{id}}, so the compiler stamped
    // data-ignition-key (stable row identity for the reconcile).
    expect(await page.locator('[data-ignition-row="products"][data-ignition-key]').count()).toBe(5);
    expect(await page.locator('[data-ignition-row="products"]').first().getAttribute('data-ignition-key')).toBe('1');
    // Each price cell carries a row-scoped sticker.
    expect(await page.locator('.p-price[data-ignition-text="@p:products.*.price"]').count()).toBe(5);
    // SSR text is in place before any JS runs (no-JS page is complete).
    const prices = await page.locator('.p-price').allTextContents();
    expect(prices).toEqual(['59990', '1990', '3490', '17990', '4990']);
    await page.close();
  });

  it('leaf-обновление одной ячейки перерисовывает ТОЛЬКО её (не весь список)', async () => {
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/demo/app.html`);
    await page.waitForLoadState('networkidle');

    // Deterministic: bump product[2].price via the exposed live state.
    await page.evaluate(() => {
      window.ignition.state.products[2].price += 1;
    });

    // The @p sticker for cell 2 patches it without a block re-render.
    await page.waitForFunction(() => {
      const prices = Array.from(document.querySelectorAll('.p-price'));
      return prices[2] && prices[2].textContent === '3491';
    });

    const prices = await page.locator('.p-price').allTextContents();
    // Only index 2 changed (3490 -> 3491); every other cell is untouched.
    expect(prices).toEqual(['59990', '1990', '3491', '17990', '4990']);
    await page.close();
  });

  it('кнопка «Цена +1» обновляет ровно одну ячейку цены', async () => {
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/demo/app.html`);
    await page.waitForLoadState('networkidle');

    const before = await page.locator('.p-price').allTextContents();
    await page.click('#bumpBtn');
    await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('products['));

    const after = await page.locator('.p-price').allTextContents();
    const diffs = before.map((v, i) => after[i] !== v ? i : -1).filter(x => x !== -1);
    // Exactly one cell changed, by +1.
    expect(diffs.length).toBe(1);
    expect(parseInt(after[diffs[0]], 10)).toBe(parseInt(before[diffs[0]], 10) + 1);
    await page.close();
  });

  it('структурный add: блок ре-рендерится (появляется новая строка), существующие ячейки целы', async () => {
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/demo/app.html`);
    await page.waitForLoadState('networkidle');

    // Auto-block subscribes structural-only to products (data-ignition-fine).
    await page.click('#addBtn');
    await page.waitForFunction(() => document.querySelectorAll('.product').length === 6);

    const rows = await page.locator('.product').count();
    expect(rows).toBe(6);

    // Existing SSR rows keep their exact values - the block re-render did not
    // clobber the fine-grained stickers.
    const firstRow = await page.locator('.product').first().locator('.p-price').textContent();
    expect(firstRow).toBe('59990');
    await page.close();
  });

  it('фокус и введённый текст в строке переживают структурную вставку сверху (keyed reconcile)', async () => {
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/demo/app.html`);
    await page.waitForLoadState('networkidle');

    // Focus an input in an existing row and type into it.
    const note = page.locator('.p-note').nth(2);
    await note.click();
    await page.keyboard.type('моя заметка');
    expect(await note.inputValue()).toBe('моя заметка');

    // Trigger a structural insert ABOVE the focused row programmatically (not
    // via a button click, which would move focus to the button itself). The
    // keyed reconcile must keep the same DOM node for every existing row, so
    // the focused input keeps its identity, its value and active focus.
    await page.evaluate(() => {
      window.ignition.state.products.unshift({ id: 6, name: 'Товар 6', price: 6000 });
    });
    await page.waitForFunction(() => document.querySelectorAll('.product').length === 6);
    await page.waitForFunction(() => {
      const els = Array.from(document.querySelectorAll('.p-note'));
      return els[3] === document.activeElement && els[3].value === 'моя заметка';
    });

    // Focus, value and the newly inserted row on top are all intact.
    expect(await page.locator('.product').count()).toBe(6);
    const newTopKey = await page.locator('.product').first().getAttribute('data-ignition-key');
    expect(newTopKey).toBe('6');
    const preserved = page.locator('.p-note').nth(3);
    expect(await preserved.inputValue()).toBe('моя заметка');
    const focused = await page.evaluate(() => {
      const el = document.activeElement;
      return el && el.matches('.p-note') && el.value === 'моя заметка';
    });
    expect(focused).toBe(true);
    await page.close();
  });
});
