# AGENTS.md — Project Context for Ignition

## What is it

**@kartotech/ignition** — a tool for building interactive websites from JSON + templates. As easy as filling a spreadsheet, but with hybrid SSR/CSR: pre-rendered pages with client-side interactivity.

Ignition is **not a framework** and **contains no business logic**. It is a "dumb renderer" that does one thing and does it well.

## Philosophy

**"Write, debug, and forget"**

- Technologies should serve the design and business goals, not the other way around
- Minimal dependencies, stable technologies (Handlebars since 2010+)
- 80% of websites in the world are content sites, for which React is overkill
- JSON + Handlebars is simpler than React + JSX + hooks, and works on any static hosting

## Architecture

### MVC with External Controller

```
Model    = JSON data (input/data/)
View     = Handlebars templates (input/templates/)
Controller = EXTERNAL process (not part of Ignition)
```

External controller is responsible for:
- Generating/updating JSON files in `input/data/`
- Business logic before rendering
- CMS/API integration
- Data localization
- Deployment

Ignition is only responsible for rendering. The watcher (chokidar) monitors `input/data/` and automatically picks up any JSON changes — no need to restart the build manually.

### Hybrid SSR/CSR Reactivity

Ignition uses a hybrid architecture:

1. **Server**: renders JSON + Handlebars → HTML with `data-ignition-block` regions **already filled** with server-rendered content (via the `{{#block}}` helper), plus a compact block-keyed manifest
2. **Client**: `ignition-runtime.js` attaches reactive state to existing DOM, blocks re-render on data changes

```
Server:  JSON + Template → HTML (pre-rendered block content + compact manifest)
Client:  HTML → Reactive State → Blocks re-render on data changes
```

#### SSR blocks (`{{#block}}` + manifest)

A reactive block is declared **declaratively in the template** with the `{{#block}}` helper, never in custom JS:

```hbs
<section>
    {{#block name="demo/product-list" data="products" depends="filtered"}}
        <p class="empty">Нет товаров</p>
    {{/block}}
</section>
```

During the SSR pass the server:
- renders the block partial (`demo/product-list.hbs`) with the `products` slice, filling the region in HTML;
- records a **compact manifest** keyed by block name — only the used slices, NOT the full dataset:

```html
<script>window.__IGNITION_MANIFEST__ = {"demo/product-list":[{"name":"Ноутбук"},...]};</script>
```

The output block carries the declarative attributes the client runtime consumes:

```html
<div data-ignition-block="demo/product-list" data-ignition-data="products" data-ignition-depends="filtered">
    <div class="product">...</div>
</div>
```

The client runtime provides:
- **Reactive state** — deep Proxy with path-based subscriptions
- **Blocks** — declarative DOM regions that re-render when dependencies change (`data-ignition-data` slices state; `data-ignition-depends` declares subscriptions)
- **Bindings** — two-way data binding for form elements
- **Actions** — named event handlers that mutate state
- **Computed** — cached derived values with lazy recomputation
- **Personalized datasets** (`diff.js`) — `loadDataset(url)` diffs a freshly loaded dataset against the manifest and re-renders ONLY the changed blocks

### Key Concepts

#### Layouts and Datasets

Separation of **how to display** (layout) and **what to display** (dataset):

- **Layout** = template file `input/templates/{name}.hbs` — defines structure and styling
- **Dataset** = JSON file `input/data/{layout}/{name}.json` — defines content

One layout works with **any** number of datasets. No need to duplicate templates — just add a new JSON → get new pages.

```
input/templates/product-card.hbs           ← one template
input/data/product-card/phones.json        ← "phones" dataset
input/data/product-card/laptops.json       ← "laptops" dataset
```

URL structure: `/{layout}/{dataset}/page/{number}` → `/catalog/books/page/2`

#### Explicit is Better Than Implicit

`pageTemplate="catalog/page"` instead of dynamic name concatenation. Clear file mapping, no "magic".

### Data Flow

```
input/data/*.json ─┐
                   ├─▶ Queue.processTask() ─▶ Renderer.renderTemplate() ─▶ output/public/
input/templates/*.hbs ┘
```

### Pagination Rendering

1. Template calls `{{> ignition/pagination collection="products" perPage=10 pageTemplate="catalog/page" layout=layout dataset=dataset}}`
2. Server splits the collection into pages and generates HTML for each
3. Client-side `ignition-pagination.js` drives CSR through the **common runtime** (`window.ignition`): the page slice is exposed as reactive state and templates render via the shared registry — no bespoke class, no duplicated helpers
4. URL updates via `history.pushState`

## Project Structure

```
ignition/
├── engine/                         # ENGINE CODE (npm package "files")
│   ├── bin/
│   │   └── cli.js                  # CLI entry point (build / watch)
│   ├── config/
│   │   └── default.js              # Default configuration
│   ├── core/
│   │   ├── assets/                 # Client-side static files
│   │   │   ├── ignition-runtime.js # GENERATED IIFE bundle (build-runtime.js)
│   │   │   └── ignition-pagination.js # CSR pagination (common runtime)
│   │   ├── handlebars.js           # Server-side partials registration + helpers delegate
│   │   ├── helpers.js              # CANONICAL helper source (single, server + client)
│   │   ├── pagination.js           # Server-side pagination logic
│   │   ├── partials/               # System partials
│   │   │   └── pagination.hbs
│   │   ├── queue.js                # Task queue + chokidar watcher
│   │   ├── renderer.js             # Template rendering engine (SSR {{#block}} + manifest)
│   │   ├── runtime/                # Client-side reactivity (ESM modules)
│   │   │   ├── index.js            # Unified ESM entry
│   │   │   ├── state.js            # Reactive Proxy state
│   │   │   ├── binding.js          # Blocks, bindings, actions (data-ignition-data)
│   │   │   ├── render.js           # Template registry and hydration
│   │   │   ├── computed.js         # Cached derived values
│   │   │   └── diff.js             # Personalized dataset diff (getSlice/diffSlices/mergeSlices/loadDataset)
│   │   └── sitemap.js              # sitemap.xml and robots.txt generator
│   ├── utils/
│   │   ├── deepGet.js              # Safe nested object property access
│   │   ├── fs.js                   # Safe FS operations (atomicWrite, safeMkdir)
│   │   ├── logger.js               # Winston logger
│   │   └── parseParams.js          # Handlebars param parser (shared)
│   └── logs/
├── scripts/                        # Build tooling
│   └── build-runtime.js            # Generates ignition-runtime.js IIFE from ESM
├── input/                          # SOURCE DATA (edited by user)
│   ├── templates/                  # Handlebars templates
│   │   ├── catalog.hbs             # Catalog layout template (demo, paginated)
│   │   ├── catalog/
│   │   │   └── page.hbs            # Pagination page partial (demo)
│   │   ├── demo.hbs                # Clean lay-out with {{#block}} SSR demo
│   │   ├── demo/
│   │   │   └── product-list.hbs    # Reactive block partial (demo)
│   │   ├── landing.hbs             # Landing page template (demo)
│   │   └── ignition/
│   │       └── pagination.hbs      # System partial (optional override)
│   └── data/                       # JSON data
│       ├── catalog/books.json      # Demo: book list (pagination)
│       ├── demo/app.json           # Demo: clean {{#block}} + manifest
│       └── landing/                # Demo: landing page data
├── output/public/                  # GENERATED CONTENT (do not edit manually)
├── tests/                          # Test suite (vitest)
│   ├── requirements/               # Requirements spec tests (A-H groups)
│   ├── runtime/                    # Unit tests for runtime modules
│   ├── integration/                # Integration tests
│   ├── core/                       # Core module tests
│   ├── fixtures/                   # Test fixtures
│   └── utils/                      # Utility tests
├── tmp/                            # Temporary files (auto-cleaned)
├── demo.html                       # Original demo for migration
├── AGENTS.md                       # This file
├── README.md                       # Project overview
├── QUICKSTART.md                   # Quick start guide
├── REACTIVITY.md                   # Client-side reactivity documentation
├── REVIEW-extmob-AUDIT.md          # Code review audit
├── MIGRATION-REPORT.md             # Migration experiment report
└── TODO.md                         # Roadmap
```

## Technologies

- **Language**: JavaScript (Node.js >= 18, ES Modules `"type": "module"`)
- **Template engine**: Handlebars ^4.7.8
- **CLI**: Commander ^14.0.2
- **File watcher**: Chokidar ^3.5.3
- **Task queue**: p-queue ^7.3.4
- **Logging**: Winston ^3.10.0
- **Test framework**: Vitest ^4.1.11 + jsdom ^30.0.1

## CLI Commands

```bash
npm run build          # Full build
npm run watch          # Watch mode (auto-rebuild)
npm run dev            # watch + serve in parallel
npm run serve          # Local server for output/public
npm run example        # Build with explicit paths
npm run test           # Run all tests
npm run test:watch     # Run tests in watch mode
node scripts/build-runtime.js  # Rebuild the client IIFE after runtime/helper changes
```

## Handlebars Helpers

All helpers are available **both server-side and client-side**.

| Helper | Signature | Description |
|---|---|---|
| `times` | `{{#times N}}...{{/times}}` | Iterate from 1 to N |
| `ifCond` | `{{#ifCond a op b}}...{{/ifCond}}` | Conditional operator (==, ===, !=, <, >, &&, \|\|) |
| `get` | `{{get obj "path"}}` | Safe nested property access |
| `concat` | `{{concat a b...}}` | String concatenation |
| `declineWord` | `{{declineWord count "one" "two" "five"}}` | Russian word declension by number |
| `json` | `{{json value}}` | Safe JSON.stringify |

Single source: `engine/core/helpers.js` (`registerHelpersWith`). The generated `ignition-runtime.js` bundle registers the same helpers on the client, so there is no server/client duplication.

### Custom Helpers

Page configs can register additional helpers via the API:

```js
window.__IGNITION_PAGE_CONFIG__ = function(state, api) {
    api.registerHelper('starFill', function(level, starNum) {
        if (level >= starNum) return 100;
        if (level >= starNum - 0.5) return 50;
        return 0;
    });
};
```

## Configuration

Key settings in `engine/config/default.js`:

- `source.templates` → `input/templates` — templates
- `source.data` → `input/data` — data
- `output.public` → `output/public` — output
- `pagination.defaultPerPage` → 10 — items per page
- `pagination.maxPages` → 100 — max pages
- `queue.concurrency` → 2 — parallel tasks
- `queue.debounce` → 500 — rebuild delay (ms)
- `domain` → `https://example.com` — for sitemap generation

## Client-Side Reactivity API

### HTML Attributes

| Attribute | Element | Description |
|-----------|---------|-------------|
| `data-ignition-block="name"` | Any | Marks this element as a reactive block |
| `data-ignition-depends="a, b"` | Block | Comma-separated dependency paths |
| `data-ignition-binding="path"` | Input/Select/Textarea | Two-way binding to state path |
| `data-ignition-on="event → action(args)"` | Any | Event handler declaration |

### Page Config

```html
<script>
window.__IGNITION_PAGE_CONFIG__ = function(state, api) {
    // Register actions
    api.action('cartAdd', function(s, id, price) {
        s.cart.items.push({ id: id, price: price });
    });

    // Custom renderers (control data passed to block templates)
    api.blockOptions.renderers['catalog/product-list'] = function(s) {
        return s.filteredProducts;
    };

    // Extra subscriptions for computed data
    api.blockOptions.sourceDeps['catalog/product-list'] = ['products', 'ui'];

    // Lifecycle hook
    api.blockOptions.afterHydrate = function(block, html) {
        // Restore focus, scroll, etc.
    };

    // Custom Handlebars helpers
    api.registerHelper('myHelper', function(arg) { return arg; });
};
</script>
```

### Action Signature

```js
api.action('name', function(state, ...args, event) {
    // event is always the last argument
    // event.key, event.target, event.preventDefault(), etc.
});
```

## Responsibility Boundaries

### What SHOULD be in Ignition

- Rendering JSON + templates → HTML
- Client-side reactivity (blocks, bindings, actions, computed)
- Pagination as a template pattern
- Atomic file replacement (fs.rename)
- Incremental rebuilds
- sitemap.xml and robots.txt generation
- Client-side pagination hydration

### What SHOULD be in the External Controller

- Business logic and data generation
- CMS/API integration
- Data localization (i18n)
- Image generation
- Analytics and metrics
- Deployment logic
- Form validation
- State reset patterns

Ignition can be packaged in Docker as a "black box": mount `input/` (templates + JSON) and `output/` (ready HTML), the watcher runs continuously. The controller just drops JSON — the container renders.

### What Should NOT Be Added to Ignition

- Plugin systems with DI containers
- Compilers/transpilers
- Complex lifecycle hooks (afterHydrate is sufficient)
- Built-in data sources
- Form validation (external controller's job)
- Built-in routing

## Code Conventions

### Do

- All modules use **ES Modules** (`import`/`export`), not CommonJS
- File naming: `camelCase.js` for utilities, descriptive names for core modules
- Handlebars files: `.hbs` extension
- Security: use `safeMkdir` and `atomicWrite` from `engine/utils/fs.js` for FS operations
- Logging: use Winston from `engine/utils/logger.js`
- Configuration: read from `engine/config/default.js`, merge with CLI options
- Client-side IIFE bundle (`ignition-runtime.js`) is **generated** from ESM modules by `scripts/build-runtime.js` — after changing runtime modules or `helpers.js`, regenerate it and never edit the bundle by hand

### Don't

- Add comments without explicit request
- Use CommonJS (`require`/`module.exports`)
- Edit files in `output/public/` — this is generated content
- Add dependencies unnecessarily (project is minimalistic)
- Break compatibility with the JSON data format
- Add business logic to the core — that's the external controller's job

### Adding a New Layout

1. Create template in `input/templates/{layout}.hbs`
2. Create `input/templates/{layout}/` folder for partials (if needed)
3. Create JSON data in `input/data/{layout}/{dataset}.json`
4. For pagination: add `{{> ignition/pagination ...}}` to the template
5. For reactivity: add `data-ignition-block` with `data-ignition-depends` in the template

### Adding a New Handlebars Helper

1. Implement in `engine/core/helpers.js` inside `registerHelpersWith(Handlebars)`
2. Register via `Handlebars.registerHelper()`
3. Regenerate the IIFE with `node scripts/build-runtime.js`
4. Add tests in `tests/runtime/client-helpers.test.js`

### Adding a New Runtime Module

1. Create ESM module in `engine/core/runtime/`
2. Export from `engine/core/runtime/index.js`
3. Add it to `scripts/build-runtime.js` (so it is included in the generated IIFE)
4. Add tests in `tests/runtime/`
5. Regenerate the IIFE with `node scripts/build-runtime.js`
6. Run full test suite: `npm run test`

## Frequently Changed Files

- `engine/core/renderer.js` — rendering logic
- `engine/core/queue.js` — task queue and watcher
- `engine/core/handlebars.js` — helpers delegate (registers canonical helpers)
- `engine/core/helpers.js` — canonical helper source (single source, server + client)
- `engine/core/pagination.js` — server-side pagination
- `engine/core/runtime/binding.js` — blocks, bindings, actions (ESM)
- `engine/core/runtime/state.js` — reactive state (ESM)
- `engine/core/runtime/diff.js` — personalized dataset diff (ESM)
- `engine/core/assets/ignition-runtime.js` — generated client-side IIFE bundle
- `input/templates/*.hbs` — user templates
- `input/data/**/*.json` — user data

## Rarely Changed Files

- `engine/bin/cli.js` — stable entry point
- `engine/config/default.js` — configuration
- `engine/utils/*.js` — general-purpose utilities
- `engine/core/sitemap.js` — sitemap generation
- `engine/core/assets/ignition-pagination.js` — client-side pagination controller (common runtime)
- `engine/core/runtime/computed.js` — computed values (stable)
- `engine/core/runtime/render.js` — template registry and hydration (stable)

## Test Structure

```
tests/
├── requirements/               # Requirements spec tests (groups A-H)
│   ├── A-server-render.test.js     # Server-side rendering of reactive blocks
│   ├── B-data-loading.test.js      # Page weight, manifest, async loading
│   ├── C-hydration.test.js         # Client hydration of server-rendered blocks
│   ├── D-reactive-updates.test.js  # Reactive updates, error handling
│   ├── E-personalized-dataset.test.js  # Personalized dataset diff + partial re-render
│   ├── F-isomorphic-helpers.test.js    # Helpers work on both server and client
│   ├── G-pagination.test.js        # SSR + CSR pagination
│   ├── H-reliability.test.js       # Edge cases, error resilience
│   └── helpers.js                  # Shared test utilities
├── runtime/                    # Unit tests for runtime modules
│   ├── state.test.js               # Reactive proxy, subscriptions
│   ├── binding.test.js             # initBlocks, initBinding, actions
│   ├── render.test.js              # Template registry, hydration
│   ├── computed.test.js            # Computed values
│   ├── diff.test.js                # Personalized dataset diff
│   ├── client-helpers.test.js      # Client-side Handlebars helpers
│   └── select-each.test.js         # Dynamic select options
├── integration/                # Full pipeline tests
│   ├── build.test.js               # Build pipeline
│   ├── cli.test.js                 # CLI commands
│   ├── csr-browser.test.js         # CSR pagination
│   ├── reactivity-catalog.test.js  # Catalog reactivity
│   ├── reactivity-dashboard.test.js # Dashboard reactivity
│   ├── reactivity-form.test.js     # Form reactivity
│   └── ssr-blocks.test.js          # SSR {{#block}} + compact manifest
├── core/                       # Core module tests
│   └── sitemap.test.js             # Sitemap generation
├── fixtures/                   # Test fixtures (templates, data)
│   └── ssr/                        # Clean {{#block}} SSR fixture
└── utils/                      # Utility tests
    └── fs.test.js                  # File system operations
```

**Total: 265 tests across 27 test files (as of 2026-08-27)**
