import type { AstNode, FunctionCallNode } from '../dsl/types.js';

function walkAst(node: AstNode, visitor: (node: AstNode) => void): void {
  visitor(node);

  if (node.type === 'FunctionCall') {
    for (const argument of node.arguments) {
      walkAst(argument, visitor);
    }
    return;
  }

  if (node.type === 'ObjectTemplate') {
    for (const property of node.properties) {
      walkAst(property.value, visitor);
    }
  }
}

export function findFunctionCalls(node: AstNode, functionName: string): FunctionCallNode[] {
  const matches: FunctionCallNode[] = [];

  walkAst(node, (current) => {
    if (current.type === 'FunctionCall' && current.name === functionName) {
      matches.push(current);
    }
  });

  return matches;
}
