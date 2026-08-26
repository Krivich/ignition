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
  element.replaceChildren(...temp.childNodes);
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
