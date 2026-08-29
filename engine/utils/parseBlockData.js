export function parseBlockData(dataStr) {
  if (!dataStr || !dataStr.trim()) {
    return { mode: 'single', paths: [] };
  }

  const parts = dataStr
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const paths = parts.map((part) => {
    const explicit = part.match(/^(.+?)\s+as\s+(\w+)$/i);
    if (explicit) {
      return { path: explicit[1].trim(), alias: explicit[2].trim() };
    }
    const segments = part.split('.');
    return { path: part, alias: segments[segments.length - 1] };
  });

  return {
    mode: paths.length === 1 ? 'single' : 'multi',
    paths
  };
}

export function buildBlockContext(data, parsed, getter) {
  if (parsed.mode === 'single') {
    if (!parsed.paths[0]) return data;
    if (parsed.paths[0].path === '.') return data;
    return getter(data, parsed.paths[0].path);
  }

  const ctx = {};
  for (const { path, alias } of parsed.paths) {
    ctx[alias] = path === '.' ? data : getter(data, path);
  }
  return ctx;
}
