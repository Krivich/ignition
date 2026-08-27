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
        params.fullTemplatePath = params.pageTemplate;
        params.templateName = params.pageTemplate.split('/')[0];
        params.template = params.pageTemplate.split('/')[1];
    } else {
        params.template = params.template || 'pagination';
        params.fullTemplatePath = `${params.layout || 'catalog'}/${params.template}`;
        params.templateName = params.layout || 'catalog';
    }

    return params;
}
