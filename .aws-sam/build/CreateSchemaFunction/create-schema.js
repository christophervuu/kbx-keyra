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

// src/lambda/schema/create-schema.ts
var create_schema_exports = {};
__export(create_schema_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(create_schema_exports);

// src/lambda/shared/dynamo.ts
var import_client_dynamodb = require("@aws-sdk/client-dynamodb");
var import_lib_dynamodb = require("@aws-sdk/lib-dynamodb");

// src/lambda/shared/errors.ts
var ERROR_CODES = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  RESOURCE_NOT_FOUND: "RESOURCE_NOT_FOUND",
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

// src/lambda/schema/create-schema.ts
var INLINE_THRESHOLD = 500;
function getEnvValue3(key) {
  const env = globalThis.process?.env;
  return env?.[key];
}
var SCHEMAS_TABLE = getEnvValue3("SCHEMAS_TABLE");
var SCHEMA_NODES_TABLE = getEnvValue3("SCHEMA_NODES_TABLE");
var CONTENT_BUCKET = getEnvValue3("CONTENT_BUCKET");
function getSchemasTableOrThrow() {
  const table = SCHEMAS_TABLE?.trim();
  if (!table) {
    throw new Error("Missing required environment variable: SCHEMAS_TABLE");
  }
  return table;
}
function getSchemaNodesTableOrThrow() {
  const table = SCHEMA_NODES_TABLE?.trim();
  if (!table) {
    throw new Error("Missing required environment variable: SCHEMA_NODES_TABLE");
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
function generateSchemaId() {
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
function asSchemaFormat(value) {
  if (value === "json-schema" || value === "xsd") {
    return value;
  }
  return null;
}
function asSchemaOrigin(value) {
  if (value === "cdm" || value === "published" || value === "local") {
    return value;
  }
  return null;
}
function asSchemaScope(value) {
  return value === "global" ? "global" : "project";
}
function asSchemaSyncStatus(value) {
  if (value === "synced" || value === "not-synced" || value === "local-changes") {
    return value;
  }
  return "synced";
}
function asSource(value) {
  if (typeof value === "object" && value !== null) {
    const source = value;
    if (source.type === "github" && typeof source.repo === "string" && typeof source.branch === "string" && typeof source.path === "string") {
      return {
        type: "github",
        repo: source.repo,
        branch: source.branch,
        path: source.path,
        ...typeof source.commitSha === "string" ? { commitSha: source.commitSha } : {}
      };
    }
  }
  return { type: "upload" };
}
function toContentString(content, format) {
  if (format === "xsd") {
    return typeof content === "string" && content.trim() !== "" ? content : null;
  }
  if (typeof content === "string") {
    try {
      const parsed = JSON.parse(content);
      return JSON.stringify(parsed);
    } catch {
      return null;
    }
  }
  if (typeof content === "object" && content !== null) {
    return JSON.stringify(content);
  }
  return null;
}
function estimateFieldCount(content, format) {
  if (format === "xsd") {
    const matches = content.match(/<\s*(xs|xsd):element\b/gi);
    return matches?.length ?? 0;
  }
  const propertyMatches = content.match(/"properties"/g);
  const itemMatches = content.match(/"items"/g);
  return (propertyMatches?.length ?? 0) + (itemMatches?.length ?? 0);
}
function childCountFromSchema(schema) {
  const properties = schema.properties;
  if (typeof properties !== "object" || properties === null) {
    return 0;
  }
  return Object.keys(properties).length;
}
function inferNodeType(schema) {
  if (typeof schema.type === "string") {
    return schema.type;
  }
  if (schema.items !== void 0) {
    return "array";
  }
  if (schema.properties !== void 0) {
    return "object";
  }
  return "any";
}
function isArraySchema(schema) {
  return schema.type === "array" || schema.items !== void 0;
}
function generateJsonSchemaNodes(schemaId, raw) {
  const root = JSON.parse(raw);
  const nodes = [];
  function visit(current, currentPath, parentPath, depth, required) {
    const properties = current.properties;
    if (typeof properties !== "object" || properties === null) {
      return;
    }
    const propertyMap = properties;
    for (const [fieldName, value] of Object.entries(propertyMap)) {
      if (typeof value !== "object" || value === null) {
        continue;
      }
      const fieldSchema = value;
      const path = currentPath ? `${currentPath}.${fieldName}` : fieldName;
      const node = {
        schemaId,
        path,
        fieldName,
        type: inferNodeType(fieldSchema),
        depth,
        ...typeof parentPath === "string" && parentPath !== "" ? { parentPath } : {},
        isArray: isArraySchema(fieldSchema),
        isRequired: required.has(fieldName),
        childCount: childCountFromSchema(fieldSchema),
        ...typeof fieldSchema.description === "string" ? { description: fieldSchema.description } : {}
      };
      nodes.push(node);
      const nextRequired = new Set(
        Array.isArray(fieldSchema.required) ? fieldSchema.required.filter((entry) => typeof entry === "string") : []
      );
      visit(fieldSchema, path, path, depth + 1, nextRequired);
      if (typeof fieldSchema.items === "object" && fieldSchema.items !== null) {
        visit(fieldSchema.items, path, path, depth + 1, /* @__PURE__ */ new Set());
      }
    }
  }
  const rootRequired = new Set(Array.isArray(root.required) ? root.required.filter((entry) => typeof entry === "string") : []);
  visit(root, "", void 0, 1, rootRequired);
  return nodes;
}
function generateXsdNodes(schemaId, raw) {
  const elementRegex = /<\s*(?:xs|xsd):element\b([^>]*)>/gi;
  const attrNameRegex = /\bname\s*=\s*"([^"]+)"/i;
  const attrTypeRegex = /\btype\s*=\s*"([^"]+)"/i;
  const nodes = [];
  let match = null;
  let fallbackIndex = 0;
  while ((match = elementRegex.exec(raw)) !== null) {
    const attrs = match[1] ?? "";
    const nameMatch = attrs.match(attrNameRegex);
    const typeMatch = attrs.match(attrTypeRegex);
    const fieldName = nameMatch?.[1] ?? `element_${++fallbackIndex}`;
    nodes.push({
      schemaId,
      path: fieldName,
      fieldName,
      type: typeMatch?.[1] ?? "any",
      depth: 1,
      isArray: false,
      isRequired: false,
      childCount: 0
    });
  }
  return nodes;
}
function contentKey(schemaId, format) {
  return `schemas/${schemaId}/content.${format === "xsd" ? "xsd" : "json"}`;
}
async function handler(event) {
  const body = parseBody(event);
  const required = requireFields(body, ["name", "format", "origin", "content"]);
  if (!required.ok) {
    const err = required.error;
    return errorResponse(err?.code ?? ERROR_CODES.VALIDATION_ERROR, err?.message ?? "Validation failed", err?.statusCode ?? 400, err?.retryable ?? false);
  }
  const format = asSchemaFormat(body?.format);
  if (!format) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, "Invalid field: format must be json-schema or xsd", 400, false);
  }
  const origin = asSchemaOrigin(body?.origin);
  if (!origin) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, "Invalid field: origin must be cdm, published, or local", 400, false);
  }
  const content = toContentString(body?.content, format);
  if (!content) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, "Invalid field: content", 400, false);
  }
  try {
    const schemaId = generateSchemaId();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const estimated = estimateFieldCount(content, format);
    const inline = estimated <= INLINE_THRESHOLD;
    const nodes = inline ? format === "json-schema" ? generateJsonSchemaNodes(schemaId, content) : generateXsdNodes(schemaId, content) : [];
    const metadata = {
      schemaId,
      name: String(body?.name ?? ""),
      format,
      fieldCount: inline ? nodes.length : 0,
      origin,
      status: inline ? "ready" : "ingesting",
      scope: asSchemaScope(body?.scope),
      ...typeof body?.description === "string" ? { description: body.description } : {},
      ...typeof body?.updatedBy === "string" ? { updatedBy: body.updatedBy } : {},
      inferred: typeof body?.inferred === "boolean" ? body.inferred : false,
      syncStatus: asSchemaSyncStatus(body?.syncStatus),
      source: asSource(body?.source),
      createdAt: now,
      updatedAt: now
    };
    await putObject({
      Bucket: getContentBucketOrThrow(),
      Key: contentKey(schemaId, format),
      Body: content,
      ContentType: format === "xsd" ? "application/xml" : "application/json"
    });
    await putItem({
      TableName: getSchemasTableOrThrow(),
      Item: metadata
    });
    if (inline) {
      for (const node of nodes) {
        await putItem({
          TableName: getSchemaNodesTableOrThrow(),
          Item: node
        });
      }
    } else {
      console.log("Schema async ingestion kickoff intended", { schemaId, estimatedFieldCount: estimated });
    }
    return jsonResponse(201, metadata);
  } catch (error) {
    if (error instanceof DynamoServiceError || error instanceof S3ServiceError) {
      const appError = error.appError;
      console.error("create-schema downstream service failure", {
        requestId: appError.requestId,
        code: appError.code,
        statusCode: appError.statusCode,
        retryable: appError.retryable,
        message: appError.message
      });
      return errorResponse(appError.code, appError.message, appError.statusCode, appError.retryable, appError.requestId);
    }
    const err = internalError();
    console.error("create-schema unexpected failure", {
      requestId: err.requestId,
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorMessage: error instanceof Error ? error.message : "Unknown error value"
    });
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, err.requestId);
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
//# sourceMappingURL=create-schema.js.map
