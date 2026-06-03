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

// src/lambda/mapping/duplicate-mapping.ts
var duplicate_mapping_exports = {};
__export(duplicate_mapping_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(duplicate_mapping_exports);

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
function notFound(resource, id, requestId) {
  return {
    code: ERROR_CODES.RESOURCE_NOT_FOUND,
    message: `${resource} with id '${id}' not found`,
    statusCode: 404,
    retryable: false,
    requestId: resolveRequestId(requestId)
  };
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
async function getItem(params) {
  try {
    const result = await dynamoClient.send(new import_lib_dynamodb.GetCommand(params));
    return result.Item ?? null;
  } catch (error) {
    return mapDynamoError(error, "getItem");
  }
}
async function putItem(params) {
  try {
    await dynamoClient.send(new import_lib_dynamodb.PutCommand(params));
  } catch (error) {
    mapDynamoError(error, "putItem");
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
function isNoSuchKey(error) {
  if (!error || typeof error !== "object") {
    return false;
  }
  const typed = error;
  return typed.name === "NoSuchKey" || typed.Code === "NoSuchKey" || typed.$metadata?.httpStatusCode === 404;
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
var S3ServiceError = class extends Error {
  constructor(message, appError, cause) {
    super(message);
    this.appError = appError;
    this.cause = cause;
    this.name = "S3ServiceError";
  }
  appError;
  cause;
};
function mapS3Error(error, operation, key) {
  if (isNoSuchKey(error)) {
    const mapped2 = notFound("S3 object", key ?? "unknown");
    throw new S3ServiceError(mapped2.message, mapped2, error);
  }
  const mapped = serviceUnavailable(`S3 transient failure during ${operation}`);
  throw new S3ServiceError(mapped.message, mapped, error);
}
async function putObject(params) {
  try {
    await s3Client.send(new import_client_s3.PutObjectCommand(params));
  } catch (error) {
    mapS3Error(error, "putObject", params.Key);
  }
}
async function getObject(params) {
  try {
    const result = await s3Client.send(new import_client_s3.GetObjectCommand(params));
    const body = result.Body;
    if (!body?.transformToString) {
      return "";
    }
    return await body.transformToString();
  } catch (error) {
    return mapS3Error(error, "getObject", params.Key);
  }
}

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

// src/lambda/mapping/duplicate-mapping.ts
function getEnvValue3(key) {
  const env = globalThis.process?.env;
  return env?.[key];
}
var MAPPINGS_TABLE = getEnvValue3("MAPPINGS_TABLE");
var CONTENT_BUCKET = getEnvValue3("CONTENT_BUCKET");
function getMappingsTableOrThrow() {
  const table = MAPPINGS_TABLE?.trim();
  if (!table) {
    throw new Error("Missing required environment variable: MAPPINGS_TABLE");
  }
  return table;
}
function getContentBucketOrThrow() {
  const bucket = CONTENT_BUCKET?.trim();
  if (!bucket) {
    throw new Error("Missing required environment variable: CONTENT_BUCKET");
  }
  return bucket;
}
function generateMappingId() {
  const cryptoRef = globalThis.crypto;
  if (cryptoRef && typeof cryptoRef.randomUUID === "function") {
    return cryptoRef.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === "x" ? random : random & 3 | 8;
    return value.toString(16);
  });
}
function buildConfigS3Key(mappingId) {
  return `mappings/${mappingId}/config.json`;
}
async function handler(event) {
  const mappingId = parsePathParam(event, "id");
  if (!mappingId) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, "Missing required path parameter: id", 400, false);
  }
  const body = parseBody(event);
  const required = requireFields(body, ["name"]);
  if (!required.ok) {
    const err = required.error;
    return errorResponse(err?.code ?? ERROR_CODES.VALIDATION_ERROR, err?.message ?? "Validation failed", err?.statusCode ?? 400, err?.retryable ?? false);
  }
  try {
    const existing = await getItem({
      TableName: getMappingsTableOrThrow(),
      Key: { mappingId }
    });
    if (!existing) {
      const err = notFound("Mapping", mappingId);
      return errorResponse(err.code, err.message, err.statusCode, err.retryable);
    }
    const sourceConfigContent = await getObject({
      Bucket: getContentBucketOrThrow(),
      Key: existing.configS3Key
    });
    const sourceConfig = JSON.parse(sourceConfigContent);
    const newMappingId = generateMappingId();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const newConfigS3Key = buildConfigS3Key(newMappingId);
    const duplicatedConfig = {
      ...sourceConfig,
      id: newMappingId,
      projectId: existing.projectId,
      name: String(body?.name ?? ""),
      version: 1
    };
    const duplicatedMetadata = {
      ...existing,
      mappingId: newMappingId,
      name: duplicatedConfig.name,
      version: 1,
      configS3Key: newConfigS3Key,
      createdAt: now,
      updatedAt: now
    };
    await putObject({
      Bucket: getContentBucketOrThrow(),
      Key: newConfigS3Key,
      Body: JSON.stringify(duplicatedConfig),
      ContentType: "application/json"
    });
    await putItem({
      TableName: getMappingsTableOrThrow(),
      Item: duplicatedMetadata
    });
    return jsonResponse(201, duplicatedMetadata);
  } catch {
    const err = internalError();
    return errorResponse(err.code, err.message, err.statusCode, err.retryable);
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
//# sourceMappingURL=duplicate-mapping.js.map
