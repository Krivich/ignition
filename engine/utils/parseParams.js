export function parseHandlebarsParams(paramsStr) {
    const params = {};
    const paramRegex = /(\w+)=(?:"([^"]+)"|(\w+))/g;
    let match;

    while ((match = paramRegex.exec(paramsStr)) !== null) {
        const key = match[1];
        const value = match[2] || match[3];
        params[key] = isNaN(value) ? value : Number(value);
    }

    if (params.pageTemplate) {
        const template = String(params.pageTemplate);
        if (/[.]{2}/.test(template) || /[^a-zA-Z0-9\-_/]/.test(template)) {
            throw new Error(`Invalid pageTemplate value: ${template}. Only alphanumeric, hyphens, underscores, slashes allowed. No path traversal.`);
        }
        params.fullTemplatePath = template;
        params.templateName = template.split('/')[0];
        params.template = template.split('/')[1];
    } else {
        params.template = params.template || 'pagination';
        params.fullTemplatePath = `${params.layout || 'catalog'}/${params.template}`;
        params.templateName = params.layout || 'catalog';
    }

    return params;
}
