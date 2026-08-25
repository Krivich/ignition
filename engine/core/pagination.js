import deepGet from '../utils/deepGet.js';
import logger from '../utils/logger.js';
import config from '../config/default.js';

/**
 * Splits collection into pages
 * @param {Object} data - Source data
 * @param {string} collectionPath - Path to collection (e.g., "items")
 * @param {number} perPage - Items per page
 * @returns {Array} Array of pages
 */
export function paginateCollection(data, collectionPath, perPage) {
  const collection = deepGet(data, collectionPath, []);

  if (!Array.isArray(collection)) {
    logger.warn(`Collection at path "${collectionPath}" is not an array`, { type: typeof collection });
    return [];
  }

  const itemsPerPage = Math.max(1, Math.min(perPage, config.pagination.maxPages));
  const totalPages = Math.ceil(collection.length / itemsPerPage);

  const pages = [];
  for (let i = 0; i < totalPages; i++) {
    const start = i * itemsPerPage;
    const end = start + itemsPerPage;
    const items = collection.slice(start, end);

    pages.push({
      pageNumber: i + 1,
      items,
      totalPages
    });
  }

  logger.debug(`Paginated collection "${collectionPath}"`, {
    totalItems: collection.length,
    perPage: itemsPerPage,
    totalPages: pages.length
  });

  return pages;
}

/**
 * Prepares data for page rendering
 * @param {Object} data - Source data
 * @param {Object} page - Page object
 * @param {number} currentPage - Current page number
 * @returns {Object} Data for template
 */
export function preparePageData(data, page, currentPage) {
  return {
    ...data,
    pagination: {
      items: page.items,
      currentPage,
      totalPages: page.totalPages,
      hasNext: currentPage < page.totalPages,
      hasPrev: currentPage > 1,
      nextPage: currentPage + 1,
      prevPage: currentPage - 1
    }
  };
}
