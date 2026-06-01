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

// src/lambda/mapping/save-version.ts
var save_version_exports = {};
__export(save_version_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(save_version_exports);

// src/lambda/shared/dynamo.ts
var import_client_dynamodb = require("@aws-sdk/client-dynamodb");
var import_lib_dynamodb = require("@aws-sdk/lib-dynamodb");

// src/lambda/shared/errors.ts
var ERROR_CODES = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  RESOURCE_NOT_FOUND: "RESOURCE_NOT_FOUND",
  CONTENT_UNAVAILABLE: "CONTENT_UNAVAILABLE",
  CONFLICT: "CONFLICT",
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
function validationError(message, requestId) {
  return {
    code: ERROR_CODES.VALIDATION_ERROR,
    message,
    statusCode: 400,
    retryable: false,
    requestId: resolveRequestId(requestId)
  };
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
async function putItem(params) {
  try {
    await dynamoClient.send(new import_lib_dynamodb.PutCommand(params));
  } catch (error) {
    mapDynamoError(error, "putItem");
  }
}
async function query(params) {
  try {
    const result = await dynamoClient.send(new import_lib_dynamodb.QueryCommand(params));
    return result.Items ?? [];
  } catch (error) {
    return mapDynamoError(error, "query");
  }
}
async function deleteItem(params) {
  try {
    await dynamoClient.send(new import_lib_dynamodb.DeleteCommand(params));
  } catch (error) {
    mapDynamoError(error, "deleteItem");
  }
}

// src/lambda/shared/request-id.ts
function generateRequestId() {
  return globalThis.crypto.randomUUID();
}

// src/lambda/shared/request.ts
function parseBody(event) {
  const body = event.body;
  if (body === null || body.trim() === "") {
    return null;
  }
  try {
    const parsed = JSON.parse(body);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
function parsePathParam(event, name) {
  const value = event.pathParameters?.[name];
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

// src/lambda/shared/validation.ts
function requireFields(body, fields) {
  if (body === null) {
    return {
      ok: false,
      error: validationError(`Missing required field: ${fields[0] ?? "body"}`)
    };
  }
  for (const field of fields) {
    const value = body[field];
    if (value === void 0 || value === null || typeof value === "string" && value.trim() === "") {
      return {
        ok: false,
        error: validationError(`Missing required field: ${field}`)
      };
    }
  }
  return { ok: true };
}

// src/lambda/mapping/save-version.ts
var MAX_VERSIONS_PER_MAPPING = 50;
function getEnvValue3(key) {
  const env = globalThis.process?.env;
  return env?.[key];
}
var MAPPING_VERSIONS_TABLE = getEnvValue3("MAPPING_VERSIONS_TABLE");
function getMappingVersionsTableOrThrow() {
  const table = MAPPING_VERSIONS_TABLE?.trim();
  if (!table) {
    throw new Error("Missing required environment variable: MAPPING_VERSIONS_TABLE");
  }
  return table;
}
function isConfigObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function parseVersion(value) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return null;
  }
  return value;
}
function parseRuleCount(value) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return null;
  }
  return value;
}
async function pruneOldestVersions(mappingId, versions) {
  if (versions.length <= MAX_VERSIONS_PER_MAPPING) {
    return;
  }
  const sortedAscending = [...versions].sort((a, b) => a.version - b.version);
  const pruneCount = sortedAscending.length - MAX_VERSIONS_PER_MAPPING;
  const toDelete = sortedAscending.slice(0, pruneCount);
  for (const entry of toDelete) {
    await deleteItem({
      TableName: getMappingVersionsTableOrThrow(),
      Key: { mappingId, version: entry.version }
    });
  }
}
async function handler(event) {
  const mappingId = parsePathParam(event, "mappingId") ?? parsePathParam(event, "id");
  if (!mappingId) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, "Missing required path parameter: mappingId", 400, false);
  }
  const body = parseBody(event);
  const required = requireFields(body, ["version", "savedAt", "savedBy", "ruleCount", "config"]);
  if (!required.ok) {
    const err = required.error;
    return errorResponse(err?.code ?? ERROR_CODES.VALIDATION_ERROR, err?.message ?? "Validation failed", err?.statusCode ?? 400, err?.retryable ?? false);
  }
  const version = parseVersion(body?.version);
  if (version === null) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, "Invalid field: version must be a non-negative integer", 400, false);
  }
  const ruleCount = parseRuleCount(body?.ruleCount);
  if (ruleCount === null) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, "Invalid field: ruleCount must be a non-negative integer", 400, false);
  }
  if (typeof body?.savedAt !== "string" || body.savedAt.trim() === "") {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, "Invalid field: savedAt must be a non-empty string", 400, false);
  }
  if (typeof body?.savedBy !== "string" || body.savedBy.trim() === "") {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, "Invalid field: savedBy must be a non-empty string", 400, false);
  }
  if (!isConfigObject(body?.config)) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, "Invalid field: config must be an object", 400, false);
  }
  try {
    const entry = {
      mappingId,
      version,
      savedAt: body.savedAt,
      savedBy: body.savedBy,
      ruleCount,
      config: body.config
    };
    await putItem({
      TableName: getMappingVersionsTableOrThrow(),
      Item: entry
    });
    const versions = await query({
      TableName: getMappingVersionsTableOrThrow(),
      KeyConditionExpression: "#mappingId = :mappingId",
      ExpressionAttributeNames: {
        "#mappingId": "mappingId"
      },
      ExpressionAttributeValues: {
        ":mappingId": mappingId
      }
    });
    await pruneOldestVersions(mappingId, versions);
    return jsonResponse(204, null);
  } catch {
    const err = internalError();
    return errorResponse(err.code, err.message, err.statusCode, err.retryable);
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
//# sourceMappingURL=save-version.js.map
