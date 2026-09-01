const registry = new WeakMap();
const effectStack = [];

function getRegistry(state) {
  if (!registry.has(state)) {
    registry.set(state, []);
  }
  return registry.get(state);
}

function flushDirty(state) {
  const computeds = getRegistry(state);
  let hadDirty;
  do {
    hadDirty = false;
    for (const c of computeds) {
      if (c.dirty) {
        c.recompute();
        hadDirty = true;
      }
    }
  } while (hadDirty);
}

export function createComputed(state, name, fn) {
  const entry = {
    name,
    fn,
    dirty: true,
    cached: undefined,
    stateUnsubs: [],
    children: new Set(),
    parents: new Set(),
    recompute() {
      for (const unsub of entry.stateUnsubs) {
        unsub();
      }
      entry.stateUnsubs = [];

      for (const child of entry.children) {
        child.parents.delete(entry);
      }
      entry.children.clear();

      effectStack.push(entry);
      const deps = state.track(() => {
        entry.cached = fn(state);
      });
      effectStack.pop();

      for (const dep of deps) {
        entry.stateUnsubs.push(state.subscribe(dep, () => {
          entry.invalidate();
        }));
      }

      entry.dirty = false;
    },
    invalidate() {
      if (entry.dirty) return;
      entry.dirty = true;
      for (const parent of entry.parents) {
        parent.invalidate();
      }
    }
  };

  const computeds = getRegistry(state);
  computeds.push(entry);

  const getter = () => {
    // Coalesced mutations only invalidate computed entries on flush. A read
    // must not return a stale cache, so drain pending notifications first.
    if (typeof state.flush === 'function') state.flush();
    const parent = effectStack[effectStack.length - 1];
    if (parent) {
      parent.children.add(entry);
      entry.parents.add(parent);
    }
    if (entry.dirty) {
      flushDirty(state);
    }
    return entry.cached;
  };

  entry.recompute();

  return getter;
}
