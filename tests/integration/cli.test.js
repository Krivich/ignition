import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import { promisify } from 'util';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..', '..');
const cliPath = path.join(projectRoot, 'engine', 'bin', 'cli.js');
const execFileAsync = promisify(execFile);

async function runCli(args, cwd) {
  const { stdout, stderr } = await execFileAsync('node', [cliPath, ...args], {
    cwd,
    timeout: 30000,
    env: { ...process.env, NODE_ENV: 'production' },
  });
  return { stdout, stderr };
}

async function recursiveRead(dir) {
  const result = {};
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result[entry.name] = await recursiveRead(fullPath);
    } else {
      result[entry.name] = await fs.readFile(fullPath, 'utf8');
    }
  }
  return result;
}

describe('CLI: ignition build', () => {
  let tmpDir;

  beforeEach(async () => {
    await fs.mkdir(path.join(projectRoot, 'tmp'), { recursive: true });
    tmpDir = await fs.mkdtemp(path.join(projectRoot, 'tmp', 'cli-test-'));
    const inputDir = path.join(tmpDir, 'input');
    const templatesDir = path.join(inputDir, 'templates');
    const dataDir = path.join(inputDir, 'data');

    // Create landing template
    await fs.mkdir(templatesDir, { recursive: true });
    await fs.writeFile(
      path.join(templatesDir, 'landing.hbs'),
      '<html><body><h1>{{title}}</h1><p>{{description}}</p></body></html>'
    );

    // Create landing data
    await fs.mkdir(path.join(dataDir, 'landing'), { recursive: true });
    await fs.writeFile(
      path.join(dataDir, 'landing', 'default.json'),
      JSON.stringify({ title: 'My Site', description: 'Welcome' })
    );
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('builds a simple layout: input → output', async () => {
    await runCli([
      'build',
      '--source', path.join(tmpDir, 'input'),
      '--output', path.join(tmpDir, 'output'),
      '--domain', 'https://test.com'
    ], projectRoot);

    // Verify output exists
    const htmlPath = path.join(tmpDir, 'output', 'public', 'landing', 'default.html');
    const content = await fs.readFile(htmlPath, 'utf8');
    expect(content).toContain('<h1>My Site</h1>');
    expect(content).toContain('<p>Welcome</p>');
  });

  it('builds multiple layouts and datasets', async () => {
    // Add a catalog layout
    const catalogDir = path.join(tmpDir, 'input', 'templates', 'catalog');
    await fs.mkdir(catalogDir, { recursive: true });

    // Copy pagination partial
    const ignitionDir = path.join(tmpDir, 'input', 'templates', 'ignition');
    await fs.mkdir(ignitionDir, { recursive: true });
    await fs.copyFile(
      path.join(projectRoot, 'engine', 'core', 'partials', 'pagination.hbs'),
      path.join(ignitionDir, 'pagination.hbs')
    );

    await fs.writeFile(
      path.join(tmpDir, 'input', 'templates', 'catalog.hbs'),
      `<html><body>
<h1>{{title}}</h1>
{{> ignition/pagination collection="products" perPage=2 pageTemplate="catalog/page" layout=layout dataset=dataset}}
</body></html>`
    );

    await fs.writeFile(
      path.join(catalogDir, 'page.hbs'),
      `<div class="items">{{#each items}}<span>{{name}}</span>{{/each}}</div>
<nav>{{#times pagination.totalPages}}<a data-page="{{this}}">{{this}}</a>{{/times}}</nav>`
    );

    await fs.mkdir(path.join(tmpDir, 'input', 'data', 'catalog'), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, 'input', 'data', 'catalog', 'phones.json'),
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

    await runCli([
      'build',
      '--source', path.join(tmpDir, 'input'),
      '--output', path.join(tmpDir, 'output'),
      '--domain', 'https://test.com'
    ], projectRoot);

    // Landing was built
    const landing = await fs.readFile(
      path.join(tmpDir, 'output', 'public', 'landing', 'default.html'), 'utf8'
    );
    expect(landing).toContain('My Site');

    // Catalog pages were built (5 items / perPage=2 = 3 pages)
    const pageDir = path.join(tmpDir, 'output', 'public', 'catalog', 'phones', 'page');
    const pages = await fs.readdir(pageDir);
    expect(pages).toContain('1.html');
    expect(pages).toContain('2.html');
    expect(pages).toContain('3.html');
    expect(pages).toHaveLength(3);

    // Page 1 has first 2 products
    const page1 = await fs.readFile(path.join(pageDir, '1.html'), 'utf8');
    expect(page1).toContain('iPhone');
    expect(page1).toContain('Samsung');

    // Client data was copied
    const clientData = JSON.parse(
      await fs.readFile(
        path.join(tmpDir, 'output', 'public', 'data', 'catalog', 'phones.json'), 'utf8'
      )
    );
    expect(clientData.products).toHaveLength(5);

    // CSR template was copied
    const csrTemplate = await fs.readFile(
      path.join(tmpDir, 'output', 'public', 'templates', 'catalog', 'page.hbs'), 'utf8'
    );
    expect(csrTemplate).toContain('data-page');

    // Sitemap was generated
    const sitemap = await fs.readFile(
      path.join(tmpDir, 'output', 'public', 'sitemap.xml'), 'utf8'
    );
    expect(sitemap).toContain('https://test.com/catalog/phones/page/1');

    // robots.txt was generated
    const robots = await fs.readFile(
      path.join(tmpDir, 'output', 'public', 'robots.txt'), 'utf8'
    );
    expect(robots).toContain('Sitemap: https://test.com/sitemap.xml');

    // Client-side JS was copied
    const jsPath = path.join(tmpDir, 'output', 'public', 'assets', 'ignition-pagination.js');
    const jsContent = await fs.readFile(jsPath, 'utf8');
    expect(jsContent).toContain('IgnitionPagination');
  });

  it('SSR+CSR pagination: each page is a standalone HTML with CSR hook', async () => {
    const catalogDir = path.join(tmpDir, 'input', 'templates', 'catalog');
    await fs.mkdir(catalogDir, { recursive: true });

    const ignitionDir = path.join(tmpDir, 'input', 'templates', 'ignition');
    await fs.mkdir(ignitionDir, { recursive: true });
    await fs.copyFile(
      path.join(projectRoot, 'engine', 'core', 'partials', 'pagination.hbs'),
      path.join(ignitionDir, 'pagination.hbs')
    );

    await fs.writeFile(
      path.join(tmpDir, 'input', 'templates', 'catalog.hbs'),
      `<!DOCTYPE html>
<html>
<head>
  <title>{{title}}</title>
  <script src="https://cdn.jsdelivr.net/npm/handlebars@4.7.8/dist/handlebars.min.js"></script>
  <script src="/assets/ignition-pagination.js" defer></script>
</head>
<body>
  <h1>{{title}}</h1>
  {{> ignition/pagination collection="products" perPage=2 pageTemplate="catalog/page" layout=layout dataset=dataset}}
</body>
</html>`
    );

    await fs.writeFile(
      path.join(catalogDir, 'page.hbs'),
      `<div class="items">{{#each items}}<span class="item">{{name}}</span>{{/each}}</div>
<nav class="pagination">
  {{#times pagination.totalPages}}
    <a href="{{basePath}}{{this}}" data-page="{{this}}">{{this}}</a>
  {{/times}}
</nav>`
    );

    await fs.mkdir(path.join(tmpDir, 'input', 'data', 'catalog'), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, 'input', 'data', 'catalog', 'phones.json'),
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

    await runCli([
      'build',
      '--source', path.join(tmpDir, 'input'),
      '--output', path.join(tmpDir, 'output'),
      '--domain', 'https://test.com'
    ], projectRoot);

    const pageDir = path.join(tmpDir, 'output', 'public', 'catalog', 'phones', 'page');

    // --- 1. SSR: correct number of pages, each is a standalone HTML ---
    const files = await fs.readdir(pageDir);
    expect(files).toHaveLength(3);
    expect(files).toContain('1.html');
    expect(files).toContain('2.html');
    expect(files).toContain('3.html');

    // --- 2. Each page renders different items (SSR split is correct) ---
    const page1 = await fs.readFile(path.join(pageDir, '1.html'), 'utf8');
    const page2 = await fs.readFile(path.join(pageDir, '2.html'), 'utf8');
    const page3 = await fs.readFile(path.join(pageDir, '3.html'), 'utf8');

    expect(page1).toContain('iPhone');
    expect(page1).toContain('Samsung');
    expect(page1).not.toContain('Pixel');

    expect(page2).toContain('Pixel');
    expect(page2).toContain('OnePlus');
    expect(page2).not.toContain('iPhone');
    expect(page2).not.toContain('Xiaomi');

    expect(page3).toContain('Xiaomi');
    expect(page3).not.toContain('iPhone');

    // --- 3. Each page is valid HTML with handlebars + CSR script ---
    for (const content of [page1, page2, page3]) {
      expect(content).toContain('handlebars.min.js');
      expect(content).toContain('ignition-pagination.js');
      expect(content).toContain('</html>');
    }

    // --- 4. CSR hook: data-ignition-pagination attribute exists with correct config ---
    for (const [filename, pageNum, expectedItems] of [
      ['1.html', 1, ['iPhone', 'Samsung']],
      ['2.html', 2, ['Pixel', 'OnePlus']],
      ['3.html', 3, ['Xiaomi']],
    ]) {
      const content = await fs.readFile(path.join(pageDir, filename), 'utf8');

      // data-ignition-pagination attribute exists
      const match = content.match(/data-ignition-pagination='({[^']+)'/);
      expect(match, `data-ignition-pagination not found in ${filename}`).toBeTruthy();

      const csrConfig = JSON.parse(match[1]);

      // Config has all required fields for CSR
      expect(csrConfig.collection).toBe('products');
      expect(csrConfig.perPage).toBe(2);
      expect(csrConfig.currentPage).toBe(pageNum);
      expect(csrConfig.totalPages).toBe(3);
      expect(csrConfig.dataUrl).toBe('/data/catalog/phones.json');
      expect(csrConfig.templateUrl).toBe('/templates/catalog/page.hbs');

      // data-page links exist for CSR navigation
      const pageLinks = content.match(/data-page="\d+"/g);
      expect(pageLinks, `data-page links not found in ${filename}`).toBeTruthy();
      expect(pageLinks).toHaveLength(3); // 3 total pages
    }

    // --- 5. Client data JSON is accessible at the URL referenced in CSR config ---
    const clientJson = await fs.readFile(
      path.join(tmpDir, 'output', 'public', 'data', 'catalog', 'phones.json'), 'utf8'
    );
    const clientData = JSON.parse(clientJson);
    expect(clientData.products).toHaveLength(5);
    expect(clientData.products[0].name).toBe('iPhone');
    expect(clientData.products[4].name).toBe('Xiaomi');

    // --- 6. CSR template is accessible at the URL referenced in CSR config ---
    const csrTemplate = await fs.readFile(
      path.join(tmpDir, 'output', 'public', 'templates', 'catalog', 'page.hbs'), 'utf8'
    );
    expect(csrTemplate).toContain('data-page');
    expect(csrTemplate).toContain('{{#each items}}');
  });

  it('rebuild updates output: change JSON → re-run → output reflects new data', async () => {
    // First build
    await runCli([
      'build',
      '--source', path.join(tmpDir, 'input'),
      '--output', path.join(tmpDir, 'output'),
      '--domain', 'https://test.com'
    ], projectRoot);

    const before = await fs.readFile(
      path.join(tmpDir, 'output', 'public', 'landing', 'default.html'), 'utf8'
    );
    expect(before).toContain('My Site');

    // Change data
    await fs.writeFile(
      path.join(tmpDir, 'input', 'data', 'landing', 'default.json'),
      JSON.stringify({ title: 'Updated Site', description: 'New content' })
    );

    // Rebuild
    await runCli([
      'build',
      '--source', path.join(tmpDir, 'input'),
      '--output', path.join(tmpDir, 'output'),
      '--domain', 'https://test.com'
    ], projectRoot);

    const after = await fs.readFile(
      path.join(tmpDir, 'output', 'public', 'landing', 'default.html'), 'utf8'
    );
    expect(after).toContain('Updated Site');
    expect(after).toContain('New content');
    expect(after).not.toContain('My Site');
  });

  it('rebuild updates output: change template → re-run → output reflects new layout', async () => {
    // First build
    await runCli([
      'build',
      '--source', path.join(tmpDir, 'input'),
      '--output', path.join(tmpDir, 'output'),
      '--domain', 'https://test.com'
    ], projectRoot);

    // Change template
    await fs.writeFile(
      path.join(tmpDir, 'input', 'templates', 'landing.hbs'),
      '<html><body><main><h1>{{title}}</h1></main></body></html>'
    );

    // Rebuild
    await runCli([
      'build',
      '--source', path.join(tmpDir, 'input'),
      '--output', path.join(tmpDir, 'output'),
      '--domain', 'https://test.com'
    ], projectRoot);

    const content = await fs.readFile(
      path.join(tmpDir, 'output', 'public', 'landing', 'default.html'), 'utf8'
    );
    expect(content).toContain('<main>');
    expect(content).not.toContain('<p>');
  });

  it('output is atomic: no leftover .tmp files after build', async () => {
    await runCli([
      'build',
      '--source', path.join(tmpDir, 'input'),
      '--output', path.join(tmpDir, 'output'),
      '--domain', 'https://test.com'
    ], projectRoot);

    // Check no .tmp files in output
    const outputFiles = [];
    async function walk(dir) {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
        } else {
          outputFiles.push(full);
        }
      }
    }
    await walk(path.join(tmpDir, 'output'));

    const tmpFiles = outputFiles.filter(f => f.includes('.tmp'));
    expect(tmpFiles).toHaveLength(0);
  });
});
