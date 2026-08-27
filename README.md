# Ignition

**Interactive websites from JSON + templates — as easy as filling a spreadsheet.**

Hybrid SSR/CSR: pre-rendered pages with client-side interactivity.

> **80% of websites in the world are content sites, for which React is overkill.**

---

## Philosophy

**"Write, debug, and forget"**

Ignition is not a framework. It is a **"dumb renderer"** that does one thing and does it well:

- Takes JSON + Handlebars templates
- Generates HTML with SSR/CSR
- Provides atomic updates
- Contains no business logic

All business logic lives in the **external controller** (a script that prepares JSON and runs the build). Ignition only handles rendering.

**Key principle:** Technologies should serve the design and business goals, not the other way around.

---

## Why Not React/Next.js

| Criterion | Ignition | Next.js |
|---|---|---|
| **FCP (first load)** | 0.8–1.2s (pure HTML) | 1.5–3.0s (wait for JS + hydration) |
| **JS bundle** | 3–5KB | 150–500KB+ (React + app) |
| **Learning curve** | JSON + Handlebars (a day) | React + JSX + hooks (months) |
| **Infrastructure** | Any static hosting | Node.js server or Vercel |
| **Hosting cost** | $0–5/mo | $20–200+/mo |
| **Long-term maintenance** | Stable technologies | Annual breaking changes |

### When Ignition Is the Best Choice

- **Content sites**: catalogs, blogs, landing pages, documentation
- **Non-technical users**: content manager drops JSON → gets pages
- **Legacy systems**: integration via JSON export from 1C, Excel, CRM
- **Poor internet**: 50% of users in developing countries on 2G/3G

### When NOT to Choose Ignition

- Complex web apps (social networks, editors)
- Complex forms with validation
- Teams of 10+ frontend developers

---

## "AI Tilda" Concept

Ignition can serve as the foundation for an **"AI version of Tilda"**:

1. Take an image from Pinterest/Behance
2. AI describes the design as a spec for a "blind layout artist"
3. AI builds the template (Handlebars)
4. Extracts JSON data structure
5. User fills in the form (JSON)
6. Ignition renders the finished site

| Aspect | Tilda | Ignition + AI |
|---|---|---|
| **Starting point** | Visual editor | Image from Pinterest |
| **Flexibility** | Limited by Tilda templates | Any design |
| **Cost** | $10–50/mo | $0 (self-hosted) |
| **Control** | Tilda owns your data | Full control over code and data |

---

## Features

### Current (v1.0)

- **Hybrid SSR/CSR architecture** — SEO + interactivity
- **Client-side reactivity** — reactive state, blocks, bindings, actions, computed values
- **Declarative pagination** — via system partial `ignition/pagination`
- **Atomic updates** — files not corrupted on overwrite (fs.rename)
- **Incremental rebuilds** — change JSON → pages update
- **SEO optimization** — automatic sitemap.xml and robots.txt
- **Custom Handlebars helpers** — times, ifCond, json, concat, declineWord, get
- **Isomorphic helpers** — same helpers work server-side and client-side
- **Lifecycle hooks** — `afterHydrate` callback for DOM state restoration
- **Cross-platform** — Linux, macOS, Windows

### Architecture

```
Model    = JSON data (input/data/)
View     = Handlebars templates (input/templates/)
Controller = EXTERNAL process (not part of Ignition)
```

External controller is responsible for:
- Generating/updating JSON files
- Business logic before rendering
- CMS/API integration
- Data localization
- Deployment

---

## Quick Start

### 1. Installation

```bash
npm install -g @kartotech/ignition
```

### 2. Project Structure

```
my-project/
├── input/
│   ├── templates/
│   │   ├── catalog.hbs           # Layout
│   │   ├── catalog/
│   │   │   └── page.hbs          # Pagination partial
│   │   ├── demo.hbs              # Reactive blocks demo
│   │   └── demo/
│   │       └── product-list.hbs  # Block partial
│   └── data/
│       └── catalog/
│           └── books.json        # Data
├── output/public/                # Generated automatically
└── logs/
```

### 3. Template (input/templates/catalog.hbs)

```handlebars
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>{{title}}</title>
    <script src="https://cdn.jsdelivr.net/npm/handlebars@4.7.8/dist/handlebars.min.js"></script>
    <script src="/assets/ignition-runtime.js"></script>
    <script src="/assets/templates.js"></script>
</head>
<body>
    <h1>{{title}}</h1>

    {{> ignition/pagination
        collection="products"
        perPage=10
        pageTemplate="catalog/page"
        layout=layout
        dataset=dataset
    }}
</body>
</html>
```

### 4. Page Partial (input/templates/catalog/page.hbs)

```handlebars
<div class="catalog-grid">
    {{#each items}}
        <div class="product-card">
            <h3>{{name}}</h3>
            <p>{{price}} $</p>
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

### 5. Data (input/data/catalog/books.json)

```json
{
  "title": "Books",
  "products": [
    { "id": "1", "name": "The Master and Margarita", "price": 799 },
    { "id": "2", "name": "1984", "price": 649 },
    { "id": "3", "name": "War and Peace", "price": 1299 }
  ]
}
```

### 6. Build

```bash
npx ignition build
```

Result: `output/public/catalog/books/page/1.html`, `2.html`, `3.html`

---

## CLI Commands

```bash
npx ignition build                          # Full build
npx ignition watch                          # Watch mode
npx ignition build --domain https://site.com # With custom domain
npx serve output/public                     # Local server
```

---

## Handlebars Helpers

| Helper | Example | Description |
|---|---|---|
| `times` | `{{#times 5}}...{{/times}}` | Iterate from 1 to N |
| `ifCond` | `{{#ifCond a '>' b}}...{{/ifCond}}` | Conditional operator |
| `get` | `{{get obj "path.to.prop"}}` | Safe nested property access |
| `concat` | `{{concat a b c}}` | String concatenation |
| `declineWord` | `{{declineWord count "item" "items" "items"}}` | Russian word declension |
| `json` | `{{json value}}` | Safe JSON.stringify |

---

## Deployment

Generated files are pure static HTML/CSS/JS. Any server:

```bash
npx serve output/public
```

### Docker (Black Box)

Container: mount `input/` + `output/`, watcher renders automatically.

```bash
docker run -d \
  -v ./my-templates:/app/input/templates \
  -v ./my-data:/app/input/data \
  -v ./output:/app/output/public \
  ignition
```

Controller drops JSON in `my-data/` → watcher picks up → nginx serves from `output/`.

### Nginx

```nginx
server {
    listen 80;
    server_name example.com;
    root /path/to/output/public;
    location / {
        try_files $uri $uri.html $uri/ =404;
    }
}
```

### Systemd

```ini
[Unit]
Description=Ignition Static Site Generator
After=network.target

[Service]
Type=simple
WorkingDirectory=/path/to/project
ExecStart=/usr/bin/node bin/cli.js watch --domain https://example.com
Restart=always

[Install]
WantedBy=multi-user.target
```

### CI/CD (GitHub Pages)

Ignition as a build stage — commit JSON → pipeline → HTML → static hosting:

```yaml
# .github/workflows/deploy.yml
on:
  push:
    branches: [main]
    paths: ['input/**']

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npx ignition build --domain https://myuser.github.io/myrepo
      - uses: actions/deploy-pages@v4
        with:
          repository_name: myuser/myrepo
```

---

## License

MIT License. Copyright (c) 2026 Krivich.

---

## Contact

- GitHub: https://github.com/Krivich/ignition
- Issues: https://github.com/Krivich/ignition/issues
