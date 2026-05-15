export interface APIGatewayProxyEvent {
  readonly body: string | null;
  readonly httpMethod?: string;
  readonly headers?: Record<string, string | undefined>;
  readonly pathParameters?: Record<string, string | undefined>;
  readonly queryStringParameters?: Record<string, string | undefined>;
}

export interface APIGatewayProxyResult {
  readonly statusCode: number;
  readonly headers?: Record<string, string>;
  readonly body: string;
}
