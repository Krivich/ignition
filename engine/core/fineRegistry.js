// Shared registry: the renderer records each partial's fine-grained coverage
// (depends paths whose every data flow goes through @p stickers) at
// registration time; the server-side {{#block}} helper reads it by block name
// when stamping data-ignition-fine. Kept import-free so both sides can depend
// on it without cycles.
export const fineCoverage = new Map();
