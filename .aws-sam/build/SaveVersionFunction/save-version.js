"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/lambda/mapping/save-version.ts
var save_version_exports = {};
__export(save_version_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(save_version_exports);

// src/lib/persistence/config.ts
function getEnvValue(key) {
  const env = globalThis.process?.env;
  return env?.[key];
}
function getEnvValueOrDefault(key, fallback) {
  const value = getEnvValue(key)?.trim();
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

// src/lib/persistence/clients.ts
var import_client_dynamodb = require("@aws-sdk/client-dynamodb");
var import_client_s3 = require("@aws-sdk/client-s3");
var import_lib_dynamodb = require("@aws-sdk/lib-dynamodb");
function getEnvValue2(key) {
  const env = globalThis.process?.env;
  return env?.[key];
}
function getRegion() {
  const region = getEnvValue2("AWS_REGION")?.trim();
  return region && region.length > 0 ? region : "us-east-1";
}
function toOptionalEndpoint(value) {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : void 0;
}
function buildDynamoConfig() {
  return {
    region: getRegion(),
    endpoint: toOptionalEndpoint(getEnvValue2("DYNAMODB_ENDPOINT"))
  };
}
function buildS3Config() {
  return {
    region: getRegion(),
    endpoint: toOptionalEndpoint(getEnvValue2("S3_ENDPOINT")),
    forcePathStyle: true
  };
}
var dynamoClient = import_lib_dynamodb.DynamoDBDocumentClient.from(new import_client_dynamodb.DynamoDBClient(buildDynamoConfig()));
var s3Client = new import_client_s3.S3Client(buildS3Config());

// src/lib/persistence/mappings.ts
var import_client_s32 = require("@aws-sdk/client-s3");
var import_lib_dynamodb2 = require("@aws-sdk/lib-dynamodb");

// src/lib/persistence/hash.ts
function sortObject(value) {
  if (Array.isArray(value)) {
    return value.map(sortObject);
  }
  if (value && typeof value === "object") {
    const record = value;
    const sortedKeys = Object.keys(record).sort((a, b) => a.localeCompare(b));
    const result = {};
    for (const key of sortedKeys) {
      result[key] = sortObject(record[key]);
    }
    return result;
  }
  return value;
}
function stableStringify(value) {
  return JSON.stringify(sortObject(value));
}
function toHex(bytes) {
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function digestToHex(digest) {
  return toHex(new Uint8Array(digest));
}
async function computeConfigHash(config) {
  const json = stableStringify(config);
  if (globalThis.crypto?.subtle) {
    const encoder = new TextEncoder();
    const digest = await globalThis.crypto.subtle.digest("SHA-256", encoder.encode(json));
    return digestToHex(digest);
  }
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(json).digest("hex");
}

// src/lib/persistence/deployments.ts
var import_lib_dynamodb3 = require("@aws-sdk/lib-dynamodb");

// src/lib/persistence/s3/deployment-snapshot.ts
var import_client_s33 = require("@aws-sdk/client-s3");

// src/lib/persistence/mapping-versions.ts
var import_lib_dynamodb5 = require("@aws-sdk/lib-dynamodb");

// src/lib/persistence/mapping-revisions.ts
var import_client_s34 = require("@aws-sdk/client-s3");
var import_lib_dynamodb4 = require("@aws-sdk/lib-dynamodb");

// src/lib/persistence/schema-metadata.ts
var import_lib_dynamodb6 = require("@aws-sdk/lib-dynamodb");

// src/lib/persistence/schema-nodes.ts
var import_lib_dynamodb7 = require("@aws-sdk/lib-dynamodb");

// src/lib/persistence/s3/mapping-config.ts
var import_client_s35 = require("@aws-sdk/client-s3");

// src/lib/persistence/s3/schema-content.ts
var import_client_s36 = require("@aws-sdk/client-s3");

// src/lib/persistence/projects.ts
var import_lib_dynamodb8 = require("@aws-sdk/lib-dynamodb");

// src/lambda/shared/dynamo.ts
var import_client_dynamodb2 = require("@aws-sdk/client-dynamodb");
var import_lib_dynamodb9 = require("@aws-sdk/lib-dynamodb");

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
function getEnvValue3(key) {
  const env = globalThis.process?.env;
  return env?.[key];
}
function createDynamoClient() {
  const endpoint = getEnvValue3("DYNAMODB_ENDPOINT") ?? getEnvValue3("AWS_ENDPOINT_URL_DYNAMODB");
  const base = new import_client_dynamodb2.DynamoDBClient({
    ...endpoint ? { endpoint } : {}
  });
  return import_lib_dynamodb9.DynamoDBDocumentClient.from(base);
}
var dynamoClient2 = createDynamoClient();
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
    const result = await dynamoClient2.send(new import_lib_dynamodb9.GetCommand(params));
    return result.Item ?? null;
  } catch (error) {
    return mapDynamoError(error, "getItem");
  }
}
async function putItem(params) {
  try {
    await dynamoClient2.send(new import_lib_dynamodb9.PutCommand(params));
  } catch (error) {
    mapDynamoError(error, "putItem");
  }
}
async function query(params) {
  try {
    const result = await dynamoClient2.send(new import_lib_dynamodb9.QueryCommand(params));
    return result.Items ?? [];
  } catch (error) {
    return mapDynamoError(error, "query");
  }
}
async function updateItem(params) {
  try {
    const result = await dynamoClient2.send(new import_lib_dynamodb9.UpdateCommand(params));
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
var import_client_s37 = require("@aws-sdk/client-s3");
function getEnvValue4(key) {
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
  const endpoint = getEnvValue4("S3_ENDPOINT");
  const region = getEnvValue4("AWS_REGION") ?? "us-east-1";
  return new import_client_s37.S3Client({
    region,
    ...endpoint ? {
      endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: getEnvValue4("AWS_ACCESS_KEY_ID") ?? "test",
        secretAccessKey: getEnvValue4("AWS_SECRET_ACCESS_KEY") ?? "test"
      }
    } : {}
  });
}
var s3Client2 = createS3Client();
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
    await s3Client2.send(new import_client_s37.PutObjectCommand(params));
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

// src/lambda/mapping/create-version.ts
function getEnvValue5(key) {
  const env = globalThis.process?.env;
  return env?.[key];
}
var MAPPINGS_TABLE = getEnvValue5("MAPPINGS_TABLE");
var MAPPING_REVISIONS_TABLE = getEnvValue5("MAPPING_REVISIONS_TABLE");
var MAPPING_VERSIONS_TABLE = getEnvValue5("MAPPING_VERSIONS_TABLE");
var CONTENT_BUCKET = getEnvValue5("CONTENT_BUCKET");
function getMappingsTableOrThrow() {
  const table = MAPPINGS_TABLE?.trim();
  if (!table) {
    throw new Error("Missing required environment variable: MAPPINGS_TABLE");
  }
  return table;
}
function getMappingRevisionsTableOrThrow() {
  const table = MAPPING_REVISIONS_TABLE?.trim();
  if (!table) {
    throw new Error("Missing required environment variable: MAPPING_REVISIONS_TABLE");
  }
  return table;
}
function getMappingVersionsTableOrThrow() {
  const table = MAPPING_VERSIONS_TABLE?.trim();
  if (!table) {
    throw new Error("Missing required environment variable: MAPPING_VERSIONS_TABLE");
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
function getCurrentRevision(metadata) {
  return metadata.revision ?? metadata.version;
}
function toRevisionS3Key(mappingId, revision) {
  return `mappings/${mappingId}/revisions/r${revision}.json`;
}
async function maybeImplicitSave(mappingId, body) {
  const mapping = await getItem({
    TableName: getMappingsTableOrThrow(),
    Key: { mappingId }
  });
  if (!mapping) {
    const err = notFound("Mapping", mappingId);
    throw err;
  }
  const implicitSave = body.implicitSave === true;
  if (!implicitSave) {
    return getCurrentRevision(mapping);
  }
  const required = requireFields(body, ["projectId", "name", "config", "rules"]);
  if (!required.ok) {
    const err = required.error;
    throw {
      code: err?.code ?? ERROR_CODES.VALIDATION_ERROR,
      message: err?.message ?? "Validation failed",
      statusCode: err?.statusCode ?? 400,
      retryable: err?.retryable ?? false
    };
  }
  const nextRevision = getCurrentRevision(mapping) + 1;
  const config = {
    id: mappingId,
    projectId: String(body.projectId),
    name: String(body.name),
    version: nextRevision,
    engineVersion: typeof body.engineVersion === "string" ? body.engineVersion : "1.0.0",
    sourceSchemaRef: body.sourceSchemaRef ?? void 0,
    targetSchemaRef: body.targetSchemaRef ?? void 0,
    config: body.config ?? {},
    rules: Array.isArray(body.rules) ? body.rules : []
  };
  const revisionConfigS3Key = toRevisionS3Key(mappingId, nextRevision);
  const configHash = await computeConfigHash({ ...config, version: 0 });
  const now = (/* @__PURE__ */ new Date()).toISOString();
  await putObject({
    Bucket: getContentBucketOrThrow(),
    Key: revisionConfigS3Key,
    Body: JSON.stringify(config),
    ContentType: "application/json"
  });
  await putItem({
    TableName: getMappingRevisionsTableOrThrow(),
    Item: {
      mappingId,
      revision: nextRevision,
      savedAt: now,
      savedBy: "system",
      ruleCount: config.rules.length,
      configS3Key: revisionConfigS3Key,
      configHash
    }
  });
  await updateItem({
    TableName: getMappingsTableOrThrow(),
    Key: { mappingId },
    UpdateExpression: "SET #revision = :revision, #version = :version, #updatedAt = :updatedAt, #configHash = :configHash",
    ExpressionAttributeNames: {
      "#revision": "revision",
      "#version": "version",
      "#updatedAt": "updatedAt",
      "#configHash": "configHash"
    },
    ExpressionAttributeValues: {
      ":revision": nextRevision,
      ":version": nextRevision,
      ":updatedAt": now,
      ":configHash": configHash
    },
    ReturnValues: "ALL_NEW"
  });
  return nextRevision;
}
async function handler(event) {
  const mappingId = parsePathParam(event, "mappingId") ?? parsePathParam(event, "id");
  if (!mappingId) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, "Missing required path parameter: mappingId", 400, false);
  }
  const body = parseBody(event) ?? {};
  try {
    let revisionNumber = await maybeImplicitSave(mappingId, body);
    const revisionExists = await getItem({
      TableName: getMappingRevisionsTableOrThrow(),
      Key: { mappingId, revision: revisionNumber }
    });
    if (!revisionExists) {
      const revisions = await query({
        TableName: getMappingRevisionsTableOrThrow(),
        KeyConditionExpression: "#mappingId = :mappingId",
        ExpressionAttributeNames: {
          "#mappingId": "mappingId"
        },
        ExpressionAttributeValues: {
          ":mappingId": mappingId
        },
        ScanIndexForward: false,
        Limit: 1
      });
      revisionNumber = revisions[0]?.revision ?? revisionNumber;
    }
    if (revisionNumber <= 0) {
      const err = notFound("Mapping revision", `${mappingId}:latest`);
      return errorResponse(err.code, err.message, err.statusCode, err.retryable);
    }
    const versions = await query({
      TableName: getMappingVersionsTableOrThrow(),
      KeyConditionExpression: "#mappingId = :mappingId",
      ExpressionAttributeNames: {
        "#mappingId": "mappingId"
      },
      ExpressionAttributeValues: {
        ":mappingId": mappingId
      },
      ScanIndexForward: false,
      Limit: 1
    });
    const nextVersion = (versions[0]?.version ?? 0) + 1;
    const createdAt = (/* @__PURE__ */ new Date()).toISOString();
    const item = {
      mappingId,
      version: nextVersion,
      revisionNumber,
      createdAt,
      createdBy: "system"
    };
    await putItem({
      TableName: getMappingVersionsTableOrThrow(),
      Item: item
    });
    return jsonResponse(201, item);
  } catch (error) {
    const maybe = error;
    const knownCodes = Object.values(ERROR_CODES);
    if (maybe.code && knownCodes.includes(maybe.code) && maybe.message && typeof maybe.statusCode === "number") {
      return errorResponse(maybe.code, maybe.message, maybe.statusCode, maybe.retryable ?? false);
    }
    const err = internalError();
    return errorResponse(err.code, err.message, err.statusCode, err.retryable);
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
//# sourceMappingURL=save-version.js.map
