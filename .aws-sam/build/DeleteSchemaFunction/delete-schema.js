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

// src/lambda/schema/delete-schema.ts
var delete_schema_exports = {};
__export(delete_schema_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(delete_schema_exports);

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
function conflict(message, requestId) {
  return {
    code: ERROR_CODES.CONFLICT,
    message,
    statusCode: 409,
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
async function query(params) {
  try {
    const result = await dynamoClient.send(new import_lib_dynamodb.QueryCommand(params));
    return result.Items ?? [];
  } catch (error) {
    return mapDynamoError(error, "query");
  }
}
async function scan(params) {
  try {
    const result = await dynamoClient.send(new import_lib_dynamodb.ScanCommand(params));
    return result.Items ?? [];
  } catch (error) {
    return mapDynamoError(error, "scan");
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
async function deleteObject(params) {
  try {
    await s3Client.send(new import_client_s3.DeleteObjectCommand(params));
  } catch (error) {
    mapS3Error(error, "deleteObject", params.Key);
  }
}

// src/lambda/schema/delete-schema.ts
function getEnvValue3(key) {
  const env = globalThis.process?.env;
  return env?.[key];
}
var SCHEMAS_TABLE = getEnvValue3("SCHEMAS_TABLE");
var SCHEMA_NODES_TABLE = getEnvValue3("SCHEMA_NODES_TABLE");
var PROJECTS_TABLE = getEnvValue3("PROJECTS_TABLE");
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
function getProjectsTableOrThrow() {
  const table = PROJECTS_TABLE?.trim();
  if (!table) {
    throw new Error("Missing required environment variable: PROJECTS_TABLE");
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
function contentKey(schemaId, format) {
  return `schemas/${schemaId}/content.${format === "xsd" ? "xsd" : "json"}`;
}
function referencingProjectIds(projects, schemaId) {
  return projects.filter((project) => (project.schemaRefs ?? []).some((ref) => ref.schemaId === schemaId)).map((project) => project.projectId).filter((id) => typeof id === "string" && id.trim() !== "");
}
async function handler(event) {
  const schemaId = parsePathParam(event, "id");
  if (!schemaId) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, "Missing required path parameter: id", 400, false);
  }
  try {
    const schema = await getItem({
      TableName: getSchemasTableOrThrow(),
      Key: { schemaId }
    });
    if (!schema) {
      const err = notFound("Schema", schemaId);
      return errorResponse(err.code, err.message, err.statusCode, err.retryable);
    }
    const projects = await scan({
      TableName: getProjectsTableOrThrow()
    });
    const refs = referencingProjectIds(projects, schemaId);
    if (refs.length > 0) {
      const err = conflict(`Schema is referenced by projects: [${refs.join(", ")}]`);
      return errorResponse(err.code, err.message, err.statusCode, err.retryable);
    }
    const nodes = await query({
      TableName: getSchemaNodesTableOrThrow(),
      KeyConditionExpression: "#schemaId = :schemaId",
      ExpressionAttributeNames: {
        "#schemaId": "schemaId"
      },
      ExpressionAttributeValues: {
        ":schemaId": schemaId
      }
    });
    for (const node of nodes) {
      await deleteItem({
        TableName: getSchemaNodesTableOrThrow(),
        Key: { schemaId: node.schemaId, path: node.path }
      });
    }
    await deleteItem({
      TableName: getSchemasTableOrThrow(),
      Key: { schemaId }
    });
    await deleteObject({
      Bucket: getContentBucketOrThrow(),
      Key: contentKey(schemaId, schema.format)
    });
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
//# sourceMappingURL=delete-schema.js.map
