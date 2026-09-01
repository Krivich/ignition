# Ignition v2 — Framework Guide

Ignition is a **dumb renderer** for JSON + Handlebars with hybrid SSR/CSR. It renders static HTML on the server and optionally attaches reactive state on the client. Business logic always lives outside the engine.

This file has two parts:

- **Part 1 — Everyday Guide**: read this once and you can build pages.
- **Part 2 — Deep Dive**: read this when you want to understand what the engine injects and why.

---

# Part 1. Everyday Guide

## 1. Core Model

```
Model    = JSON data       → input/data/
View     = Handlebars      → input/templates/
Controller = external JS   → input/controllers/{layout}.js
```

The engine combines JSON + template → HTML. If the page is reactive, it also injects a small runtime that re-renders DOM regions when state changes.

## 2. Layout and Dataset

- **Layout** = `input/templates/{layout}.hbs`
- **Dataset** = `input/data/{layout}/{dataset}.json`
- **Partials** = `input/templates/{layout}/{partial}.hbs`

One layout works with any number of datasets.

Generated URLs:

```
/{layout}/{dataset}.html                 → single page
/{layout}/{dataset}/page/{number}.html   → paginated
```

Example:

```
input/templates/catalog.hbs
input/templates/catalog/page.hbs
input/templates/catalog/user.hbs
input/data/catalog/books.json
```

## 3. Reactive Regions (Auto-Blocks)

Include a partial with a data path and it becomes a reactive region:

```handlebars
{{> extmob/skills skills}}
```

The engine wraps it automatically:

```html
<div data-ignition-block="extmob/skills" data-ignition-data="skills" data-ignition-depends="skills">
  <!-- server-rendered partial -->
</div>
```

**Block name = partial path.** Use `extmob/skills` when configuring renderers or dependencies later.

If you need multiple named slices or an explicit fallback, use the `{{#block}}` helper:

```handlebars
{{#block name="form/skills" data="form.skills, reference.suggestions"}}
  <p>No skills yet</p>
{{/block}}
```

Opt out with a comment:

```handlebars
{{!-- ignition: noblock --}}
{{> extmob/skills skills}}
```

## 4. Auto-Bindings

Form elements bind to state automatically from standard Handlebars patterns:

```handlebars
<input type="text" value="{{candidate.email}}">
<textarea>{{candidate.description}}</textarea>
```

The engine injects `data-ignition-binding` and the runtime sets up two-way sync. In the common case you never write `data-ignition-binding` manually — the compiler adds it from `value="{{path}}"` (inputs), `{{path}}` textareas, and `{{#if path}}selected{{/if}}` option patterns.

Two **documented exceptions** where you write `data-ignition-binding` by hand:

```handlebars
<input type="checkbox" data-ignition-binding="candidate.consent" {{#if candidate.consent}}checked{{/if}}>

<select data-ignition-binding="candidate.industry">
  <option value="" {{#unless candidate.industry}}selected{{/unless}} disabled>Выберите отрасль</option>
  {{#each form.industries}}
    <option value="{{this}}" {{#if (eq this ../candidate.industry)}}selected{{/if}}>{{this}}</option>
  {{/each}}
</select>
```

A checkbox is a boolean attribute, and a `<select>` holds its value on options rather than on `value="..."`, so neither fits the standard `value="{{path}}"` auto-detection — hence the manual attribute. The runtime reads them on `change` and syncs state → element on the same path.

### Boolean attributes (SSR initial state)

Handlebars interpolation `checked="{{candidate.consent}}"` renders `checked="false"`, but HTML treats the **presence** of the attribute as true — so `{{#if path}}checked{{/if}}` is the *SSR starting point*:

```handlebars
<button type="submit" {{#unless ui.isValid}}disabled{{/unless}}>Опубликовать</button>
```

This only sets the initial disabled state at render time. It does **not** update when `ui.isValid` changes — a non-block button has no re-render. To make a boolean toggle (like submit/disabled) change live, use a point projection instead (§5):

```handlebars
<button type="submit" data-ignition-attr-disabled="!ui.isValid">Опубликовать</button>
```

The same rule applies to `selected`, `disabled`, `readonly`, and similar boolean attributes: `{{#if}}`/`{{#unless}}` set the SSR state; `data-ignition-attr-*` react live.

To opt a whole template out of auto-binding injection:

```handlebars
{{!-- ignition: nobind --}}
<input value="{{candidate.email}}">
```

## 5. Point Projections

For elements that only display or toggle, use point projections. They update without re-rendering the whole block.

Class and attribute projections (`data-ignition-class`, `data-ignition-attr-*`) are live: they alone make the page reactive and ship the runtime. A text projection (`data-ignition-text`) is an SSR marker — it is server-rendered and does **not** trigger the runtime by itself. It updates on the next render, and only participates in live updates when the page is already reactive for another reason (a class/attr projection, a binding, pagination, or a controller).

```handlebars
<!-- Text projection -->
<div id="toast" data-ignition-text="ui.toastMessage"></div>

<!-- Class projection -->
<div id="toast" data-ignition-class="show: ui.toastVisible"></div>

<!-- Attribute/property projection -->
<button type="submit" data-ignition-attr-disabled="!ui.isValid">Publish</button>
```

### Row-scoped projections (fine-grained lists)

Inside a top-level `{{#each}}` the compiler projects row fields automatically:

```handlebars
{{#each products}}
  <div class="row">
    <span>{{name}}</span>
    <span>{{price}}</span>
  </div>
{{/each}}
```

The compiled HTML carries `data-ignition-row="products"` on the row element and
`data-ignition-text="@p:products.*.name"` stickers on its fields. When one cell
changes (`state.products[3].price = 'x'`), only that text node is patched - the
block does **not** re-render. For lists outside a block this is the only update
path; inside a block it replaces the full re-render (see §13).

To qualify, the row body must be **pure**: every expression a simple item field
(`{{name}}`, `{{item.meta.price}}`). Anything else - `{{#if}}`, helpers,
multi-expression nodes, `{{this}}` - makes the compiler fall back to the
regular block re-render for that list (still correct, just not fine-grained).

Add `data-ignition-key="{{id}}"` on the row element when rows can be
reordered, inserted or deleted mid-list: rows are then matched by key and keep
their DOM identity (focus, input values, scroll) across structural changes.

### Fixing fine-grained warnings

A build warning means the list still works - it just re-renders its block on
every cell change. The degradation is safe; fix the template when the list is
hot. Warnings carry stable `IGN-FG-*` codes - look yours up here:

| Code | Warning reason | Fix |
|------|----------------|-----|
| `IGN-FG-EXPR` | Multi-expression nodes | Split into single-expression elements: `<span>{{a}}</span> <span>{{b}}</span>`; move static text (`Total: `) into its own element |
| `IGN-FG-HELPER` | Helper calls (`{{upper name}}`) | Precompute the derived field in data or the controller (`item.nameUpper`), project the plain field |
| `IGN-FG-THIS` | `{{this}}` | Use object items (`{ name: x }`) instead of scalars, project `{{name}}` |
| `IGN-FG-UPLEVEL` | `{{../x}}` parent paths, `{{@index}}` | The field is the same for every row - hoist it out of the list, render once above it; replace `@index` numbering with CSS counters (`counter-reset`/`counter-increment`) - pure CSS, no state |
| `IGN-FG-ELSE` | `{{else}}` branch | Hoist the empty state to the block level: wrap the list in `{{#if items.length}}...{{else}}...{{/if}}` (structural changes still re-render and flip it) |
| `IGN-FG-MULTITOP` | Several top-level elements per row | Wrap the row content in one container element (`div`/`li`/`tr`) |
| `IGN-FG-COND` | Conditional (`{{#if}}`) in the row body | No clean v1 fix - the condition re-shapes the row. Hoist it to the block level if possible, or accept the re-render (class/attr projections are not row-scoped yet, so they cannot replace a row-level `{{#if}}`) |
| `IGN-FG-NESTED` | Nested `{{#each}}` | No v1 fix - extract the inner list into its own partial/block, or accept the re-render |

Example warning:

```
warn: ⚠️ form/contact: list "form.fields" re-renders its block on every cell change —
  [IGN-FG-COND] conditional ({{#if}}/{{#unless}}) inside the row body;
  [IGN-FG-UPLEVEL] parent/@-paths ({{../x}}, {{@index}}); [IGN-FG-HELPER] helper calls.
  Fix recipes: REACTIVITY.md §5, "Fixing fine-grained warnings".
```

## 6. Controller

The controller is where you attach events and mutate state. Create `input/controllers/{layout}.js`:

```javascript
// input/controllers/extmob.js
window.ignition.controller(function(state, api) {
  document.getElementById('addSkillBtn').addEventListener('click', () => {
    state.skills.push({ name: 'New skill', level: 1 });
  });

  document.getElementById('offerForm').addEventListener('submit', (e) => {
    e.preventDefault();
    console.log(collectData(state));
  });
});
```

The renderer detects the file and injects `<script src="/assets/controllers/{layout}.js">` after `ignition-runtime.js`. The controller runs after the reactive state is ready.

`state` is a deep reactive Proxy. Mutating it re-renders dependent blocks and updates bound elements.

### `api` object

| Property | Description |
|----------|-------------|
| `api.registerHelper(name, fn)` | Register a Handlebars helper for client-side re-renders |
| `api.registerTemplate(name, fn\|source)` | Register or override a client-side template |
| `api.computed(state, name, fn)` | Create a cached derived value |
| `api.blockOptions.renderers[name]` | Custom renderer: `fn(state) → data context` for block `name` |
| `api.blockOptions.sourceDeps[name]` | Extra state paths that trigger re-render of block `name` |
| `api.blockOptions.afterHydrate` | `fn(blockElement, html)` called after each block render |
| `api.loadDataset(url)` | Fetch a personalized dataset and merge changes |

### Global helpers

After boot you can also use:

```js
window.ignition.set('ui.toastMessage', 'Saved');
window.ignition.ephemeral('ui.toastMessage', 'Saved', 2600);
window.ignition.loadDataset('/data/catalog/personalized.json');
```

## 7. Data Modes

The renderer chooses how much data to ship based on what the page uses:

| Page type | What is inlined | Preload full JSON | Why |
|-----------|----------------|-------------------|-----|
| Static (no blocks, no bindings, no controller) | Nothing | No | Pure SSR, no runtime |
| Block-only (`data-ignition-block`) | Compact `__IGNITION_INITIAL_DATA__` with used slices only | No | Fast first paint |
| Interactive (autobindings, projections, controller) | Full `__IGNITION_INITIAL_DATA__` | Yes | Controller may read any branch |
| Pagination | Full dataset | Yes | Client may slice any page |
| Personalized | `__IGNITION_MANIFEST__` (server snapshot) | Yes | `loadDataset()` diffs against manifest |

In practice you do not think about this — the engine decides. The important rule is: **if the page has a controller or bindings, it gets the full dataset.**

## 8. Pagination

Add the system partial to a layout:

```handlebars
{{> ignition/pagination
    collection="products"
    perPage=10
    pageTemplate="catalog/page"
    layout=layout
    dataset=dataset
}}
```

Create the page partial:

```handlebars
<!-- input/templates/catalog/page.hbs -->
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

Pagination pages get `ignition-pagination.js` automatically and use the shared runtime for CSR navigation.

## 9. Common Patterns

### Form validation

Validate in the controller and write validity to state:

```js
function validate() {
  const c = state.candidate;
  state.ui.isValid =
    c.email.includes('@') &&
    c.position.trim() !== '' &&
    state.skills.length > 0;
}

document.getElementById('offerForm').addEventListener('input', validate);
validate();
```

```handlebars
<button type="submit" data-ignition-attr-disabled="!ui.isValid">Опубликовать</button>
```

`data-ignition-attr-disabled` (a projection, §5) watches `ui.isValid` and toggles the button live as you type — `{{#unless ui.isValid}}disabled{{/unless}}` alone would only set the initial render state.

### Toast

```js
function toast(msg) {
  window.ignition.ephemeral('ui.toastMessage', msg, 2600);
}
```

```handlebars
<div id="toast" data-ignition-text="ui.toastMessage"></div>
```

### Dynamic lists

Keep the input outside the block, pass only the list into the partial:

```handlebars
<input id="newSkill" type="text">
<button id="addSkillBtn" type="button">Add</button>
{{> skills skills}}
```

The `skills` partial renders `{{#each this}} ... {{/each}}`. When `state.skills` changes, only the block re-renders.

If the row body is pure (simple fields only, see §5), leaf-level edits skip the
re-render entirely: `state.skills[2].level = 4` patches one text node. Adding
or removing rows still re-renders the block.

### Focus inside a block

Blocks re-render through a reconcile: unchanged rows keep their DOM nodes, so
focus, input values and scroll survive a re-render. A row whose structure
changed is swapped for a fresh node - keep focused inputs in stable rows, or
outside blocks when possible. For custom restore logic use `afterHydrate`:

```js
api.blockOptions.afterHydrate = function(block) {
  if (block._restoreFocus) block._restoreFocus.focus();
};
```

## 10. What You Do vs What the Engine Does

| You write | Engine does |
|-----------|-------------|
| `{{> extmob/skills skills}}` | Wraps in `<div data-ignition-block="extmob/skills" data-ignition-data="skills" data-ignition-depends="skills">` |
| `<input value="{{candidate.email}}">` | Injects `data-ignition-binding="candidate.email"` for two-way binding |
| `<textarea>{{candidate.description}}</textarea>` | Injects `data-ignition-binding="candidate.description"` |
| `<div data-ignition-text="ui.toastMessage">` | Keeps text content in sync |
| `input/controllers/extmob.js` | Copies to `/assets/controllers/extmob.js` and injects it |
| Reactive page detected | Injects `__IGNITION_INITIAL_DATA__`, `__IGNITION_TEMPLATES__`, `ignition-runtime.js`, preload link |
| Pagination detected | Injects `ignition-pagination.js` |

You do **not** add runtime `<script>` tags, `__IGNITION_INITIAL_DATA__`, or `__IGNITION_TEMPLATES__` to your templates.

---

# Part 2. Deep Dive

Read this section when you need to understand the magic under the hood.

## 11. Page Lifecycle

```
Template + JSON
       ↓
SSR HTML with data-ignition-block regions already filled
       ↓
<head> gets preload link to full dataset (interactive pages)
<body> gets __IGNITION_INITIAL_DATA__, __IGNITION_TEMPLATES__,
       ignition-runtime.js and /assets/controllers/{layout}.js
       ↓
Browser loads runtime
       ↓
Runtime builds reactive state from __IGNITION_INITIAL_DATA__
       ↓
Runtime runs controllers registered via window.ignition.controller()
       ↓
Blocks hydrate, bindings attach, page is alive
```

The renderer decides whether a page is "live" and injects scripts only when needed.

## 12. When Is the Runtime Injected?

A page is considered live when the template contains any of:

- `{{> ignition/pagination ...}}` — system pagination controller
- `value="{{path}}"`, `checked="{{path}}"` or similar auto-binding patterns
- `data-ignition-class`, `data-ignition-attr-*` projections
- A controller file at `input/controllers/{layout}.js`

A bare `data-ignition-block` without any of the above is static SSR: the block is server-rendered once and no runtime is shipped.

This decision is made by `needsRuntime()` in `engine/utils/deriveInitialState.js`.

## 13. Auto-Block Internals

When the compiler sees a partial call with a data path:

```handlebars
{{> extmob/skills skills}}
```

it analyzes the layout template and records `{ partialName: 'extmob/skills', dataPath: 'skills', depends: 'skills' }`.

The engine builds a global auto-block map from **all** layout templates (`detectAutoBlocks()` in `engine/core/renderer.js`) to avoid a race condition: concurrent rendering tasks share one global Handlebars registry, so the decision whether a partial is an auto-block must be deterministic regardless of which task registers it first.

The partial source is then wrapped server-side:

```handlebars
{{#block name="extmob/skills" data="skills" depends="skills"}}
  <!-- original partial content -->
{{/block}}
```

The `{{#block}}` helper:

1. Resolves the data slice with `deepGet()`.
2. Checks `hasContent(slice)`.
3. If the slice has content, renders the registered partial with that slice as context.
4. If the slice is empty/null/undefined, renders the fallback content (the block body) with the partial's current context.
5. Emits the `<div data-ignition-block="...">` wrapper.

The client receives the raw partial source in `__IGNITION_TEMPLATES__` so it can re-render blocks without the server wrapper.

### Hydration: reconcile, not an innerHTML swap

When a block re-renders, the new HTML is parsed off-DOM and reconciled against
the live children pairwise:

- identical subtree -> the old node stays (identity, focus, listeners preserved);
- same structure, different text/attributes -> the old node is patched in place;
- structural divergence -> the fresh node replaces the old one.

The fallback guarantees the resulting DOM is always identical to a naive
innerHTML swap; reconcile only decides *what gets reused*. Rows marked with
`data-ignition-key` are matched by key first, so reorder/insert/delete reuse
the right nodes instead of shifting by index.

### Fine-grained rows: leaf changes without a block re-render

Every state change is classified by the runtime as `leaf` (a primitive written
over an existing slot) or `structural` (a subtree replaced, an array resized, a
key deleted). Blocks subscribe to their `depends` paths and normally re-render
on any change.

For a block whose list qualifies as fine-grained (pure row body, see §5), the
compiler records the covered collection and stamps
`data-ignition-fine="path"` on the block element. The block then re-renders
**only on structural changes**; leaf changes are handled by the row stickers.
The pipeline:

```
compiler: pure {{#each}} body -> @p stickers + coverage set
renderer: coverage -> data-ignition-fine on the block wrapper
runtime:  leaf change  -> sticker patches the cell, block idle
          structural   -> block re-render + row rescope (stickers rebind)
```

After a structural re-render that moved rows (keyed reorder), a single
rescope pass re-derives each row's index and rebinds drifted stickers, so
addresses stay valid. Stickers whose collection is not yet in state (a
controller computes it after boot) bind lazily and never blank SSR text.

When a list does not qualify, the build prints a warning naming the template,
the collection and the exact reason:

```
warn: ⚠️ catalog/page: list "items" re-renders its block on every cell change
  — conditional ({{#if}}/{{#unless}}) inside the row body. Keep the row body
  to simple fields ({{field}}) for fine-grained point updates.
```

A `{{!-- ignition: nobind --}}` opt-out silences these warnings.

## 14. Auto-Binding Internals

The build scans the compiled Handlebars output and injects `data-ignition-binding` attributes for known patterns:

- `<input|textarea|select ... value="{{path}}">` → `data-ignition-binding="path"`
- `<textarea>{{path}}</textarea>` → `data-ignition-binding="path"`
- `<input type="checkbox" checked="{{path}}">` → `data-ignition-binding="path"`

`<select>` binds its **value** via `value="{{path}}"` on the `<select>` element. Option-level `selected="{{...}}"` is **not** auto-detected — it only sets the SSR initial state (§4); no listener is attached for it.

The runtime then attaches listeners to these elements and syncs them with the reactive state.

Because this is a post-processing step on the rendered HTML, avoid unusual quoting or whitespace that would break the pattern. If a binding is missed, you can add `data-ignition-binding="path"` manually.

## 15. Controller Boot Timing

Controllers live in separate files that load after `ignition-runtime.js`. To handle the case where a controller evaluates before the runtime has finished booting, the runtime exposes `window.ignition.controller()` immediately:

- If the state already exists, the callback runs synchronously.
- If the runtime is still booting, the callback is queued and runs as soon as state is ready.

After boot, `window.ignition.controller()` runs callbacks synchronously.

The runtime requires a global `Handlebars` (used for on-demand template compilation). For live pages the renderer auto-injects the self-hosted `<script src="/assets/handlebars.min.js"></script>` as the first boot tag, so no manual script tags are needed.

## 16. Initial Data Derivation

`engine/utils/deriveInitialState.js` extracts all `data-ignition-*` paths from the rendered HTML and builds the inlined state:

- For block-only pages, only paths referenced by blocks are included.
- For interactive pages, the full dataset is inlined.
- `data-ignition-include="path"` can force-include a hidden branch.

The result is serialized into `__IGNITION_INITIAL_DATA__` safely for inline `<script>` tags.

## 17. Personalized Datasets

Load a different dataset and re-render only changed blocks:

```js
window.ignition.loadDataset('/data/catalog/personalized.json');
```

The runtime diffs the new dataset against `__IGNITION_MANIFEST__` and re-renders only the blocks whose data changed.

## 18. HTML Attributes Reference

| Attribute | Element | Description |
|-----------|---------|-------------|
| `data-ignition-block="name"` | Any | Reactive block (auto-generated from `{{> partial path}}`) |
| `data-ignition-data="path"` | Block | State path for block context |
| `data-ignition-depends="a, b"` | Block | Subscription paths (defaults to `data`) |
| `data-ignition-binding="path"` | Form element | Two-way binding (auto-generated from `value="{{path}}"`, etc.) |
| `data-ignition-text="path"` | Any | Text content projection |
| `data-ignition-class="class: path"` | Any | Class toggle. Multiple rules with `;`. Use `!` to negate |
| `data-ignition-attr-{name}="path"` | Any | Attribute/property toggle. Use `!` to negate |
| `data-ignition-include="path"` | `<meta>` | Force-include a state branch in compact initial data |
| `data-ignition-key="value"` | Row element | Stable row identity for list reconcile (survives reorder/insert/delete) |
| `data-ignition-row="path"` | Row element | Marks a repeated row and its collection (auto-generated inside top-level `{{#each}}`) |
| `data-ignition-fine="a, b"` | Block | Depends paths fully covered by row stickers: leaf changes skip the block re-render (auto-generated) |

There is no `data-ignition-on` in user templates. The controller handles events via native `addEventListener`.

## 19. API Reference

### `state.subscribe(path, callback)`
Subscribe to changes at a path. The callback receives
`(fullPath, oldVal, newVal, kind)` where `kind` is `'leaf'` (a primitive written
over an existing slot) or `'structural'` (a subtree replaced, an array resized,
a key deleted). Returns an unsubscribe function.

### `state.set(path, value)`
Set a nested value by dot-separated path.

### `window.ignition.set(path, value)`
Global `state.set`.

### `window.ignition.ephemeral(path, value, ttl)`
Set a value that becomes `null` after `ttl` ms.

### `api.blockOptions.renderers[name] = fn(state)`
Custom renderer for a block.

### `api.blockOptions.sourceDeps[name] = [paths]`
Extra subscription paths for a block.

### `api.blockOptions.afterHydrate = fn(block, html)`
Called after each block render.

### `api.computed(state, name, fn)`
Create a cached derived value.

### `api.registerHelper(name, fn)`
Register a Handlebars helper.

### `api.registerTemplate(name, fnOrSource)`
Register a client-side template.

### `api.loadDataset(url)` / `window.ignition.loadDataset(url)`
Fetch a personalized dataset and merge changes.

## 20. File Reference

- `engine/core/renderer.js` — SSR, auto-block wrapping, script injection
- `engine/core/compiler.js` — template analysis, auto-binding/projection injection
- `engine/core/helpers.js` — canonical Handlebars helpers (server + client)
- `engine/utils/deriveInitialState.js` — `needsRuntime()`, initial data derivation
- `engine/core/runtime/*` — client-side reactivity modules
- `engine/scripts/build-runtime.js` — builds the client IIFE bundle
