/**
 * Ignition Pagination - универсальный скрипт для клиентской пагинации
 * Работает с ЛЮБЫМ шаблоном, имеющим data-ignition-pagination
 */
class IgnitionPagination {
    constructor(container) {
        this.container = container;
        try {
            this.config = JSON.parse(container.dataset.ignitionPagination);
        } catch (e) {
            console.error('Invalid ignition-pagination config', e);
            return;
        }

        this.data = null;
        this.template = null;
        this.currentPage = this.config.currentPage;

        this.init().catch(err => {
            console.error('IgnitionPagination init failed:', err);
            this.showError('Ошибка загрузки пагинации');
        });
    }

    async init() {
        // 1. Загружаем данные
        this.data = await this.fetchJson(this.config.dataUrl);

        // 2. Загружаем и компилируем шаблон
        // Теперь templateUrl содержит полный путь: /templates/catalog/page.hbs
        const templateSource = await this.fetchTemplate(this.config.templateUrl);
        this.template = Handlebars.compile(templateSource);

        // 3. Регистрируем хелперы (уже есть, не меняем)
        this.registerCoreHelpers();

        // 4. Настраиваем обработчики
        this.setupEventListeners();
    }

    async fetchJson(url) {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    }

    async fetchTemplate(url) {
        // URL уже содержит правильный путь
        const response = await fetch(url);
        if (!response.ok) {
            // Если шаблон не найден, пытаемся загрузить шаблон по умолчанию
            if (response.status === 404) {
                const fallbackUrl = url.replace(/\/page\.hbs$/, '/pagination.hbs');
                const fallbackResponse = await fetch(fallbackUrl);
                if (fallbackResponse.ok) {
                    logger.warn(`Using fallback template: ${fallbackUrl}`);
                    return await fallbackResponse.text();
                }
            }
            throw new Error(`HTTP ${response.status} for ${url}`);
        }
        return await response.text();
    }

    registerCoreHelpers() {
        // Регистрируем ТОЛЬКО если хелпер ещё не существует
        if (!Handlebars.helpers.times) {
            Handlebars.registerHelper('times', function(n, block) {
                if (typeof n !== 'number' || n <= 0) return '';
                let result = '';
                for (let i = 1; i <= n; i++) result += block.fn(i);
                return result;
            });
        }

        if (!Handlebars.helpers.ifCond) {
            Handlebars.registerHelper('ifCond', function(v1, operator, v2, options) {
                switch (operator) {
                    case '==': return (v1 == v2) ? options.fn(this) : options.inverse(this);
                    case '===': return (v1 === v2) ? options.fn(this) : options.inverse(this);
                    case '!=': return (v1 != v2) ? options.fn(this) : options.inverse(this);
                    case '!==': return (v1 !== v2) ? options.fn(this) : options.inverse(this);
                    case '<': return (v1 < v2) ? options.fn(this) : options.inverse(this);
                    case '<=': return (v1 <= v2) ? options.fn(this) : options.inverse(this);
                    case '>': return (v1 > v2) ? options.fn(this) : options.inverse(this);
                    case '>=': return (v1 >= v2) ? options.fn(this) : options.inverse(this);
                    default: return options.inverse(this);
                }
            });
        }
    }

    setupEventListeners() {
        this.container.addEventListener('click', (e) => {
            const pageLink = e.target.closest('[data-page]');
            if (pageLink) {
                e.preventDefault();
                const page = parseInt(pageLink.dataset.page, 10);
                this.renderPage(page);

                // Обновляем URL без перезагрузки
                const newUrl = pageLink.href;
                history.pushState({ page }, `Page ${page}`, newUrl);
            }
        });
    }

    async renderPage(page) {
        if (page < 1 || page > this.getTotalPages() || page === this.currentPage) {
            return;
        }

        try {
            const items = this.getItemsForPage(page);
            const paginationData = this.getPaginationData(page);

            // Формируем данные для шаблона
            const templateData = {
                items,
                pagination: paginationData
            };

            // Рендерим HTML
            const html = this.template(templateData);

            // Атомарное обновление DOM
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html;
            this.container.innerHTML = tempDiv.innerHTML;

            this.currentPage = page;

            // Вызываем кастомное событие для внешних скриптов
            this.container.dispatchEvent(new CustomEvent('ignition:pageChange', {
                detail: { page }
            }));

        } catch (err) {
            console.error('Error rendering page:', err);
            this.showError('Не удалось загрузить страницу');
        }
    }

    getItemsForPage(page) {
        const collection = this.data[this.config.collection] || [];
        const start = (page - 1) * this.config.perPage;
        return collection.slice(start, start + this.config.perPage);
    }

    getTotalPages() {
        const collection = this.data[this.config.collection] || [];
        return Math.max(1, Math.ceil(collection.length / this.config.perPage));
    }

    getPaginationData(page) {
        const totalPages = this.getTotalPages();
        return {
            currentPage: page,
            totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1,
            nextPage: page + 1,
            prevPage: page - 1
        };
    }

    showError(message) {
        this.container.innerHTML = `<div class="ignition-error" style="padding: 20px; color: #dc3545; border: 1px solid #dc3545; border-radius: 4px;">${message}</div>`;
    }
}

// Автоинициализация при загрузке DOM
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-ignition-pagination]').forEach(container => {
        new IgnitionPagination(container);
    });
});

// Экспортируем класс для расширения
if (typeof window !== 'undefined') {
    window.IgnitionPagination = IgnitionPagination;
}