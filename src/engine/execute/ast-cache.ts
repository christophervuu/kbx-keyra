import type { AstNode } from '../dsl/types.js';

export class AstCache {
  private readonly cache = new Map<string, AstNode | null>();

  get(expression: string): AstNode | null | undefined {
    return this.cache.get(expression);
  }

  set(expression: string, ast: AstNode | null): void {
    this.cache.set(expression, ast);
  }

  has(expression: string): boolean {
    return this.cache.has(expression);
  }

  clear(): void {
    this.cache.clear();
  }
}
