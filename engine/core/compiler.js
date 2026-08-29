import Handlebars from 'handlebars';

/**
 * Compiler reflection pass for Ignition v2.
 * 
 * Walks the Handlebars AST and auto-generates reflection attributes for partials.
 * Tracks context path through #each/#with blocks.
 */

/**
 * Walk the AST and collect partial calls with their context paths.
 * 
 * @param {object} ast - Handlebars AST
 * @returns {Array<{partialName: string, dataPath: string, depends: string}>}
 */
export function collectPartials(ast) {
  const partials = [];
  const contextStack = [''];

  function walk(node) {
    if (!node) return;

    // Track context changes
    if (node.type === 'BlockStatement') {
      const path = node.path.original;
      
      // #each and #with change context
      if (path === 'each' || path === 'with') {
        const param = node.params[0];
        if (param && param.type === 'PathExpression') {
          const parentContext = contextStack[contextStack.length - 1];
          const newContext = parentContext ? `${parentContext}.${param.original}` : param.original;
          contextStack.push(newContext);
          
          // Walk children
          if (node.program) {
            node.program.body.forEach(walk);
          }
          
          contextStack.pop();
          return;
        }
      }
      
      // #if doesn't change context
      if (node.program) {
        node.program.body.forEach(walk);
      }
      if (node.inverse) {
        node.inverse.body.forEach(walk);
      }
      return;
    }

    // Collect partial calls
    if (node.type === 'PartialStatement') {
      const partialName = node.name.original;
      const currentContext = contextStack[contextStack.length - 1];
      
      // Determine data path from partial parameters
      let dataPath = currentContext;
      if (node.params && node.params.length > 0) {
        const param = node.params[0];
        if (param.type === 'PathExpression') {
          dataPath = currentContext ? `${currentContext}.${param.original}` : param.original;
        }
      }
      
      partials.push({
        partialName,
        dataPath,
        depends: dataPath, // Default: depends = data
      });
    }

    // Walk other node types
    if (node.body) {
      if (Array.isArray(node.body)) {
        node.body.forEach(walk);
      } else {
        walk(node.body);
      }
    }
    if (node.program) {
      if (Array.isArray(node.program.body)) {
        node.program.body.forEach(walk);
      } else {
        walk(node.program.body);
      }
    }
    if (node.inverse) {
      if (Array.isArray(node.inverse.body)) {
        node.inverse.body.forEach(walk);
      } else {
        walk(node.inverse.body);
      }
    }
  }

  walk(ast);
  return partials;
}

/**
 * Collect autobindings from template source.
 * Detects value="{{path}}" and checked="{{path}}" patterns.
 * 
 * @param {string} templateSource
 * @returns {Array<{element: string, path: string, type: string}>}
 */
export function collectAutobindings(templateSource) {
  const bindings = [];
  
  // Match value="{{path}}" on input, textarea, select
  const valueRegex = /<(input|textarea|select)[^>]*value="(?:\{\{([^}]+)\}\})"[^>]*>/gi;
  let match;
  while ((match = valueRegex.exec(templateSource)) !== null) {
    bindings.push({
      element: match[1],
      path: match[2],
      type: 'value',
    });
  }

  // Match <textarea>{{path}}</textarea>
  const textareaRegex = /<textarea([^>]*)>(?:\{\{([^}]+)\}\})<\/textarea>/gi;
  while ((match = textareaRegex.exec(templateSource)) !== null) {
    bindings.push({
      element: 'textarea',
      path: match[2],
      type: 'value',
    });
  }

  // Match checked="{{path}}"
  const checkedRegex = /<input[^>]*type="checkbox"[^>]*checked="(?:\{\{([^}]+)\}\})"[^>]*>/gi;
  while ((match = checkedRegex.exec(templateSource)) !== null) {
    bindings.push({
      element: 'input',
      path: match[1],
      type: 'checked',
    });
  }

  return bindings;
}

/**
 * Check if template has noblock opt-out comment.
 * 
 * @param {string} templateSource
 * @returns {boolean}
 */
export function hasNoblock(templateSource) {
  return /\{\{!--\s*ignition:\s*noblock\s*--\}\}/.test(templateSource);
}

/**
 * Transform autobinding patterns into explicit data-ignition-binding attributes.
 * This lets Handlebars evaluate the value while the runtime discovers the binding.
 * 
 * @param {string} templateSource
 * @returns {string}
 */
export function applyAutobindings(templateSource) {
  if (hasNobind(templateSource)) return templateSource;

  // value="{{path}}" -> value="{{path}}" data-ignition-binding="path"
  let result = templateSource.replace(
    /(<(?:input|textarea|select)[^>]*)value="(\{\{([^}]+)\}\})"([^>]*>)/gi,
    (match, before, expr, path, after) => `${before}value="${expr}" data-ignition-binding="${path.trim()}"${after}`
  );

  // <textarea>{{path}}</textarea> -> <textarea data-ignition-binding="path">{{path}}</textarea>
  result = result.replace(
    /(<textarea[^>]*)>(\{\{([^}]+)\}\})(<\/textarea>)/gi,
    (match, before, expr, path, after) => `${before} data-ignition-binding="${path.trim()}">${expr}${after}`
  );

  // checked="{{path}}" -> checked="{{path}}" data-ignition-binding="path"
  result = result.replace(
    /(<input[^>]*)checked="(\{\{([^}]+)\}\})"([^>]*>)/gi,
    (match, before, expr, path, after) => `${before}checked="${expr}" data-ignition-binding="${path.trim()}"${after}`
  );

  return result;
}

/**
 * Auto-generate point-projection reflection: `<span>{{expr}}</span>` ->
 * `<span data-ignition-text="expr">{{expr}}</span>`.
 *
 * The `{{expr}}` stays in the body so SSR fills the real value (no-JS page is
 * complete), while `data-ignition-text` records the reactive path for the
 * runtime to update the text node without a block re-render.
 *
 * Context-shifting regions (`{{#each}}`, `{{#with}}`, `{{#block}}`) are
 * masked out: inside them paths are relative/per-item and don't map to a
 * stable state path, so they are left to their host block's re-render.
 *
 * @param {string} templateSource
 * @returns {string}
 */
export function applyProjections(templateSource) {
  // Find context-shifting block regions ({{#each/with/block}} ... {{/...}})
  // with a stack matcher so nested blocks pair correctly.
  const tagRe = /\{\{#(?:each|with|block)\b|\{\{\/(?:each|with|block)\}\}/g;
  const tagList = [];
  let t;
  while ((t = tagRe.exec(templateSource)) !== null) {
    tagList.push({ index: t.index, isOpen: t[0].startsWith('{{#'), end: t.index + t[0].length });
  }
  const st = [];
  const regions = [];
  for (const tok of tagList) {
    if (tok.isOpen) {
      st.push(tok);
    } else {
      const open = st.pop();
      if (open) regions.push([open.index, tok.end]);
    }
  }
  // Keep only outermost regions (a region fully inside another is skipped).
  const kept = [];
  let covered = -1;
  for (const r of regions.sort((a, b) => a[0] - b[0])) {
    if (r[0] > covered) {
      kept.push(r);
      covered = r[1] - 1;
    }
  }

  // Mask the regions so relative/per-item expressions aren't projected.
  const placeholders = [];
  let out = '';
  let pos = 0;
  for (const r of kept) {
    out += templateSource.slice(pos, r[0]);
    const ph = `\u0000IGN${placeholders.length}\u0000`;
    placeholders.push(templateSource.slice(r[0], r[1]));
    out += ph;
    pos = r[1];
  }
  out += templateSource.slice(pos);

  // Project `<tag ...>{{simplePath}}</tag>` -> same + data-ignition-text="path".
  const PROJ_RE = /<([a-zA-Z][a-zA-Z0-9-]*)([^>]*?)>(\{\{\s*([a-zA-Z0-9_.@$*\/\[\]-]+?)\s*\}\})<\/\1>/g;
  out = out.replace(PROJ_RE, (match, tag, attrs, expr, path) => {
    if (/^(title|script|style|textarea)$/i.test(tag)) return match;
    if (/data-ignition-(text|binding|block)\s*=/.test(attrs)) return match;
    const bodyPath = path.trim();
    return `<${tag}${attrs} data-ignition-text="${bodyPath.replace(/"/g, '&quot;')}">${expr}</${tag}>`;
  });

  for (let p = 0; p < placeholders.length; p++) {
    out = out.replace(`\u0000IGN${p}\u0000`, placeholders[p]);
  }
  return out;
}

/**
 * Check if template has nobind opt-out comment.
 *
 * @param {string} templateSource
 * @returns {boolean}
 */
export function hasNobind(templateSource) {
  return /\{\{!--\s*ignition:\s*nobind\s*--\}\}/.test(templateSource);
}

/**
 * Analyze a template and return reflection metadata.
 * 
 * @param {string} templateSource
 * @returns {{partials: Array, autobindings: Array, hasNoblock: boolean, hasNobind: boolean}}
 */
export function analyzeTemplate(templateSource) {
  const ast = Handlebars.parse(templateSource);
  const partials = collectPartials(ast);
  const autobindings = hasNobind(templateSource) ? [] : collectAutobindings(templateSource);
  
  return {
    partials: hasNoblock(templateSource) ? [] : partials,
    autobindings,
    hasNoblock: hasNoblock(templateSource),
    hasNobind: hasNobind(templateSource),
  };
}
