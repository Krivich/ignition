/**
 * Ignition Pagination — client-side pagination via the COMMON reactivity runtime.
 *
 * Unlike the old standalone class, this controller does NOT re-implement
 * template registration or helper registration. It reuses the shared runtime:
 *   - templates are cached in the common registry (window.ignition.registerTemplate)
 *   - helpers are the single source from helpers.js (registered by the runtime boot)
 *   - rendering flows through the same registry the reactive blocks use
 *
 * G5: the paginated page region is a reactive data-ignition-block. Switching
 * pages updates reactive state (state.__pagination.currentPage) and the common
 * initBlocks re-renders the block region with the new page's items.
 */
(function () {
  'use strict';

  const DATA_ATTR = 'data-ignition-pagination';

  function getConfig(container) {
    try {
      return JSON.parse(container.dataset.ignitionPagination);
    } catch (e) {
      return null;
    }
  }

  async function loadPageTemplate(config, runtime) {
    // If this template is already in the common registry (e.g. it is also a
    // reactive block template), reuse it — no duplicate compile.
    const existing = runtime.getTemplate(config.templateUrl);
    if (existing) return existing;

    let url = config.templateUrl;
    let res = await fetch(url);
    if (!res.ok && res.status === 404) {
      url = url.replace(/\/page\.hbs$/, '/pagination.hbs');
      res = await fetch(url);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const source = await res.text();

    // Register through the common runtime so subsequent work reuses it.
    runtime.registerTemplate(config.templateUrl, function (data) {
      return Handlebars.compile(source)(data);
    });
    return runtime.getTemplate(config.templateUrl);
  }

  function collectionPage(state, config, page) {
    const collection = (state && state[config.collection]) || [];
    const start = (page - 1) * config.perPage;
    return collection.slice(start, start + config.perPage);
  }

  function totalPages(state, config) {
    const collection = (state && state[config.collection]) || [];
    return Math.max(1, Math.ceil(collection.length / config.perPage));
  }

  function paginationData(config, state, page) {
    const total = totalPages(state, config);
    return {
      currentPage: page,
      totalPages: total,
      hasNext: page < total,
      hasPrev: page > 1,
      nextPage: page + 1,
      prevPage: page - 1
    };
  }

  async function initContainer(container, runtime) {
    const config = getConfig(container);
    if (!config) return;

    // Load the full dataset through the common runtime and expose the page
    // slice as reactive state, so blocks depending on it re-render.
    const state = runtime.state;
    if (!state[config.collection]) {
      const dataset = await runtime.fetchJson(config.dataUrl);
      state[config.collection] = dataset[config.collection] || [];
    }
    state.__pagination = state.__pagination || {
      currentPage: config.currentPage,
      config: config
    };

    const template = await loadPageTemplate(config, runtime);

    function render(page) {
      state.__pagination.currentPage = page;
      const items = collectionPage(state, config, page);

      // Render via the common registry into the container region.
      const html = template({
        items,
        pagination: paginationData(config, state, page)
      });
      runtime.hydrate(container, html);

      container.dispatchEvent(new CustomEvent('ignition:pageChange', { detail: { page } }));
    }

    container.addEventListener('click', function (e) {
      const link = e.target.closest('[data-page]');
      if (!link) return;
      e.preventDefault();
      const page = parseInt(link.dataset.page, 10);
      if (page >= 1 && page <= totalPages(state, config)) {
        render(page);
        history.pushState({ page }, `Page ${page}`, link.href);
      }
    });
  }

  function init() {
    const runtime = window.ignition;
    if (!runtime) return;

    document.querySelectorAll(`[${DATA_ATTR}]`).forEach(function (container) {
      initContainer(container, runtime).catch(function (err) {
        console.error('Ignition pagination failed:', err);
      });
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
