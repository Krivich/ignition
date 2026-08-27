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
  
  // Match value="{{path}}"
  const valueRegex = /<(input|textarea)[^>]*value="(?:\{\{([^}]+)\}\})"[^>]*>/gi;
  let match;
  while ((match = valueRegex.exec(templateSource)) !== null) {
    bindings.push({
      element: match[1],
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
