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
3. Client-side `ignition-pagination.js` loads JSON + template and renders pages without reload
4. URL updates via `history.pushState`

## Project Structure

```
ignition/
├── bin/cli.js                  # CLI entry point (build / watch)
├── config/default.js           # Default configuration
├── core/
│   ├── assets/                 # Client-side static files
│   │   └── ignition-pagination.js
│   ├── handlebars.js           # Handlebars partials and helpers registration
│   ├── pagination.js           # Server-side pagination logic
│   ├── partials/               # System partials
│   │   └── pagination.hbs
│   ├── queue.js                # Task queue + chokidar watcher
│   ├── renderer.js             # Template rendering engine
│   └── sitemap.js              # sitemap.xml and robots.txt generator
├── input/                      # SOURCE DATA (edited by user)
│   ├── templates/              # Handlebars templates
│   │   ├── catalog.hbs         # Catalog layout template (demo)
│   │   ├── catalog/page.hbs    # Pagination page partial (demo)
│   │   ├── landing.hbs         # Landing page template (demo)
│   │   └── ignition/pagination.hbs  # System partial copy (optional override)
│   └── data/                   # JSON data
│       ├── catalog/books.json  # Demo: book list
│       └── landing/            # Demo: landing page data
├── output/public/              # GENERATED CONTENT (do not edit manually)
├── utils/
│   ├── deepGet.js              # Safe nested object property access
│   ├── fs.js                   # Safe FS operations (atomicWrite, safeMkdir)
│   └── logger.js               # Winston logger
├── tmp/                        # Temporary files (auto-cleaned)
└── logs/                       # Log files
```

## Technologies

- **Language**: JavaScript (Node.js >= 18, ES Modules `"type": "module"`)
- **Template engine**: Handlebars ^4.7.8
- **CLI**: Commander ^14.0.2
- **File watcher**: Chokidar ^3.5.3
- **Task queue**: p-queue ^7.3.4
- **Logging**: Winston ^3.10.0
- **Test framework**: none

## CLI Commands

```bash
npm run build          # Full build
npm run watch          # Watch mode (auto-rebuild)
npm run dev            # watch + serve in parallel
npm run serve          # Local server for output/public
npm run example        # Build with explicit paths
```

## Handlebars Helpers

| Helper | Signature | Description |
|---|---|---|
| `times` | `{{#times N}}...{{/times}}` | Iterate from 1 to N |
| `ifCond` | `{{#ifCond a op b}}...{{/ifCond}}` | Conditional operator (==, ===, !=, <, >, &&, \|\|) |
| `get` | `{{get obj "path"}}` | Safe nested property access |
| `concat` | `{{concat a b...}}` | String concatenation |
| `declineWord` | `{{declineWord count "one" "two" "five"}}` | Russian word declension by number |
| `json` | `{{json value}}` | Safe JSON.stringify |

## Configuration

Key settings in `config/default.js`:

- `source.templates` → `input/templates` — templates
- `source.data` → `input/data` — data
- `output.public` → `output/public` — output
- `pagination.defaultPerPage` → 10 — items per page
- `pagination.maxPages` → 100 — max pages
- `queue.concurrency` → 2 — parallel tasks
- `queue.debounce` → 500 — rebuild delay (ms)
- `domain` → `https://example.com` — for sitemap generation

## Responsibility Boundaries

### What SHOULD be in Ignition

- Rendering JSON + templates → HTML
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

Ignition can be packaged in Docker as a "black box": mount `input/` (templates + JSON) and `output/` (ready HTML), the watcher runs continuously. The controller just drops JSON — the container renders.

### What Should NOT be Added to Ignition

- Plugin systems with DI containers
- Compilers/transpilers
- Complex lifecycle hooks
- Built-in data sources

## Code Conventions

### Do

- All modules use **ES Modules** (`import`/`export`), not CommonJS
- File naming: `camelCase.js` for utilities, descriptive names for core modules
- Handlebars files: `.hbs` extension
- Security: use `safeMkdir` and `atomicWrite` from `utils/fs.js` for FS operations
- Logging: use Winston from `utils/logger.js`
- Configuration: read from `config/default.js`, merge with CLI options

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

### Adding a New Handlebars Helper

1. Implement in `core/handlebars.js` in the `registerHelpers()` function
2. Register via `Handlebars.registerHelper()`

## Frequently Changed Files

- `core/renderer.js` — rendering logic
- `core/queue.js` — task queue and watcher
- `core/handlebars.js` — helpers and partials
- `core/pagination.js` — server-side pagination
- `input/templates/*.hbs` — user templates
- `input/data/**/*.json` — user data

## Rarely Changed Files

- `bin/cli.js` — stable entry point
- `config/default.js` — configuration
- `utils/*.js` — general-purpose utilities
- `core/sitemap.js` — sitemap generation
- `core/assets/ignition-pagination.js` — client-side pagination JS

## Missing from the Codebase

- **Tests**: not a single test file
- **CI/CD**: no GitHub Actions or similar
- **Linter/formatter**: no ESLint, Prettier
- **TypeScript**: project is plain JavaScript
- **i18n**: localization support described conceptually but not implemented
- **Image/SEO helpers**: described as plans but not implemented
- **PWA**: not implemented
