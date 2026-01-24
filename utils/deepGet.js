/**
 * Безопасное извлечение значения по пути
 * @param {object} obj - Объект для поиска
 * @param {string} path - Путь в формате "a.b.c"
 * @param {*} defaultValue - Значение по умолчанию
 * @returns {*} Найденное значение или defaultValue
 */
export default function deepGet(obj, path, defaultValue = null) {
  if (!obj || typeof obj !== 'object' || !path) return defaultValue;

  return path.split('.').reduce((current, key) => {
    if (current === null || current === undefined) return defaultValue;
    return current[key] ?? defaultValue;
  }, obj);
}
