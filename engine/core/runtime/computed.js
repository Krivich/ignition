const registry = new WeakMap();

function getRegistry(state) {
  if (!registry.has(state)) {
    registry.set(state, []);
  }
  return registry.get(state);
}

function flushDirty(state) {
  const computeds = getRegistry(state);
  for (const c of computeds) {
    if (c.dirty) {
      c.recompute();
    }
  }
}

export function createComputed(state, name, fn) {
  const entry = {
    name,
    fn,
    dirty: true,
    cached: undefined,
    recompute() {
      entry.cached = fn(state);
      entry.dirty = false;
    }
  };

  const computeds = getRegistry(state);
  computeds.push(entry);

  const getter = () => {
    if (entry.dirty) {
      flushDirty(state);
    }
    return entry.cached;
  };

  state.subscribe('*', () => {
    entry.dirty = true;
  });

  entry.recompute();

  return getter;
}
