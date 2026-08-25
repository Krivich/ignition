/**
 * Safe value extraction by path
 * @param {object} obj - Object to search in
 * @param {string} path - Path in format "a.b.c"
 * @param {*} defaultValue - Default value
 * @returns {*} Found value or defaultValue
 */
export default function deepGet(obj, path, defaultValue = null) {
  if (!obj || typeof obj !== 'object' || !path) return defaultValue;

  return path.split('.').reduce((current, key) => {
    if (current === null || current === undefined) return defaultValue;
    return current[key] ?? defaultValue;
  }, obj);
}
