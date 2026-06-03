"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/lambda/deployment/list-deployments.ts
var list_deployments_exports = {};
__export(list_deployments_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(list_deployments_exports);

// src/lambda/shared/dynamo.ts
var import_client_dynamodb = require("@aws-sdk/client-dynamodb");
var import_lib_dynamodb = require("@aws-sdk/lib-dynamodb");

// src/lambda/shared/errors.ts
var ERROR_CODES = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  RESOURCE_NOT_FOUND: "RESOURCE_NOT_FOUND",
  INVALID_MODEL_OUTPUT: "INVALID_MODEL_OUTPUT",
  CONTENT_UNAVAILABLE: "CONTENT_UNAVAILABLE",
  CONFLICT: "CONFLICT",
  SOURCE_NOT_FOUND: "SOURCE_NOT_FOUND",
  REVISION_NOT_DEPLOYABLE_TO_ENV: "REVISION_NOT_DEPLOYABLE_TO_ENV",
  PROMOTION_REQUIRES_VERSION: "PROMOTION_REQUIRES_VERSION",
  SNAPSHOT_INTEGRITY_ERROR: "SNAPSHOT_INTEGRITY_ERROR",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  TIMEOUT: "TIMEOUT"
};
function resolveRequestId(requestId) {
  if (typeof requestId === "string" && requestId.trim() !== "") {
    return requestId;
  }
  return globalThis.crypto.randomUUID();
}
function internalError(message = "An unexpected error occurred", requestId) {
  return {
    code: ERROR_CODES.INTERNAL_ERROR,
    message,
    statusCode: 500,
    retryable: true,
    requestId: resolveRequestId(requestId)
  };
}
function serviceUnavailable(message = "Service temporarily unavailable", requestId) {
  return {
    code: ERROR_CODES.SERVICE_UNAVAILABLE,
    message,
    statusCode: 503,
    retryable: true,
    requestId: resolveRequestId(requestId)
  };
}

// src/lambda/shared/dynamo.ts
function getEnvValue(key) {
  const env = globalThis.process?.env;
  return env?.[key];
}
function createDynamoClient() {
  const endpoint = getEnvValue("DYNAMODB_ENDPOINT") ?? getEnvValue("AWS_ENDPOINT_URL_DYNAMODB");
  const base = new import_client_dynamodb.DynamoDBClient({
    ...endpoint ? { endpoint } : {}
  });
  return import_lib_dynamodb.DynamoDBDocumentClient.from(base);
}
var dynamoClient = createDynamoClient();
var DynamoServiceError = class extends Error {
  constructor(message, appError, cause) {
    super(message);
    this.appError = appError;
    this.cause = cause;
    this.name = "DynamoServiceError";
  }
  appError;
  cause;
};
function isThrottleError(error) {
  if (!error || typeof error !== "object") {
    return false;
  }
  const typed = error;
  return typed.name === "ProvisionedThroughputExceededException" || typed.name === "ThrottlingException";
}
function mapDynamoError(error, operation) {
  if (isThrottleError(error)) {
    const mapped = serviceUnavailable(`DynamoDB throttled during ${operation}`);
    throw new DynamoServiceError(mapped.message, mapped, error);
  }
  throw error;
}
async function getItem(params) {
  try {
    const result = await dynamoClient.send(new import_lib_dynamodb.GetCommand(params));
    return result.Item ?? null;
  } catch (error) {
    return mapDynamoError(error, "getItem");
  }
}

// src/lambda/shared/request-id.ts
function generateRequestId() {
  return globalThis.crypto.randomUUID();
}

// src/lambda/shared/request.ts
function parsePathParam(event, name) {
  const value = event.pathParameters?.[name];
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }
  return value;
}
function parseQueryParam(event, name) {
  const value = event.queryStringParameters?.[name];
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }
  return value;
}

// src/lambda/shared/response.ts
var JSON_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*"
};
function jsonResponse(statusCode, body, requestId) {
  const headers = typeof requestId === "string" && requestId.trim() !== "" ? {
    ...JSON_HEADERS,
    "x-request-id": requestId
  } : JSON_HEADERS;
  return {
    statusCode,
    headers,
    body: JSON.stringify(body)
  };
}
function errorResponse(code, message, statusCode, retryable, requestId) {
  const resolvedRequestId = typeof requestId === "string" && requestId.trim() !== "" ? requestId : generateRequestId();
  const envelope = {
    error: {
      code,
      message,
      statusCode,
      retryable,
      requestId: resolvedRequestId
    }
  };
  return jsonResponse(statusCode, envelope, resolvedRequestId);
}

// src/lambda/shared/s3.ts
var import_client_s3 = require("@aws-sdk/client-s3");
function getEnvValue2(key) {
  const env = globalThis.process?.env;
  return env?.[key];
}
function createS3Client() {
  const endpoint = getEnvValue2("S3_ENDPOINT");
  const region = getEnvValue2("AWS_REGION") ?? "us-east-1";
  return new import_client_s3.S3Client({
    region,
    ...endpoint ? {
      endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: getEnvValue2("AWS_ACCESS_KEY_ID") ?? "test",
        secretAccessKey: getEnvValue2("AWS_SECRET_ACCESS_KEY") ?? "test"
      }
    } : {}
  });
}
var s3Client = createS3Client();

// src/lib/persistence/deployments.ts
var import_lib_dynamodb3 = require("@aws-sdk/lib-dynamodb");

// src/lib/persistence/clients.ts
var import_client_dynamodb2 = require("@aws-sdk/client-dynamodb");
var import_client_s32 = require("@aws-sdk/client-s3");
var import_lib_dynamodb2 = require("@aws-sdk/lib-dynamodb");
function getEnvValue3(key) {
  const env = globalThis.process?.env;
  return env?.[key];
}
function getRegion() {
  const region = getEnvValue3("AWS_REGION")?.trim();
  return region && region.length > 0 ? region : "us-east-1";
}
function toOptionalEndpoint(value) {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : void 0;
}
function buildDynamoConfig() {
  return {
    region: getRegion(),
    endpoint: toOptionalEndpoint(getEnvValue3("DYNAMODB_ENDPOINT"))
  };
}
function buildS3Config() {
  return {
    region: getRegion(),
    endpoint: toOptionalEndpoint(getEnvValue3("S3_ENDPOINT")),
    forcePathStyle: true
  };
}
var dynamoClient2 = import_lib_dynamodb2.DynamoDBDocumentClient.from(new import_client_dynamodb2.DynamoDBClient(buildDynamoConfig()));
var s3Client2 = new import_client_s32.S3Client(buildS3Config());

// src/lib/persistence/config.ts
function getEnvValue4(key) {
  const env = globalThis.process?.env;
  return env?.[key];
}
function getEnvValueOrDefault(key, fallback) {
  const value = getEnvValue4(key)?.trim();
  return value && value.length > 0 ? value : fallback;
}
var TABLE_NAMES = {
  projects: getEnvValueOrDefault("PROJECTS_TABLE", "keyra-projects"),
  mappings: getEnvValueOrDefault("MAPPINGS_TABLE", "keyra-mappings"),
  schemaMetadata: getEnvValueOrDefault("SCHEMA_METADATA_TABLE", "keyra-schema-metadata"),
  schemaNodes: getEnvValueOrDefault("SCHEMA_NODES_TABLE", "keyra-schema-nodes"),
  mappingRevisions: getEnvValueOrDefault("MAPPING_REVISIONS_TABLE", "keyra-mapping-revisions"),
  mappingVersions: getEnvValueOrDefault("MAPPING_VERSIONS_TABLE", "keyra-mapping-versions"),
  deployments: getEnvValueOrDefault("DEPLOYMENTS_TABLE", "keyra-deployments"),
  deploymentCurrent: getEnvValueOrDefault("DEPLOYMENT_CURRENT_TABLE", "keyra-deployment-current")
};
var BUCKET_NAME = getEnvValueOrDefault("STORAGE_BUCKET", "keyra-storage");

// src/lib/persistence/s3/deployment-snapshot.ts
var import_client_s33 = require("@aws-sdk/client-s3");

// src/lib/persistence/deployments.ts
async function listHistory(mappingId, environment, limit) {
  const items = [];
  let lastEvaluatedKey;
  do {
    const expressionAttributeValues = {
      ":mappingId": mappingId
    };
    let keyConditionExpression = "mappingId = :mappingId";
    if (environment) {
      keyConditionExpression += " AND begins_with(environmentDeployedAt, :environmentPrefix)";
      expressionAttributeValues[":environmentPrefix"] = `${environment}#`;
    }
    const result = await dynamoClient2.send(
      new import_lib_dynamodb3.QueryCommand({
        TableName: TABLE_NAMES.deployments,
        KeyConditionExpression: keyConditionExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        ScanIndexForward: false,
        ExclusiveStartKey: lastEvaluatedKey
      })
    );
    if (result.Items) {
      items.push(...result.Items);
    }
    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey && (limit === void 0 || items.length < limit));
  if (typeof limit === "number" && limit >= 0) {
    return items.slice(0, limit);
  }
  return items;
}

// src/lambda/deployment/list-deployments.ts
function getEnvValue5(key) {
  const env = globalThis.process?.env;
  return env?.[key];
}
function getMappingsTableOrThrow() {
  const table = getEnvValue5("MAPPINGS_TABLE")?.trim();
  if (!table) {
    throw new Error("Missing required environment variable: MAPPINGS_TABLE");
  }
  return table;
}
function parseEnvironment(value) {
  if (value === null) {
    return null;
  }
  if (value === "DEV" || value === "QA" || value === "PROD") {
    return value;
  }
  return null;
}
async function handler(event) {
  const mappingId = parsePathParam(event, "mappingId") ?? parsePathParam(event, "id");
  if (!mappingId) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, "Missing required path parameter: mappingId", 400, false);
  }
  const rawEnvironment = parseQueryParam(event, "environment");
  const environment = parseEnvironment(rawEnvironment);
  if (rawEnvironment !== null && !environment) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, "Invalid query parameter: environment", 400, false);
  }
  try {
    const mapping = await getItem({
      TableName: getMappingsTableOrThrow(),
      Key: { mappingId }
    });
    if (!mapping) {
      return errorResponse(ERROR_CODES.RESOURCE_NOT_FOUND, `Mapping with id '${mappingId}' not found`, 404, false);
    }
    const history = await listHistory(mappingId, environment ?? void 0);
    return jsonResponse(200, history);
  } catch {
    const err = internalError();
    return errorResponse(err.code, err.message, err.statusCode, err.retryable);
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
//# sourceMappingURL=list-deployments.js.map
