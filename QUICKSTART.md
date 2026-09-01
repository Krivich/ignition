# Ignition — Quick Start

Ignition builds interactive websites from JSON + Handlebars templates. Hybrid SSR/CSR: pre-rendered HTML for SEO, client-side reactivity where you need it.

> For the complete framework guide (everyday usage + deep dive), see **[REACTIVITY.md](REACTIVITY.md)**.

---

## 1. Install

```bash
npm install -g @kartotech/ignition
```

Requirements: Node.js >= 18.

## 2. Create a Project

```
my-project/
├── input/
│   ├── templates/
│   │   └── catalog.hbs
│   ├── data/
│   │   └── catalog/
│   │       └── books.json
│   └── controllers/     # optional, for interactivity
│       └── catalog.js
└── output/public/       # generated automatically
```

## 3. Write a Template

`input/templates/catalog.hbs`:

```handlebars
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>{{title}}</title>
</head>
<body>
  <h1>{{title}}</h1>

  <input type="search" value="{{ui.query}}" placeholder="Поиск...">

  {{> catalog/product-list filtered}}
</body>
</html>
```

`input/templates/catalog/product-list.hbs`:

```handlebars
{{#each this}}
<div class="product">
  <span>{{name}}</span>
  <span>{{price}} ₽</span>
</div>
{{/each}}
```

`input/data/catalog/books.json`:

```json
{
  "title": "Книги",
  "ui": { "query": "" },
  "products": [
    { "id": 1, "name": "Ноутбук", "price": 59990 },
    { "id": 2, "name": "Мышь", "price": 1990 }
  ],
  "filtered": [
    { "id": 1, "name": "Ноутбук", "price": 59990 },
    { "id": 2, "name": "Мышь", "price": 1990 }
  ]
}
```

## 4. Add a Controller (Optional)

Create `input/controllers/catalog.js`:

```javascript
window.ignition.controller(function(state, api) {
  document.querySelector('input[type=search]').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    state.filtered = q
      ? state.products.filter(p => p.name.toLowerCase().includes(q))
      : state.products;
  });
});
```

The renderer auto-injects `ignition-runtime.js`, `__IGNITION_INITIAL_DATA__`, `__IGNITION_TEMPLATES__`, and your controller script. No manual `<script>` tags required.

## 5. Build

```bash
npx ignition build
```

Result: `output/public/catalog/books.html`.

## 6. Serve

```bash
npx ignition serve
# or
npx serve output/public
```

## Next Steps

- **Pagination**: see [REACTIVITY.md §8](REACTIVITY.md#8-pagination)
- **Reactive blocks**: see [REACTIVITY.md §3](REACTIVITY.md#3-reactive-regions-auto-blocks)
- **Auto-bindings & boolean attributes**: see [REACTIVITY.md §4](REACTIVITY.md#4-auto-bindings)
- **Point projections & fine-grained lists**: see [REACTIVITY.md §5](REACTIVITY.md#5-point-projections)
- **Controller API**: see [REACTIVITY.md §6](REACTIVITY.md#6-controller)
- **Data modes & lifecycle**: see [REACTIVITY.md §7](REACTIVITY.md#7-data-modes) and [REACTIVITY.md §11](REACTIVITY.md#11-page-lifecycle)

## CLI

```bash
npx ignition build    # one-shot build
npx ignition watch    # watch mode
npx ignition dev      # watch + serve
npx ignition serve    # serve output/public
npx ignition test     # run tests
```

## Project Conventions

- ES Modules only (`import`/`export`)
- Templates: `input/templates/{layout}.hbs`
- Partials: `input/templates/{layout}/{partial}.hbs`
- Data: `input/data/{layout}/{dataset}.json`
- Controllers: `input/controllers/{layout}.js`
- Do not edit files in `output/public/`
- Do not add business logic to the engine — keep it in controllers or external scripts

For architecture, conventions, and agent procedures, see **[AGENTS.md](AGENTS.md)**.
