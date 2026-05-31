import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

import { serviceUnavailable, type AppErrorDetails } from './errors.js';

function getEnvValue(key: string): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.[key];
}

function createDynamoClient(): DynamoDBDocumentClient {
  const endpoint = getEnvValue('DYNAMODB_ENDPOINT') ?? getEnvValue('AWS_ENDPOINT_URL_DYNAMODB');

  const base = new DynamoDBClient({
    ...(endpoint ? { endpoint } : {}),
  });

  return DynamoDBDocumentClient.from(base);
}

export const dynamoClient = createDynamoClient();

export class DynamoServiceError extends Error {
  constructor(
    message: string,
    public readonly appError: AppErrorDetails,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'DynamoServiceError';
  }
}

function isThrottleError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const typed = error as { name?: string };
  return typed.name === 'ProvisionedThroughputExceededException' || typed.name === 'ThrottlingException';
}

function mapDynamoError(error: unknown, operation: string): never {
  if (isThrottleError(error)) {
    const mapped = serviceUnavailable(`DynamoDB throttled during ${operation}`);
    throw new DynamoServiceError(mapped.message, mapped, error);
  }

  throw error;
}

export async function getItem<T>(params: ConstructorParameters<typeof GetCommand>[0]): Promise<T | null> {
  try {
    const result = await dynamoClient.send(new GetCommand(params));
    return (result.Item as T | undefined) ?? null;
  } catch (error) {
    return mapDynamoError(error, 'getItem');
  }
}

export async function putItem(params: ConstructorParameters<typeof PutCommand>[0]): Promise<void> {
  try {
    await dynamoClient.send(new PutCommand(params));
  } catch (error) {
    mapDynamoError(error, 'putItem');
  }
}

export async function query<T>(params: ConstructorParameters<typeof QueryCommand>[0]): Promise<T[]> {
  try {
    const result = await dynamoClient.send(new QueryCommand(params));
    return (result.Items ?? []) as T[];
  } catch (error) {
    return mapDynamoError(error, 'query');
  }
}

export async function scan<T>(params: ConstructorParameters<typeof ScanCommand>[0]): Promise<T[]> {
  try {
    const result = await dynamoClient.send(new ScanCommand(params));
    return (result.Items ?? []) as T[];
  } catch (error) {
    return mapDynamoError(error, 'scan');
  }
}

export async function deleteItem(params: ConstructorParameters<typeof DeleteCommand>[0]): Promise<void> {
  try {
    await dynamoClient.send(new DeleteCommand(params));
  } catch (error) {
    mapDynamoError(error, 'deleteItem');
  }
}

export async function updateItem<T>(params: ConstructorParameters<typeof UpdateCommand>[0]): Promise<T | null> {
  try {
    const result = await dynamoClient.send(new UpdateCommand(params));
    return (result.Attributes as T | undefined) ?? null;
  } catch (error) {
    return mapDynamoError(error, 'updateItem');
  }
}
