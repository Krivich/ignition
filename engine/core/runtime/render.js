const templateRegistry = new Map();
const jsonCache = new Map();

export function resetRegistry() {
  templateRegistry.clear();
  jsonCache.clear();
}

export function registerTemplate(name, fn) {
  templateRegistry.set(name, fn);
}

export function getTemplate(name) {
  return templateRegistry.get(name);
}

export function renderTemplate(name, data) {
  const fn = templateRegistry.get(name);
  if (!fn) throw new Error(`Template not found: ${name}`);
  return fn(data);
}

export function hydrate(element, html) {
  const temp = document.createElement('div');
  temp.innerHTML = html;
  // Order-preserving reconcile: reuse existing element/text nodes whose
  // structure is unchanged (typical in-place list/cell edits), so we avoid
  // tearing down + rebuilding rows (and re-binding them) on every re-render.
  // Any structural or attribute divergence falls back to swapping in the
  // freshly parsed node, keeping the resulting DOM identical to the naive
  // replaceChildren swap. Node-identity (and with it focus, input state and
  // existing bindings) is preserved for stable rows.
  reconcileChildren(element, Array.from(element.childNodes), Array.from(temp.childNodes));
}

// Reuse a node only when attributes match exactly (name+value+order), so an
// in-place patch serializes identically to a fresh re-parse of the new markup.
function attributesCompatible(a, b) {
  const aa = a.attributes;
  const ba = b.attributes;
  if (aa.length !== ba.length) return false;
  for (let i = 0; i < aa.length; i++) {
    if (aa[i].name !== ba[i].name || aa[i].value !== ba[i].value) return false;
  }
  return true;
}

function isKeyed(node) {
  return node.nodeType === 1 && node.hasAttribute('data-ignition-key');
}

function reconcileChildren(parent, oldChildren, newChildren) {
  // Keyed mode: when the new children carry data-ignition-key rows, match old
  // rows by key so insert/delete/reorder reuse the same DOM nodes (preserving
  // node identity — and with it focus, scroll and bindings). This is the same
  // stable row identity mechanism fine-grained reactivity will build on.
  for (let i = 0; i < newChildren.length; i++) {
    if (isKeyed(newChildren[i])) {
      reconcileKeyed(parent, oldChildren, newChildren);
      return;
    }
  }
  reconcileOrdered(parent, oldChildren, newChildren);
}

function reconcileKeyed(parent, oldChildren, newChildren) {
  const byKey = new Map();
  for (const oldN of oldChildren) {
    if (isKeyed(oldN)) byKey.set(oldN.getAttribute('data-ignition-key'), oldN);
  }
  const used = new Set();
  for (let i = 0; i < newChildren.length; i++) {
    const newN = newChildren[i];
    const k = isKeyed(newN) ? newN.getAttribute('data-ignition-key') : null;
    if (k !== null) {
      const oldN = byKey.get(k);
      if (oldN && !used.has(oldN)) {
        used.add(oldN);
        parent.appendChild(oldN); // move to correct position (reorder)
        syncKeyedNode(oldN, newN);
        continue;
      }
    }
    // unkeyed new node or no reusable match → insert the fresh node
    parent.appendChild(newN);
  }
  // drop every old child that was not reused (deleted rows + unkeyed stragglers)
  for (const oldN of oldChildren) {
    if (!used.has(oldN) && oldN.parentNode === parent) parent.removeChild(oldN);
  }
}

// Reuse an element whose identity we want to keep (focus/scroll/bindings) by
// making it match the freshly parsed node exactly: attributes copied in the new
// node's order + children reconciled, so serialization stays identical too.
function syncKeyedNode(oldN, newN) {
  const oldAttrs = Array.from(oldN.attributes);
  for (let i = 0; i < oldAttrs.length; i++) oldN.removeAttribute(oldAttrs[i].name);
  const newAttrs = Array.from(newN.attributes);
  for (let i = 0; i < newAttrs.length; i++) oldN.setAttribute(newAttrs[i].name, newAttrs[i].value);
  reconcileChildren(oldN, Array.from(oldN.childNodes), Array.from(newN.childNodes));
}

// Structural equivalence WITHOUT serialization: jsdom's outerHTML getter is
// disproportionately expensive (fresh serializer + full subtree walk per
// call), so identity is decided by attribute/child-structure recursion on the
// cheap accessors instead.
function nodesEquivalent(a, b) {
  if (a.nodeType !== b.nodeType || a.nodeName !== b.nodeName) return false;
  if (a.nodeType === 3) return a.nodeValue === b.nodeValue;
  if (!attributesCompatible(a, b)) return false;
  const ac = a.childNodes;
  const bc = b.childNodes;
  if (ac.length !== bc.length) return false;
  for (let i = 0; i < ac.length; i++) {
    if (!nodesEquivalent(ac[i], bc[i])) return false;
  }
  return true;
}

function reconcileOrdered(parent, oldChildren, newChildren) {
  const min = Math.min(oldChildren.length, newChildren.length);
  let prefix = 0;
  while (prefix < min && nodesEquivalent(oldChildren[prefix], newChildren[prefix])) prefix++;
  if (prefix === oldChildren.length && prefix === newChildren.length) return;
  if (prefix === oldChildren.length) {
    parent.append(...newChildren.slice(prefix));
    return;
  }
  if (prefix === newChildren.length) {
    parent.replaceChildren(...newChildren);
    return;
  }
  const max = Math.max(oldChildren.length, newChildren.length);
  for (let i = 0; i < max; i++) {
    const oldN = oldChildren[i];
    const newN = newChildren[i];
    if (oldN && !newN) {
      parent.removeChild(oldN);
      continue;
    }
    if (!oldN && newN) {
      parent.appendChild(newN);
      continue;
    }
    if (oldN.nodeType !== newN.nodeType || oldN.nodeName !== newN.nodeName) {
      parent.replaceChild(newN, oldN);
      continue;
    }
    if (oldN.nodeType === 3) {
      if (oldN.nodeValue !== newN.nodeValue) oldN.nodeValue = newN.nodeValue;
    } else if (nodesEquivalent(oldN, newN)) {
      // identical subtree → leave untouched (keeps bindings + focus).
    } else if (attributesCompatible(oldN, newN)) {
      reconcileChildren(oldN, Array.from(oldN.childNodes), Array.from(newN.childNodes));
    } else {
      parent.replaceChild(newN, oldN);
    }
  }
}

const pendingFetches = new Map();

export async function fetchJson(url) {
  if (jsonCache.has(url)) return jsonCache.get(url);
  if (pendingFetches.has(url)) return pendingFetches.get(url);

  const promise = fetch(url)
    .then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then(data => {
      jsonCache.set(url, data);
      pendingFetches.delete(url);
      return data;
    })
    .catch(err => {
      pendingFetches.delete(url);
      throw err;
    });

  pendingFetches.set(url, promise);
  return promise;
}
