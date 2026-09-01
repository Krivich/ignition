// Shared registry: the renderer records each partial's fine-grained coverage
// (depends paths whose every data flow goes through @p stickers) at
// registration time; the server-side {{#block}} helper reads it by block name
// when stamping data-ignition-fine. Kept import-free so both sides can depend
// on it without cycles.
export const fineCoverage = new Map();

// Shared registry: the renderer records each partial's ROOT-context branch
// signals ({{#if metrics.loading}} at root context) at registration time; the
// server-side {{#block}} helper merges them into data-ignition-depends so the
// runtime re-renders the block when a widget-level flag flips (loading
// skeletons stay predictable under mutation coalescing). Import-free like
// fineCoverage.
export const blockSignals = new Map();
