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

// src/lambda/project/update-project.ts
var update_project_exports = {};
__export(update_project_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(update_project_exports);

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
async function updateItem(params) {
  try {
    const result = await dynamoClient.send(new import_lib_dynamodb.UpdateCommand(params));
    return result.Attributes ?? null;
  } catch (error) {
    return mapDynamoError(error, "updateItem");
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

// src/lambda/project/update-project.ts
function getEnvValue3(key) {
  const env = globalThis.process?.env;
  return env?.[key];
}
var PROJECTS_TABLE = getEnvValue3("PROJECTS_TABLE");
function getProjectsTableOrThrow() {
  const table = PROJECTS_TABLE?.trim();
  if (!table) {
    throw new Error("Missing required environment variable: PROJECTS_TABLE");
  }
  return table;
}
function toProjectMetadata(project) {
  return {
    projectId: project.projectId,
    name: project.name,
    description: project.description,
    slug: project.slug,
    mappingCount: 0,
    schemaCount: project.schemaRefs.length,
    updatedAt: project.updatedAt
  };
}
async function handler(event) {
  const projectId = parsePathParam(event, "id");
  if (!projectId) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, "Missing required path parameter: id", 400, false);
  }
  const body = parseBody(event);
  if (body === null) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, "Invalid request body", 400, false);
  }
  try {
    const existing = await getItem({
      TableName: getProjectsTableOrThrow(),
      Key: { projectId }
    });
    if (!existing) {
      const err = notFound("Project", projectId);
      return errorResponse(err.code, err.message, err.statusCode, err.retryable);
    }
    const updated = {
      ...existing,
      ...typeof body.name === "string" ? { name: body.name } : {},
      ...typeof body.description === "string" ? { description: body.description } : {},
      ...typeof body.slug === "string" ? { slug: body.slug } : {},
      ...Array.isArray(body.schemaRefs) ? { schemaRefs: body.schemaRefs } : {},
      ...Array.isArray(body.tags) ? { tags: body.tags } : {},
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    await updateItem({
      TableName: getProjectsTableOrThrow(),
      Key: { projectId },
      UpdateExpression: "SET #name = :name, #description = :description, #slug = :slug, #schemaRefs = :schemaRefs, #tags = :tags, #updatedAt = :updatedAt",
      ExpressionAttributeNames: {
        "#name": "name",
        "#description": "description",
        "#slug": "slug",
        "#schemaRefs": "schemaRefs",
        "#tags": "tags",
        "#updatedAt": "updatedAt"
      },
      ExpressionAttributeValues: {
        ":name": updated.name,
        ":description": updated.description,
        ":slug": updated.slug,
        ":schemaRefs": updated.schemaRefs,
        ":tags": updated.tags,
        ":updatedAt": updated.updatedAt
      },
      ReturnValues: "ALL_NEW"
    });
    return jsonResponse(200, toProjectMetadata(updated));
  } catch {
    const err = internalError();
    return errorResponse(err.code, err.message, err.statusCode, err.retryable);
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
//# sourceMappingURL=update-project.js.map
