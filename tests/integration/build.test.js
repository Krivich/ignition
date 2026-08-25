import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import config from '../../config/default.js';
import { renderTemplate, generateClientArtifacts } from '../../core/renderer.js';
import { paginateCollection, preparePageData } from '../../core/pagination.js';
import { detectPaginationInTemplate } from '../../core/handlebars.js';
import { generateSitemap } from '../../core/sitemap.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..', '..');

describe('Integration: Full build pipeline', () => {
  let tmpDir;
  let originalConfig;

  beforeAll(async () => {
    originalConfig = {
      source: { ...config.source },
      output: { ...config.output },
    };
  });

  afterAll(async () => {
    config.source = originalConfig.source;
    config.output = originalConfig.output;
  });

  beforeEach(async () => {
    // Create tmp dir inside project so safeMkdir path traversal check passes
    tmpDir = await fs.mkdtemp(path.join(projectRoot, 'tmp', 'ignition-test-'));
    config.source.templates = path.join(tmpDir, 'input', 'templates');
    config.source.data = path.join(tmpDir, 'input', 'data');
    config.output.html = path.join(tmpDir, 'output', 'public');
    config.output.data = path.join(tmpDir, 'output', 'public', 'data');
    config.output.templates = path.join(tmpDir, 'output', 'public', 'templates');
    config.output.assets = path.join(tmpDir, 'output', 'public', 'assets');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('renders a non-paginated layout (landing page)', async () => {
    // Create template
    const templatesDir = path.join(config.source.templates);
    await fs.mkdir(templatesDir, { recursive: true });
    await fs.writeFile(
      path.join(templatesDir, 'landing.hbs'),
      '<html><body><h1>{{title}}</h1></body></html>'
    );

    // Create data
    const dataDir = path.join(config.source.data, 'landing');
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(
      path.join(dataDir, 'default.json'),
      JSON.stringify({ title: 'Welcome' })
    );

    // Render
    const templatePath = path.join(templatesDir, 'landing.hbs');
    const data = { title: 'Welcome' };
    const outputDir = path.join(config.output.html, 'landing');

    await renderTemplate(templatePath, data, outputDir, 'default', 'landing');

    // Verify
    const htmlPath = path.join(outputDir, 'default.html');
    const content = await fs.readFile(htmlPath, 'utf8');
    expect(content).toBe('<html><body><h1>Welcome</h1></body></html>');
  });

  it('renders a paginated catalog with correct page count', async () => {
    // Setup templates
    const templatesDir = config.source.templates;
    const catalogDir = path.join(templatesDir, 'catalog');
    await fs.mkdir(catalogDir, { recursive: true });

    // Copy system pagination partial to test templates
    const ignitionDir = path.join(templatesDir, 'ignition');
    await fs.mkdir(ignitionDir, { recursive: true });
    const corePaginationSrc = path.resolve(projectRoot, 'core', 'partials', 'pagination.hbs');
    await fs.copyFile(corePaginationSrc, path.join(ignitionDir, 'pagination.hbs'));

    // Main layout with pagination call
    await fs.writeFile(
      path.join(templatesDir, 'catalog.hbs'),
      `<!DOCTYPE html>
<html>
<head><title>{{title}}</title></head>
<body>
  {{> ignition/pagination collection="products" perPage=2 pageTemplate="catalog/page" layout=layout dataset=dataset}}
</body>
</html>`
    );

    // Page partial
    await fs.writeFile(
      path.join(catalogDir, 'page.hbs'),
      `{{#each items}}<div class="item">{{name}}</div>{{/each}}
<nav class="pagination">
  {{#times pagination.totalPages}}
    <a href="{{basePath}}{{this}}" data-page="{{this}}">{{this}}</a>
  {{/times}}
</nav>`
    );

    // Create data directory
    const dataDir = path.join(config.source.data, 'catalog');
    await fs.mkdir(dataDir, { recursive: true });

    const products = Array.from({ length: 7 }, (_, i) => ({
      id: `p${i + 1}`,
      name: `Product ${i + 1}`,
      price: 100 + i * 10
    }));

    await fs.writeFile(
      path.join(dataDir, 'products.json'),
      JSON.stringify({ title: 'Catalog', products })
    );

    // Detect pagination in template
    const templateContent = await fs.readFile(
      path.join(templatesDir, 'catalog.hbs'), 'utf8'
    );
    const paginationConfig = detectPaginationInTemplate(templateContent);
    expect(paginationConfig.enabled).toBe(true);
    expect(paginationConfig.collection).toBe('products');
    expect(paginationConfig.perPage).toBe(2);

    // Paginate
    const data = { title: 'Catalog', products };
    const pages = paginateCollection(data, paginationConfig.collection, paginationConfig.perPage);
    expect(pages).toHaveLength(4); // 7 items / 2 per page = 4 pages

    // Render each page
    const templatePath = path.join(templatesDir, 'catalog.hbs');
    const outputDir = path.join(config.output.html, 'catalog');

    for (const page of pages) {
      const pageData = {
        ...data,
        layout: 'catalog',
        dataset: 'products',
        pagination: preparePageData(data, page, page.pageNumber).pagination,
      };

      await renderTemplate(templatePath, pageData, outputDir, 'products', 'catalog');
    }

    // Verify output files exist
    const files = await fs.readdir(path.join(outputDir, 'products', 'page'));
    expect(files).toContain('1.html');
    expect(files).toContain('2.html');
    expect(files).toContain('3.html');
    expect(files).toContain('4.html');
    expect(files).toHaveLength(4);

    // Verify page 1 content
    const page1 = await fs.readFile(path.join(outputDir, 'products', 'page', '1.html'), 'utf8');
    expect(page1).toContain('Product 1');
    expect(page1).toContain('Product 2');

    // Verify page 3 content
    const page3 = await fs.readFile(path.join(outputDir, 'products', 'page', '3.html'), 'utf8');
    expect(page3).toContain('Product 5');
    expect(page3).toContain('Product 6');

    // Verify client artifacts (JSON for CSR)
    await generateClientArtifacts(
      path.join(dataDir, 'products.json'),
      'catalog',
      'products'
    );

    const clientData = JSON.parse(
      await fs.readFile(path.join(config.output.data, 'catalog', 'products.json'), 'utf8')
    );
    expect(clientData.products).toHaveLength(7);
  });

  it('generates sitemap from built output', async () => {
    // Create some HTML files in output
    const outputDir = config.output.html;
    await fs.mkdir(path.join(outputDir, 'catalog', 'books', 'page'), { recursive: true });
    await fs.mkdir(path.join(outputDir, 'landing'), { recursive: true });
    await fs.writeFile(path.join(outputDir, 'catalog', 'books', 'page', '1.html'), '<h1>Page 1</h1>');
    await fs.writeFile(path.join(outputDir, 'catalog', 'books', 'page', '2.html'), '<h1>Page 2</h1>');
    await fs.writeFile(path.join(outputDir, 'landing', 'default.html'), '<h1>Landing</h1>');

    // Generate sitemap
    const result = await generateSitemap('https://mysite.com');

    // Verify
    const sitemap = await fs.readFile(path.join(outputDir, 'sitemap.xml'), 'utf8');
    expect(sitemap).toContain('<loc>https://mysite.com/catalog/books/page/1</loc>');
    expect(sitemap).toContain('<loc>https://mysite.com/catalog/books/page/2</loc>');
    expect(sitemap).toContain('<loc>https://mysite.com/landing/default</loc>');
    expect(result.urls).toBe(3);

    const robots = await fs.readFile(path.join(outputDir, 'robots.txt'), 'utf8');
    expect(robots).toContain('Sitemap: https://mysite.com/sitemap.xml');
  });

  it('pagination generates correct prev/next navigation data', async () => {
    const products = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, name: `P${i + 1}` }));
    const data = { products };

    const pages = paginateCollection(data, 'products', 3);
    expect(pages).toHaveLength(4); // 10/3 = 4 pages

    // Page 1: no prev
    const p1 = preparePageData(data, pages[0], 1);
    expect(p1.pagination.hasPrev).toBe(false);
    expect(p1.pagination.hasNext).toBe(true);
    expect(p1.pagination.prevPage).toBe(0);
    expect(p1.pagination.nextPage).toBe(2);

    // Page 2: has prev and next
    const p2 = preparePageData(data, pages[1], 2);
    expect(p2.pagination.hasPrev).toBe(true);
    expect(p2.pagination.hasNext).toBe(true);
    expect(p2.pagination.prevPage).toBe(1);
    expect(p2.pagination.nextPage).toBe(3);

    // Page 4 (last): no next
    const p4 = preparePageData(data, pages[3], 4);
    expect(p4.pagination.hasPrev).toBe(true);
    expect(p4.pagination.hasNext).toBe(false);
    expect(p4.pagination.prevPage).toBe(3);
    expect(p4.pagination.nextPage).toBe(5);
  });

  it('Handlebars template renders with pagination variables', async () => {
    const Handlebars = (await import('handlebars')).default;
    const { registerHelpers } = await import('../../core/handlebars.js');
    registerHelpers();

    const template = Handlebars.compile(`
<div class="items">{{#each items}}<span>{{name}}</span>{{/each}}</div>
<nav>{{#times pagination.totalPages}}<a data-page="{{this}}">{{this}}</a>{{/times}}</nav>
`);

    const result = template({
      items: [{ name: 'A' }, { name: 'B' }],
      pagination: {
        currentPage: 1,
        totalPages: 3,
        hasNext: true,
        hasPrev: false,
      }
    });

    expect(result).toContain('<span>A</span>');
    expect(result).toContain('<span>B</span>');
    expect(result).toContain('data-page="1"');
    expect(result).toContain('data-page="2"');
    expect(result).toContain('data-page="3"');
  });
});
