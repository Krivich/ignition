# Ignition

**Interactive websites from JSON + templates — as easy as filling a spreadsheet.**

Hybrid SSR/CSR: pre-rendered pages with client-side interactivity.

> **80% of websites in the world are content sites, for which React is overkill.**

---

## Philosophy and Principles

Ignition is a **dumb renderer**. It takes JSON and Handlebars templates and produces HTML. There is no business logic, styles, or API inside the engine — all intelligence lives outside, in the data, templates, and the external controller that prepares the JSON.

**"Write, debug, and forget."** A site built with Ignition does not require constant care: dependencies do not rot, hosting costs pennies, and you only come back when you want to change content or design.

### SSR is the foundation

Server-side rendering is not a mode — it is the default. At build time the engine renders 100% of the content. The HTML that reaches the browser is already complete: users and search engines see the same thing. The page is readable, indexable, and works without JavaScript.

### CSR is enhancement, not replacement

Client-side JavaScript does not render the page from scratch. It attaches to the already rendered HTML and adds interactivity: pagination without reload, filters, sorts, forms. If JavaScript fails to load, the user still sees the content and follows regular links.

### Data drives the UI

The client keeps a copy of the model, and a change to the model is the only reason to re-render. The runtime finds blocks that depend on the changed branch and re-renders only those — with the same templates the server used. The developer does not touch the DOM: write data, the UI follows. States like "loading" and "error" live next to the data they describe, not in a global object.

### One language for server and client

Templates and helpers are identical on both sides. There are no "server" and "client" templates, no second DOM-building mechanism. The client differs from the server in only one way: it watches for data changes and patches the interface minimally. Anything that creates asymmetry between the two sides is evil.

### JSON is the single source of truth

The engine does not care what it renders — catalog, landing, form, or reference book. What matters is the data structure. One layout works with any number of datasets; one dataset can be rendered by different layouts.

### Dumb engine, smart controller

API integration, translations, business rules — that is the external controller's job, a script in any language that drops ready JSON into the input folder. The engine watches the folder and re-renders what changed. That is why Ignition can stay stable for years while the outside world changes.

### Declarative, not magic

Links are explicit: which template renders a block, which data it depends on, what happens on click. Where the engine guesses (defaults, conventions), it does so predictably and allows override. Hidden transformations are the source of mysterious bugs; explicitness is the source of trust.

### Lightweight pages and partial pre-rendering

The page does not carry the whole dataset: the server renders it with the slice it needs (the first catalog page), while full data loads in the background. When the data arrives, the client re-renders only the differences from the pre-rendered state. This also gives personalization for free: the server renders the default state, the client adds session data.

### SEO by default

Every page is ready HTML, pagination is separate files per page, sitemap and robots.txt are generated automatically. Interactivity is layered on top and never blocks indexing. SEO is not bolted on later — it is built into the architecture.

### Low cost

The output is pure static files. Hosting is any web server for pocket change. No Node server in production, no compute bill. Updating content means dropping a new JSON file, not redeploying an application.

### Low barrier to entry

You do not need React or Vue to build a site — JSON and Handlebars are enough to learn in an evening. For those who do not want to write JSON by hand, editors can live on top: a person fills forms, JSON is created behind the scenes. The engine is for the developer; the product on top of the engine is for the human.

### Cheap mistakes

Ignition does not guarantee you will never make a mistake — it makes mistakes cheap. A bad template or dataset is fixed in minutes and does not accumulate technical debt. A site can be rebuilt from scratch in an evening, and that freedom to experiment is worth more than any guarantee.

These principles are the measure of every change. If a feature contradicts them, the feature is reconsidered, not the principles.

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
│   │   ├── extmob.hbs            # Reactive form demo
│   │   ├── extmob/
│   │   │   └── skills.hbs        # Block partial
│   │   └── controllers/
│   │       └── extmob.js         # Page controller (auto-injected)
│   └── data/
│       ├── catalog/
│       │   └── books.json        # Data
│       └── extmob/
│           └── recommend.json    # Data
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

The renderer auto-injects `ignition-runtime.js`, `ignition-pagination.js`, `__IGNITION_INITIAL_DATA__`, and `__IGNITION_TEMPLATES__` for paginated pages. No manual `<script>` tags are required.

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
