# Ignition

Engine for generating hybrid SSR/CSR websites. Ignition creates fully ready HTML files at build time (SSR), ensuring instant loading and excellent search engine indexing. At the same time, thanks to client-side hydration, websites gain SPA capabilities: users interact with content without page reloads, and dynamic updates happen instantly.

At the core of this approach is separation of responsibilities: static content is pre-generated from JSON data and Handlebars templates, while interactivity is added by a lightweight JavaScript client that has access to the original data and templates at runtime. This gives you the best of both worlds — the speed of static sites and the convenience of dynamic applications.

## Philosophy

**"Write, debug, and forget"**

Ignition works autonomously after setup — it generates optimized content and ensures its relevance without constant maintenance.

## 🧩 Concept: Layouts and Datasets

Ignition separates **how to display** (layout) and **what to display** (dataset):

- **`layout`** — page type/template presentation  
  Defines structure and styling. Examples: `catalog`, `blog`, `portfolio`.

- **`dataset`** — specific data set  
  Defines content for display. Examples: `books`, `posts`, `projects`.

**Benefits of this approach:**
- One layout can work with different datasets:  
  `catalog/books`, `catalog/authors`, `catalog/publishers`
- Datasets can be easily replaced without changing display logic
- Simple scalability: add a new JSON file → get new pages

Example URL structure:  
`/{layout}/{dataset}/page/{number}` → `/catalog/books/page/2`

## Features

- **Hybrid architecture**: SSR for SEO + CSR for interactivity
- **"Drop and get" mode** — when working in watch mode, changing a JSON file or template automatically generates updated HTML pages without restarting the engine
- Atomic file updates without downtime
- SEO optimization with automatic sitemap.xml and robots.txt generation
- Declarative pagination with client-side navigation
- Custom Handlebars helpers (`times`, `ifCond`, `json`) and partials
- Incremental rebuilds on changes
- Cross-platform compatibility (Linux, macOS, Windows)
- Minimal hosting requirements (any static server)

## Installation

```bash
npm install -g @kartotekh/ignition
```

## Quick Start

### 1. Create project structure and copy examples:
```bash
mkdir my-project && cd my-project
mkdir -p input/templates input/data/catalog
```

### 2. Copy example templates from the repository:
```bash
# Clone the repository to get examples
git init
git remote add origin https://github.com/kartotekh/ignition.git
git config core.sparsecheckout true
echo "examples/templates/*" >> .git/info/sparse-checkout
echo "examples/data/*" >> .git/info/sparse-checkout
git pull origin main

# Copy examples to your project
cp examples/templates/catalog.hbs input/templates/
cp examples/templates/catalog/* input/templates/catalog/
cp examples/data/catalog/books.json input/data/catalog/
```

### 3. Run generation:
```bash
ignition build
```

### 4. Start server for viewing:
```bash
npx serve output/public
```

### 5. Real-time development mode
Run change monitoring in a separate terminal:
```bash
ignition watch
```

Now with any change:
- JSON files in `input/data/` → corresponding pages are regenerated
- Templates in `input/templates/` → all dependent pages are regenerated

**Example scenario:**
1. Change a price in `input/data/catalog/books.json`
2. Save the file
3. Ignition automatically updates all book catalog pages
4. Refresh the browser page — changes appear instantly

This provides a comfortable development workflow following the principle **"drop JSON — get ready pages"**.

## Project Structure

```
project/
├── input/
│   ├── templates/        # Page templates and components
│   │   ├── catalog.hbs   # Main section template
│   │   └── catalog/      # Partial templates for section
│   │       └── page.hbs  # Pagination page template
│   └── data/             # JSON data
│       └── catalog/      # Data for catalog section
│           └── books.json
├── output/
│   └── public/           # Generated files
│       ├── catalog/
│       │   └── books/
│       │       ├── index.html    # First page
│       │       ├── page/
│       │       │   └── 2.html    # Second page
│       │       └── ...
│       ├── assets/               # System scripts
│       │   └── ignition-pagination.js
│       ├── data/                 # Data for CSR
│       │   └── catalog/
│       │       └── books.json
│       ├── templates/            # Templates for CSR
│       │   └── catalog/
│       │       └── page.hbs
│       ├── sitemap.xml
│       └── robots.txt
├── tmp/                  # Temporary files (automatically cleaned)
└── logs/                 # Log files
```

## 🔧 Detailed documentation: system partial `ignition/pagination`

### How it works
The system partial `ignition/pagination` automatically:
1. Splits the specified collection into pages
2. Generates HTML files for each page
3. Adds a container with data attributes to the page for client-side hydration
4. Copies the page template and data to public directories for CSR

### Partial Parameters
```handlebars
{{> ignition/pagination
  collection="products"      # Path to collection in JSON data
  perPage=10                 # Number of items per page
  pageTemplate="catalog/page" # Path to page template file (without .hbs extension)
  layout="catalog"           # Name of main template file (without extension)
  dataset="books"            # Name of JSON data file (without extension)
}}
```

**Required parameters:**
- `collection` — path to data array in JSON (e.g., "products" or "blog.posts")
- `perPage` — number of items per page
- `pageTemplate` — path to page template file relative to `input/templates/`. For example, `catalog/page` means the file `input/templates/catalog/page.hbs`
- `layout` — name of main template file (without extension), e.g., `catalog` → `input/templates/catalog.hbs`
- `dataset` — name of data file (without extension), e.g., `books` → `input/data/catalog/books.json`

### Variables available in page template (`pageTemplate`)
When rendering the page template (e.g., `catalog/page.hbs`), the following variables become available:

```javascript
{
  items: [ /* array of items for current page */ ],
  pagination: {
    currentPage: 1,       // Current page number
    totalPages: 3,        // Total number of pages
    hasNext: true,        // Whether next page exists
    hasPrev: false,       // Whether previous page exists
    nextPage: 2,          // Next page number
    prevPage: 0           // Previous page number (0 if none)
  },
  basePath: "/catalog/books/page/", // Base path for navigation
  layout: "catalog",      // Layout name
  dataset: "books"        // Dataset name
}
```

### Page template example
```handlebars
<!-- input/templates/catalog/page.hbs -->
<div class="catalog-grid">
  {{#each items}}
    <div class="product-card">
      <h3>{{name}}</h3>
      <p>{{price}} ₽</p>
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

## CLI Commands

```bash
# Full project build
ignition build

# Automatic rebuild on changes
ignition watch

# Build with custom paths and domain
ignition build \
  --source ./custom-input \
  --output ./custom-output \
  --domain https://example.com

# Command help
ignition --help
```

## Additional Features

### System Helpers

```handlebars
{{#times 5}}
  <!-- Repeats content 5 times -->
  <div>Element {{@index}}</div>
{{/times}}

{{#ifCond price '>' 1000}}
  <span class="expensive">Expensive</span>
{{/ifCond}}

<!-- Safe object to JSON conversion -->
<div data-products='{{json products}}'></div>
```

## 🔄 Incremental Generation

Ignition works in two modes:

### Build Mode (`build`)
Full generation of all pages. Use for production builds:
```bash
ignition build --domain https://example.com
```

### Watch Mode (`watch`)
Continuous change monitoring with incremental regeneration. Perfect for development:
```bash
ignition watch
```

**How it works:**
1. You run `ignition watch`
2. You change a JSON data file or Handlebars template
3. The engine identifies affected tasks and regenerates only the necessary pages
4. Pages update atomically — without downtime or partial content

Each JSON change → automatic regeneration of all pages for that dataset.  
Each template change → regeneration of all pages using that template.

This creates a comfortable workflow: **change data → immediately get results**.

## Production Deployment

Ignition generates completely static files that can be served by any web server.

### Nginx configuration example:
```nginx
server {
  listen 80;
  server_name example.com;
  root /path/to/project/output/public;
  
  location / {
    try_files $uri $uri.html $uri/ =404;
  }
  
  # Static file caching
  location ~* \.(js|css|png|jpg|jpeg|gif|ico|json)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
  }
  
  # Protect service directories
  location ~ ^/(tmp|logs|input) {
    deny all;
    return 404;
  }
}
```

### Running as a system service (systemd):
```bash
# /etc/systemd/system/ignition.service
[Unit]
Description=Ignition Static Site Generator
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/path/to/project
ExecStart=/usr/bin/node bin/cli.js watch --domain https://example.com
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

## License

MIT License

Copyright (c) 2026 Krivich

## Contact

- GitHub Issues: https://github.com/krivich/ignition/issues
---

Ignition is created for those who value speed, reliability, and simplicity. It does its job quietly and efficiently — without extra dependencies, without constant maintenance, with a focus on results.