# Ignition — Quick Start

Engine for building interactive websites from JSON + templates. As easy as filling a spreadsheet, with hybrid SSR/CSR: pre-rendered pages with client-side interactivity.

Ignition doesn't know or care **what** you're generating — a product catalog, landing page, portfolio, anything. It takes JSON + template → outputs HTML.

---

## Table of Contents

- [Installation](#installation)
- [How the Engine Works](#how-the-engine-works)
- [Project Structure](#project-structure)
- [Template Syntax](#template-syntax)
- [Pagination](#pagination)
- [Helpers](#helpers)
- [Build Pipeline](#build-pipeline)
- [External Controller](#external-controller)
- [Localization (i18n)](#localization-i18n)
- [CLI](#cli)
- [Configuration](#configuration)
- [Output Structure](#output-structure)
- [Client-Side Pagination (CSR)](#client-side-pagination-csr)
- [Deployment](#deployment)

---

## Installation

```bash
npm install -g @kartotech/ignition
```

Requirements: Node.js >= 18.

---

## How the Engine Works

Ignition is three things:

1. **Scanner**: finds layouts and datasets via convention-over-configuration
2. **Renderer**: compiles Handlebars with JSON data → HTML
3. **Paginator**: splits collections into pages (SSR + CSR)

The engine does **not** contain business logic, styles, fonts, APIs — nothing application-specific. You define all of that with your own templates and data.

Ignition is a "dumb renderer". All business logic lives in the external controller (a script that prepares JSON and runs the build).

---

## Project Structure

```
my-project/
├── input/                          # WHAT YOU CREATE
│   ├── templates/                  # Handlebars templates
│   │   ├── {layout}.hbs           # Layout (full HTML page)
│   │   └── {layout}/              # Partials for this layout
│   │       └── {partial}.hbs
│   └── data/                       # JSON data
│       └── {layout}/              # Folder = layout name
│           └── {dataset}.json     # File = dataset name
├── output/public/                  # WHAT THE ENGINE GENERATES
└── logs/
```

### Key Concept: Layout and Dataset

- **Layout** = template `input/templates/{name}.hbs` — defines **how** to display
- **Dataset** = JSON `input/data/{layout}/{name}.json` — defines **what** to display

One layout works with **any** number of datasets. No need to duplicate templates — just add a new JSON.

```
input/templates/product-card.hbs           ← one template
input/data/product-card/phones.json        ← "phones" dataset
input/data/product-card/laptops.json       ← "laptops" dataset
input/data/product-card/tablets.json       ← "tablets" dataset
```

Result: three sets of HTML pages with the same template but different data.

### URL Structure (default)

```
/{layout}/{dataset}/page/{number}    → paginated
/{layout}/{dataset}.html             → without pagination
```

---

## Template Syntax

Ignition uses **Handlebars**. Full documentation: [handlebarsjs.com](https://handlebarsjs.com/)

### Variables

```handlebars
{{title}}
{{user.name}}
{{item.price}} $
```

### Conditionals

```handlebars
{{#if user}}
  <p>Hello, {{user.name}}!</p>
{{else}}
  <p>Sign in</p>
{{/if}}
```

### Iteration

```handlebars
{{#each items}}
  <div>{{@index}}. {{name}}</div>
{{/each}}
```

Inside `#each`: `{{@index}}`, `{{@first}}`, `{{@last}}`.

### Raw HTML Insertion

```handlebars
{{{rawHtml}}}
```

### Comments

```handlebars
{{!-- this is a comment --}}
```

### Ignition Directives

Used for custom annotations, removed before compilation:

```handlebars
{{!-- ignition: my custom directive --}}
```

---

## Pagination

### How It Works

1. In the layout, you call the `ignition/pagination` partial with parameters
2. The engine splits the specified collection into pages
3. Renders an HTML file for each page
4. Copies JSON and template to output for client-side navigation

### Usage

In the layout template:

```handlebars
{{> ignition/pagination
    collection="products"
    perPage=10
    pageTemplate="{layout}/{partial}"
    layout=layout
    dataset=dataset
}}
```

### Parameters

| Parameter | Value |
|---|---|
| `collection` | Path to array in JSON. `"items"` → `data.items`, `"catalog.items"` → `data.catalog.items` |
| `perPage` | Items per page |
| `pageTemplate` | Partial for a single page. `"my-layout/page"` → `input/templates/my-layout/page.hbs` |
| `layout` | Pass as `layout=layout` — engine provides it automatically |
| `dataset` | Pass as `dataset=dataset` — engine provides it automatically |

### Variables in pageTemplate

The pagination partial receives:

```javascript
{
  items: [ /* items for the current page */ ],
  pagination: {
    currentPage: 2,
    totalPages: 5,
    hasNext: true,
    hasPrev: true,
    nextPage: 3,
    prevPage: 1
  },
  basePath: "/{layout}/{dataset}/page/",  // e.g. "/catalog/books/page/"
  layout: "catalog",
  dataset: "books"
}
```

### pageTemplate Example

```handlebars
<!-- input/templates/my-layout/page.hbs -->
<div class="items">
  {{#each items}}
    <div class="item">
      <h3>{{name}}</h3>
      <p>{{description}}</p>
    </div>
  {{/each}}
</div>

<nav class="pagination">
  {{#if pagination.hasPrev}}
    <a href="{{basePath}}{{pagination.prevPage}}" data-page="{{pagination.prevPage}}">&laquo;</a>
  {{/if}}

  {{#times pagination.totalPages}}
    <a href="{{basePath}}{{this}}"
       class="{{#ifCond this '==' ../pagination.currentPage}}active{{/ifCond}}"
       data-page="{{this}}">{{this}}</a>
  {{/times}}

  {{#if pagination.hasNext}}
    <a href="{{basePath}}{{pagination.nextPage}}" data-page="{{pagination.nextPage}}">&raquo;</a>
  {{/if}}
</nav>
```

**Important**: the `data-page` attribute on links is required — client-side JS captures clicks on it.

### JSON Format for Pagination

The array of items **must** be in a top-level field:

```json
{
  "title": "My Catalog",
  "products": [           ← this is the collection
    { "id": "1", "name": "Product 1", "price": 100 },
    { "id": "2", "name": "Product 2", "price": 200 }
  ]
}
```

The `products` field is specified in the `collection` parameter. The name can be anything.

### Without Pagination

If the layout has **no** `ignition/pagination` call, a single HTML file `{dataset}.html` is generated. All JSON is available in the template directly.

---

## Helpers

Built-in helpers are available in **any** template (server-side and client-side).

### times — iterate from 1 to N

```handlebars
{{#times 5}}
  <span>{{this}}</span>
{{/times}}
```

### ifCond — conditional operator

```handlebars
{{#ifCond price '>' 1000}}
  <span>Expensive</span>
{{else}}
  <span>Cheap</span>
{{/ifCond}}
```

Operators: `==`, `===`, `!=`, `!==`, `<`, `<=`, `>`, `>=`, `&&`, `||`.

### get — safe nested property access

```handlebars
{{get this "user.name"}}
```

### concat — string concatenation

```handlebars
{{concat "/" layout "/" dataset "/page/"}}
```

### declineWord — Russian word declension by number

```handlebars
{{declineWord count "item" "items" "items"}}
<!-- count=1 → "item", count=2 → "items", count=5 → "items" -->
```

### json — JSON output

```handlebars
<div data-config='{{json pagination}}'></div>
```

---

## Build Pipeline

### Build mode (one-shot)

```
1. Scan input/templates/*.hbs         → layouts
2. Scan input/data/{layout}/*.json   → datasets
3. For each (layout × dataset) pair:
   a. Read JSON
   b. Compile template
   c. If pagination exists → split into pages
   d. Write HTML to output/public/
4. Copy JSON and CSR templates
5. Generate sitemap.xml and robots.txt
```

### Watch mode (continuous)

```
1. Ignition starts chokidar on input/templates/ and input/data/
2. External controller (or you) drops/updates JSON in input/data/
3. Watcher detects change → debounce 500ms → rebuild
4. Affected pages are re-rendered atomically
```

Key point: `input/data/` is the **external controller's output** and the **renderer's input**. The watcher doesn't distinguish who changed the file — you manually, a script via API, or a cron job.

---

## External Controller

Ignition is a "dumb renderer". All data preparation logic lives in an external script.

### What the External Controller Does

- Fetches data from CMS, API, databases, Excel
- Generates/updates JSON files in `input/data/`
- Runs `ignition watch` — the watcher automatically picks up changes and re-renders pages
- Manages deployment

The controller doesn't necessarily need to run `ignition build` manually. If Ignition is running in `watch` mode, it's enough to place/update JSON in `input/data/` — the engine detects the change and rebuilds affected pages automatically.

### Example

```javascript
// external-controller.js
// Ignition is already running in watch mode: npx ignition watch
// The controller just updates JSON — the watcher picks it up

import fs from 'fs/promises';

// 1. Fetch data from API
const products = await fetch('https://api.mysite.com/products');
const data = await products.json();

// 2. Format JSON for Ignition
const ignitionData = {
  title: "Product Catalog",
  products: data.map(p => ({
    id: p.id,
    name: p.name,
    price: p.price,
    description: p.description
  }))
};

// 3. Write to input/data — watcher automatically rebuilds pages
await fs.writeFile(
  'input/data/catalog/products.json',
  JSON.stringify(ignitionData, null, 2)
);
```

### Why This Way

- Ignition doesn't know about your API, database, or business logic
- You control **what** data and **when** it reaches the renderer
- Any language can be used for the controller (Python, PHP, Bash)

---

## Localization (i18n)

Ignition has no built-in i18n support. Localization is handled through the external controller.

### Approach

1. **Data** — external controller generates JSON for each language
2. **Templates** — text strings can be extracted to JSON translation files

### File Structure

```
input/data/catalog/
├── books.json         # Default language data
├── books.ru.json      # Russian data (optional)
└── books.en.json      # English data (optional)
```

If there's no separate JSON for a language, data from the default file is used.

### External Controller with i18n Example

```javascript
const langs = ['en', 'ru'];
const baseData = JSON.parse(fs.readFileSync('input/data/catalog/books.json'));

for (const lang of langs) {
  const langData = translateData(baseData, lang);  // your translation function
  const suffix = lang === 'en' ? '' : `.${lang}`;

  fs.writeFileSync(
    `input/data/catalog/books${suffix}.json`,
    JSON.stringify(langData, null, 2)
  );

  execSync(`npx ignition build --domain https://mysite.com/${lang}`);
}
```

---

## CLI

```bash
# Full build
npx ignition build

# Watch mode (auto-rebuild on changes)
npx ignition watch

# With custom paths and domain
npx ignition build --source ./input --output ./output --domain https://mysite.com

# Local server
npx serve output/public
```

### build

One-shot build. For production.

### watch

Monitors `input/templates/` and `input/data/`. File change → rebuild dependent pages. Debounce 500ms, concurrency 2 tasks.

---

## Configuration

| Parameter | Default | Description |
|---|---|---|
| `source.templates` | `input/templates` | Templates directory |
| `source.data` | `input/data` | Data directory |
| `output.public` | `output/public` | Output directory |
| `pagination.defaultPerPage` | `10` | Items per page |
| `pagination.maxPages` | `100` | Max pages |
| `queue.concurrency` | `2` | Parallel tasks |
| `queue.debounce` | `500` | Rebuild delay (ms) |
| `domain` | `https://example.com` | Domain for sitemap |

---

## Output Structure

```
output/public/
├── assets/
│   └── ignition-pagination.js          ← client-side JS (automatic)
├── {layout}/
│   └── {dataset}/
│       └── page/
│           ├── 1.html                  ← SSR page 1
│           ├── 2.html                  ← SSR page 2
│           └── ...
├── data/
│   └── {layout}/
│       └── {dataset}.json              ← data for CSR
├── templates/
│   └── {layout}/
│       └── {partial}.hbs              ← template for CSR
├── sitemap.xml
└── robots.txt
```

---

## Client-Side Pagination (CSR)

The engine automatically prepares everything for client-side pagination:

- **HTML** is pre-rendered → SEO indexes it
- **JSON** is copied to `output/public/data/` → available via fetch
- **Template** is copied to `output/public/templates/` → compiled on the client
- **ignition-pagination.js** is loaded → captures clicks

When `data-page` is clicked:
1. `fetch()` loads the JSON
2. Handlebars compiles the template on the client
3. DOM updates atomically (no page reload)
4. URL updates via `history.pushState`

### Required Page Includes

```html
<script src="https://cdn.jsdelivr.net/npm/handlebars@4.7.8/dist/handlebars.min.js"></script>
<script src="/assets/ignition-pagination.js" defer></script>
```

---

## Deployment

Generated files are pure static HTML/CSS/JS. Any server:

```bash
npx serve output/public
```

```nginx
# Nginx
server {
  listen 80;
  server_name example.com;
  root /path/to/output/public;
  location / {
    try_files $uri $uri.html $uri/ =404;
  }
}
```

### Docker: Black Box

Ignition can be packaged in a Docker container. The container is a black box: mount `input/` with templates and JSON, mount `output/` — nginx serves the generated HTML.

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY . .
RUN npm ci --omit=dev
CMD ["node", "bin/cli.js", "watch"]
```

```bash
# Build image
docker build -t ignition .

# Run
docker run -d \
  -v ./my-templates:/app/input/templates \
  -v ./my-data:/app/input/data \
  -v ./output:/app/output/public \
  --name my-site \
  ignition
```

Order doesn't matter: the watcher monitors `input/` and automatically picks up any changes. The controller just drops JSON into `my-data/` — the container re-renders.

**docker-compose.yml** (with nginx):

```yaml
services:
  ignition:
    build: .
    volumes:
      - ./input/templates:/app/input/templates
      - ./input/data:/app/input/data
      - ./output:/app/output/public

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./output:/usr/share/nginx/html:ro
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
    depends_on:
      - ignition
```

```nginx
# nginx.conf
server {
    listen 80;
    location / {
        try_files $uri $uri.html $uri/ =404;
    }
}
```

Container runs continuously: controller updates JSON → watcher picks up → nginx serves current pages.

### CI/CD: Ignition as a Build Stage

Ignition can be called once in a pipeline instead of running continuously. GitHub Pages, GitLab Pages, Netlify — any static hosting.

```yaml
# .github/workflows/deploy.yml
name: Build and Deploy
on:
  push:
    branches: [main]
    paths:
      - 'input/**'

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - run: npm ci
      - run: npx ignition build --domain https://myuser.github.io/myrepo

      - uses: actions/deploy-pages@v4
        with:
          repository_name: myuser/myrepo
```

Commit JSON → pipeline → `ignition build` → HTML → hosting serves it. CSR pagination provides client-side interactivity without a backend.

---

## New Layout Checklist

1. Create `input/templates/{layout}.hbs` — full HTML template
2. Create `input/data/{layout}/{dataset}.json` — data
3. If pagination is needed:
   - Add `{{> ignition/pagination ...}}` to the layout
   - Create `input/templates/{layout}/page.hbs` — single page partial
4. Run `npx ignition build`
