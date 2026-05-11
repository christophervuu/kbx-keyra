import { explainRuleHttp, suggestExpressionHttp } from './ai-api-client';
import { LocalStorageAdapter } from './local-storage-adapter';

import type {
  ExplainRuleInput,
  ExplainRuleResult,
  SuggestExpressionInput,
  SuggestExpressionResult,
} from '@/lib/types';

export class HybridAdapter extends LocalStorageAdapter {
  private readonly apiUrl: string;

  constructor(apiUrl: string) {
    super();
    this.apiUrl = apiUrl;
  }

  override async explainRule(input: ExplainRuleInput): Promise<ExplainRuleResult> {
    return explainRuleHttp(this.apiUrl, input);
  }

  override async suggestExpression(
    input: SuggestExpressionInput,
  ): Promise<SuggestExpressionResult> {
    return suggestExpressionHttp(this.apiUrl, input);
  }
}
