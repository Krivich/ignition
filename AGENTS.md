# AGENTS.md — Project Context for Ignition

## What is it

**@kartotech/ignition** — a tool for building interactive websites from JSON + templates. As easy as filling a spreadsheet, but with hybrid SSR/CSR: pre-rendered pages with client-side interactivity.

Ignition is **not a framework** and **contains no business logic**. It is a "dumb renderer" that does one thing and does it well.

> For human-readable framework documentation, see **[REACTIVITY.md](REACTIVITY.md)** (one file: everyday guide + deep dive) and **[QUICKSTART.md](QUICKSTART.md)** (short linear start).

## Philosophy

**"Write, debug, and forget"**

- Technologies should serve the design and business goals, not the other way around
- Minimal dependencies, stable technologies (Handlebars since 2010+)
- 80% of websites in the world are content sites, for which React is overkill
- JSON + Handlebars is simpler than React + JSX + hooks, and works on any static hosting

## Development Values

How we work on this codebase — every change in this repo is held to these:

- **TDD.** Tests first (red → green). A new behavior is pinned by contract tests before it exists; regressions are caught by the suite, never by hope.
- **Measure, then claim.** Performance claims come from the benchmark harness (`engine/perf/`, `npm run bench`), always before/after on the same machine. Reactivity and **responsiveness** numbers are only valid in a real browser — jsdom DOM-op numbers are unreliable (documented methodology trap). Optimize server throughput (`npm run bench`) AND client responsiveness (perceived render time); do not trade one for the other in silence.
- **Benefit vs cost, explicitly.** Every feature is weighed: LOC, KB gzip, conceptual load vs measured win. Features that cannot justify their price are cut or moved to an experimental branch; "unjustified complexity for 7%" is a rejected design.
- **Graceful degradation by construction.** New mechanisms fall back to the previous behavior as the worst case (e.g. reconcile falls back to a naive innerHTML swap; uncovered templates keep the old re-render). A bug's blast radius is bounded by design.
- **Isolation and reversibility.** Features are landed so they can be ripped out cleanly: additive core changes, self-contained files, assessed escape routes before commit. A revert must never take unrelated wins with it.
- **Security is mandatory, always, and never silently dropped.** You MUST audit every code change that touches user-supplied data, HTML output, or paths for: **XSS** (never inject unescaped template output into the DOM; escaping is a guarantee, not an option — adding a helper that skips escaping without an explicit, raised, reviewed reason is a bug), **prototype pollution** (never merge/traverse untrusted object keys as own properties without guards), and **path traversal** (sanitize any path derived from data before reading/writing files). Run `npm audit` for dependencies. If a change could weaken security, call it out in the summary — do not wait to be asked. Security bugs are never trivial: they ship, they get exploited, they get red-flagged — treating them as "I'll just mention it if asked" is unacceptable.
- **Warnings must be actionable.** Build diagnostics carry stable `IGN-*` codes, name the template and the concrete reason, and are searchable in the docs with a fix recipe per code.
- **Docs at two levels.** QUICKSTART (5 minutes) → REACTIVITY.md Part 1 (everyday) → Part 2 (deep dive: principles and "why", not source reading). Stale docs are bugs — fix them in the same change that makes them stale.

## Architecture

### MVC with External Controller

```
Model    = JSON data (input/data/)
View     = Handlebars templates (input/templates/)
Controller = EXTERNAL process (not part of Ignition)
```

The external controller generates/updates JSON files in `input/data/`. Ignition only renders. The watcher (chokidar) monitors `input/data/` and auto-rebuilds on changes.

For page-level client-side interactivity, developers put logic in `input/controllers/{layout}.js` and call `window.ignition.controller(function(state, api) { ... })`. See [REACTIVITY.md §6](REACTIVITY.md#6-controller).

### Hybrid SSR/CSR

See [REACTIVITY.md §11](REACTIVITY.md#11-page-lifecycle) for the full lifecycle.

## Project Structure

```
ignition/
├── engine/                         # ENGINE CODE (npm package "files")
│   ├── bin/cli.js                  # CLI entry point (build / watch)
│   ├── config/default.js           # Default configuration
│   ├── core/                       # Core rendering + runtime
│   │   ├── assets/                 # Client-side static files
│   │   │   ├── ignition-runtime.js # GENERATED IIFE bundle
│   │   │   └── ignition-pagination.js # CSR pagination controller
│   │   ├── compiler.js             # Template analysis: auto-blocks, auto-bindings, projections
│   │   ├── handlebars.js           # Server-side partials + helpers delegate
│   │   ├── helpers.js              # CANONICAL helper source (single, server + client)
│   │   ├── pagination.js           # Server-side pagination logic
│   │   ├── partials/pagination.hbs # System partial
│   │   ├── queue.js                # Task queue + chokidar watcher
│   │   ├── renderer.js             # Template rendering engine (SSR + auto-inject)
│   │   ├── runtime/                # Client-side reactivity (ESM modules)
│   │   │   ├── index.js
│   │   │   ├── state.js            # Reactive Proxy state
│   │   │   ├── binding.js          # Blocks, bindings, actions
│   │   │   ├── render.js           # Template registry and hydration
│   │   │   ├── computed.js         # Cached derived values
│   │   │   └── diff.js             # Personalized dataset diff
│   │   └── sitemap.js              # sitemap.xml and robots.txt generator
│   ├── utils/                      # General utilities
│   ├── scripts/                    # Dev tools (not shipped in the npm package)
│   │   └── build-runtime.js        # Generates ignition-runtime.js IIFE from ESM
│   └── logs/
├── input/                          # SOURCE DATA (edited by user)
│   ├── templates/                  # Handlebars templates
│   ├── data/                       # JSON data
│   └── controllers/                # Page controllers (auto-injected)
├── output/public/                  # GENERATED CONTENT (do not edit manually)
├── tests/                          # Test suite (vitest)
│   ├── requirements/               # Requirements spec tests (A-H groups)
│   ├── runtime/                    # Unit tests for runtime modules
│   ├── integration/                # Integration tests
│   ├── core/                       # Core module tests
│   ├── fixtures/                   # Test fixtures
│   └── utils/                      # Utility tests
├── tmp/                            # Temporary files (auto-cleaned)
├── AGENTS.md                       # This file
├── QUICKSTART.md                   # Short linear quick-start
├── REACTIVITY.md                   # Full framework guide (everyday + deep dive)
└── README.md                       # Project overview
```

**Total: 406 tests across 46 test files (as of 2026-09-01)**

## Technologies

- JavaScript (Node.js >= 18, ES Modules `"type": "module"`)
- Handlebars ^4.7.8
- Commander ^14.0.2
- Chokidar ^3.5.3
- p-queue ^7.3.4
- Winston ^3.10.0
- Vitest ^4.1.11 + jsdom ^30.0.1

## CLI Commands

```bash
npm run build          # Full build
npm run watch          # Watch mode (auto-rebuild)
npm run dev            # watch + serve in parallel
npm run serve          # Local server for output/public
npm run example        # Build with explicit paths
npm run test           # Run all tests
npm run test:watch     # Run tests in watch mode
node engine/scripts/build-runtime.js  # Rebuild the client IIFE after runtime/helper changes
```

## Configuration

Key settings in `engine/config/default.js`:

- `source.templates` → `input/templates`
- `source.data` → `input/data`
- `source.controllers` → `input/controllers`
- `output.public` → `output/public`
- `pagination.defaultPerPage` → 10
- `pagination.maxPages` → 100
- `queue.concurrency` → 2
- `queue.debounce` → 500 ms
- `domain` → `https://example.com`

## Code Conventions

### Do

- Use **ES Modules** (`import`/`export`)
- File naming: `camelCase.js` for utilities, descriptive names for core modules
- Handlebars files: `.hbs` extension
- Use `safeMkdir` and `atomicWrite` from `engine/utils/fs.js`
- Use Winston from `engine/utils/logger.js`
- Regenerate `engine/core/assets/ignition-runtime.js` after changing `engine/core/runtime/*` or `engine/core/helpers.js`

### Don't

- Add comments without explicit request
- Use CommonJS (`require`/`module.exports`)
- Edit files in `output/public/`
- Add dependencies unnecessarily
- Break compatibility with the JSON data format
- Add business logic to the core — that's the external controller's job

## Responsibility Boundaries

### In Ignition

- Rendering JSON + templates → HTML
- Client-side reactivity (blocks, bindings, actions, computed)
- Fine-grained updates: row-scoped point projections, leaf/structural change classification
- Pagination as a template pattern
- Atomic file replacement
- Incremental rebuilds
- sitemap.xml and robots.txt

### In the External Controller

- Business logic and data generation
- CMS/API integration
- i18n
- Image generation
- Analytics
- Deployment logic
- Form validation

## Agent Procedures

### Adding a New Layout

1. Create `input/templates/{layout}.hbs`
2. Create `input/templates/{layout}/` folder for partials (if needed)
3. Create JSON data in `input/data/{layout}/{dataset}.json`
4. For pagination: add `{{> ignition/pagination ...}}`
5. For reactivity: add `{{> partial path}}` or `{{#block ...}}`
6. For controller logic: create `input/controllers/{layout}.js`

See [REACTIVITY.md](REACTIVITY.md) for template syntax, controller API, and data modes.

### Adding a New Handlebars Helper

1. Implement in `engine/core/helpers.js` inside `registerHelpersWith(Handlebars)`
2. Register via `Handlebars.registerHelper()`
3. Regenerate the IIFE with `node engine/scripts/build-runtime.js`
4. Add tests in `tests/runtime/client-helpers.test.js`

### Adding a New Runtime Module

1. Create ESM module in `engine/core/runtime/`
2. Export from `engine/core/runtime/index.js`
3. Add it to `engine/scripts/build-runtime.js`
4. Add tests in `tests/runtime/`
5. Regenerate the IIFE with `node engine/scripts/build-runtime.js`
6. Run full test suite: `npm run test`

## Useful Links

- [QUICKSTART.md](QUICKSTART.md) — 5-minute linear start
- [REACTIVITY.md](REACTIVITY.md) — full framework guide
  - Part 1: everyday usage
  - Part 2: deep dive into auto-blocks, auto-bindings, boot sequence, internals
- [README.md](README.md) — project overview
- [TODO.md](TODO.md) — roadmap
