# TODO — Roadmap and Ideas

Tasks and ideas for Ignition development. Divided into what should be **in the core** and what should be **in external services**.

---

## Phase 1: Polish and Stabilization

- [ ] Split package into `@kartotech/ignition` (engine) and demo app (catalog, landing)
- [ ] Add tests (at least integration tests for rendering and pagination)
- [ ] Add ESLint + Prettier
- [ ] CI/CD: GitHub Actions for linting and npm publishing
- [ ] Fix first page: currently `1.html`, by convention should be `index.html`
- [ ] Remove unused dependencies from package.json (gray-matter, p-retry, picomatch)
- [ ] Dockerfile — "black box": mount input + output, watcher renders automatically

---

## Phase 2: Core Engine Improvements

### Markdown + Frontmatter

Support `.md` files as content source:

```
input/data/blog/
├── post-1.md          # Markdown with frontmatter
└── post-2.md
```

```markdown
---
title: "First Post"
date: 2026-01-24
tags: ["html", "css"]
---

Post content here...

More text in Markdown...
```

Automatic frontmatter → JSON parsing, Markdown → HTML conversion.

### Basic Asset Pipeline

- CSS/JS minification during build
- Image optimization (resize, webp)
- Caching with hashes in filenames (`style.a1b2c3.css`)

---

## Phase 3: SEO and Performance

### SEO Toolkit (system partial)

```handlebars
{{> core/seo
  title="Book Catalog | Store"
  description="Best books at best prices"
  canonical="/catalog/books/"
  ogImage="/og-image.jpg"
}}
```

Generates:
- `<title>`, `<meta description>`, `<link rel="canonical">`
- Open Graph tags (`og:title`, `og:description`, `og:image`)
- JSON-LD (BreadcrumbList, Product, etc.)
- `<meta robots>`, `<link rel="prev">`, `<link rel="next">`

### Image Optimization Helpers

```handlebars
{{> core/image
  src="product.jpg"
  alt="Product"
  widths="320,640,1280"
  sizes="(max-width: 768px) 100vw, 50vw"
  loading="lazy"
}}
```

Generates `<picture>` with srcset for different screens.

### Performance Metrics

Lightweight client-side script for tracking Core Web Vitals:
- FCP (First Contentful Paint)
- LCP (Largest Contentful Paint)
- CLS (Cumulative Layout Shift)

Sends data to an external analytics service.

---

## Phase 4: PWA

- Automatic `manifest.json` generation
- Service Worker for offline mode
- Static asset caching

---

## What Should NOT Be Added to the Core

These things should remain in external controllers and services:

### Business Logic
- Data validation
- Business rules for pagination
- Payment system integration
- Shopping cart, checkout

### Infrastructure
- Plugin systems with DI containers
- Compilers/transpilers (Babel, esbuild)
- Complex lifecycle hooks
- Built-in data sources (DB, API)

### Deployment and DevOps
- Deployment logic (Netlify, Vercel, Nginx)
- CI/CD pipelines
- Monitoring and alerting

### Content
- Image generation
- Data localization (i18n) — external controller prepares JSON for each language
- Analytics and metrics

---

## "AI Tilda" Concept (External Service)

Idea: **Ignition as the core** for an "AI version of Tilda".

### Phase 1: AI Assistant

```bash
ignition-ai init --image pinterest-landing.png
```

- Analyzes image via Qwen3-VL
- Generates `template.hbs` + `data.example.json`
- Creates basic CSS

### Phase 2: Content Form

- Web form generated from JSON schema
- Content manager fills form → gets JSON → Ignition renders

### Phase 3: Automatic Deployment

```bash
ignition-ai deploy --platform netlify
```

---

## Notes

- Ignition must remain a "dumb renderer"
- Minimal dependencies, stable technologies
- Handlebars has been around since 2010+ — battle-tested technology
- Doesn't replace React for complex applications, but replaces WordPress for content sites
