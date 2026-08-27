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

describe('Reactivity: Form (validation + async)', () => {
  let server;
  let browser;
  let baseUrl;
  let tmpDir;

  beforeAll(async () => {
    await fs.mkdir(path.join(projectRoot, 'tmp'), { recursive: true });
    tmpDir = await fs.mkdtemp(path.join(projectRoot, 'tmp', 'reactivity-form-'));
    const inputDir = path.join(tmpDir, 'input');
    const templatesDir = path.join(inputDir, 'templates');
    const dataDir = path.join(inputDir, 'data');

    await fs.cp(
      path.join(projectRoot, 'tests', 'fixtures', 'form', 'templates'),
      templatesDir,
      { recursive: true }
    );
    await fs.cp(
      path.join(projectRoot, 'tests', 'fixtures', 'form', 'data'),
      dataDir,
      { recursive: true }
    );

    const assetsSrc = path.join(projectRoot, 'engine', 'core', 'assets');
    const assetsDest = path.join(tmpDir, 'output', 'public', 'assets');
    await fs.mkdir(assetsDest, { recursive: true });
    try {
      await fs.copyFile(
        path.join(assetsSrc, 'ignition-runtime.js'),
        path.join(assetsDest, 'ignition-runtime.js')
      );
    } catch { /* expected */ }

    await execFileAsync('node', [
      cliPath, 'build',
      '--source', path.join(tmpDir, 'input'),
      '--output', path.join(tmpDir, 'output'),
      '--domain', 'https://test.com'
    ], { timeout: 30000 });

    const outputDir = path.join(tmpDir, 'output', 'public');
    server = createServer((req, res) => {
      const url = req.url === '/' ? '/index.html' : req.url;
      const filePath = path.join(outputDir, url);
      fs.readFile(filePath)
        .then(data => {
          const ext = path.extname(filePath);
          const mime = {
            '.html': 'text/html', '.json': 'application/json',
            '.js': 'application/javascript'
          }[ext] || 'text/plain';
          res.writeHead(200, { 'Content-Type': mime });
          res.end(data);
        })
        .catch(() => { res.writeHead(404); res.end('Not found'); });
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

  it('SSR renders form with empty fields', async () => {
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/form/default.html`);
    await page.waitForLoadState('networkidle');

    const nameInput = page.locator('input[data-ignition-binding="form.fields.name"]');
    const visible = await nameInput.isVisible();
    expect(visible).toBe(true);
    const value = await nameInput.inputValue();
    expect(value).toBe('');

    await page.close();
  });

  it('typing in field updates state (input → state)', async () => {
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/form/default.html`);
    await page.waitForLoadState('networkidle');

    await page.fill('input[data-ignition-binding="form.fields.name"]', 'Алексей');

    // State should be updated
    const stateValue = await page.evaluate(() => {
      return window.__IGNITION_STATE__?.form?.fields?.name;
    });
    expect(stateValue).toBe('Алексей');

    await page.close();
  });

  it('validation error appears for empty required field', async () => {
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/form/default.html`);
    await page.waitForLoadState('networkidle');

    // Focus and blur name field to trigger validation
    await page.click('input[data-ignition-binding="form.fields.name"]');
    await page.click('input[data-ignition-binding="form.fields.email"]');

    // Error should appear
    await page.waitForFunction(() => {
      return document.querySelector('.error') !== null;
    }, { timeout: 5000 });

    const errors = await page.locator('.error').allTextContents();
    expect(errors.length).toBeGreaterThan(0);

    await page.close();
  });

  it('submit button is disabled when form is invalid', async () => {
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/form/default.html`);
    await page.waitForLoadState('networkidle');

    const btn = page.locator('button[type="submit"]');
    const disabled = await btn.isDisabled();
    expect(disabled).toBe(true);

    await page.close();
  });

  it('submit button enables when form is valid', async () => {
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/form/default.html`);
    await page.waitForLoadState('networkidle');

    await page.fill('input[data-ignition-binding="form.fields.name"]', 'Тест');
    await page.fill('input[data-ignition-binding="form.fields.email"]', 'test@test.com');
    await page.fill('textarea[data-ignition-binding="form.fields.message"]', 'Привет');

    // Wait for validation to pass
    await page.waitForFunction(() => {
      const btn = document.querySelector('button[type="submit"]');
      return btn && !btn.disabled;
    }, { timeout: 5000 });

    const isDisabled = await page.locator('button[type="submit"]').getAttribute('disabled');
    expect(isDisabled).not.toBe(true);

    await page.close();
  });

  it('submit shows spinner then success', async () => {
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/form/default.html`);
    await page.waitForLoadState('networkidle');

    // Fill form
    await page.fill('input[data-ignition-binding="form.fields.name"]', 'Тест');
    await page.fill('input[data-ignition-binding="form.fields.email"]', 'test@test.com');
    await page.fill('textarea[data-ignition-binding="form.fields.message"]', 'Сообщение');

    await page.waitForFunction(() => {
      const btn = document.querySelector('button[type="submit"]');
      return btn && !btn.disabled;
    });

    // Submit
    await page.click('button[type="submit"]');

    // Should show spinner
    await page.waitForFunction(() => {
      return document.querySelector('.spinner') !== null;
    }, { timeout: 5000 });

    const spinnerVisible = await page.locator('.spinner').isVisible();
    expect(spinnerVisible).toBe(true);

    await page.close();
  });

  it('"Send again" resets form to initial state', async () => {
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/form/default.html`);
    await page.waitForLoadState('networkidle');

    // Fill, submit, wait for success
    await page.fill('input[data-ignition-binding="form.fields.name"]', 'Тест');
    await page.fill('input[data-ignition-binding="form.fields.email"]', 't@t.com');
    await page.fill('textarea[data-ignition-binding="form.fields.message"]', 'Ок');
    await page.waitForFunction(() => !document.querySelector('button[type="submit"]')?.disabled);
    await page.click('button[type="submit"]');

    // Wait for success state
    await page.waitForFunction(() => {
      return document.querySelector('.success') !== null;
    }, { timeout: 10000 });

    // Click "send again"
    await page.click('.success button');

    // Form should be visible again with empty fields
    await page.waitForFunction(() => {
      const nameInput = document.querySelector('input[data-ignition-binding="form.fields.name"]');
      return nameInput && nameInput.value === '';
    }, { timeout: 5000 });

    await page.close();
  });
});
