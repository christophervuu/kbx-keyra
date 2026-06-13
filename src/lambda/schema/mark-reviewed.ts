import {
  ERROR_CODES,
  errorResponse,
  internalError,
  jsonResponse,
  notFound,
  parsePathParam,
  type APIGatewayProxyEvent,
  type APIGatewayProxyResult,
} from '../shared/index.js';
import { aggregateReviewIssues, get, markReviewed } from '../../lib/persistence/schema-metadata.js';
import { toSchemaMetadata } from '../../lib/persistence/types.js';

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const schemaId = parsePathParam(event, 'id');
  if (!schemaId) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing required path parameter: id', 400, false);
  }

  try {
    const existing = await get(schemaId);
    if (!existing) {
      const err = notFound('Schema', schemaId);
      return errorResponse(err.code, err.message, err.statusCode, err.retryable);
    }

    const updated = await markReviewed(schemaId);
    const summary = aggregateReviewIssues({
      inferred: updated.inferred,
      reviewState: updated.reviewState,
      reviewedAt: updated.reviewedAt,
      inferenceIssueCounts: updated.inferenceIssueCounts,
    });

    return jsonResponse(200, {
      metadata: toSchemaMetadata(updated),
      reviewSummary: {
        issues: summary.reviewIssues,
        totalIssues: summary.totalIssues,
        blockingIssueCount: summary.blockingIssueCount,
        hasBlockingIssues: summary.hasBlockingIssues,
      },
    });
  } catch {
    const err = internalError();
    return errorResponse(err.code, err.message, err.statusCode, err.retryable);
  }
}
