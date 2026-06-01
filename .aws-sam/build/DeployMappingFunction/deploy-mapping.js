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

// src/lambda/deployment/deploy-mapping.ts
var deploy_mapping_exports = {};
__export(deploy_mapping_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(deploy_mapping_exports);

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

// src/lib/persistence/deployments.ts
var import_lib_dynamodb3 = require("@aws-sdk/lib-dynamodb");

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
function deploymentSnapshotKey(mappingId, environment, deployedAt) {
  return `deployments/${mappingId}/${environment}/${deployedAt}.json`;
}
function deploymentHistorySortKey(environment, deployedAt) {
  return `${environment}#${deployedAt}`;
}
function deploymentCurrentKey(mappingId, environment) {
  return `${mappingId}#${environment}`;
}

// src/lib/persistence/s3/deployment-snapshot.ts
var import_client_s33 = require("@aws-sdk/client-s3");
async function put(mappingId, environment, deployedAt, config) {
  const key = deploymentSnapshotKey(mappingId, environment, deployedAt);
  await s3Client2.send(
    new import_client_s33.PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: JSON.stringify(config),
      ContentType: "application/json"
    })
  );
  return key;
}

// src/lib/persistence/deployments.ts
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function toDeploymentCurrentItem(item) {
  return {
    mappingIdEnvironment: deploymentCurrentKey(item.mappingId, item.environment),
    mappingId: item.mappingId,
    environment: item.environment,
    deployedAt: item.deployedAt,
    sourceType: item.sourceType,
    sourceNumber: item.sourceNumber,
    configHash: item.configHash,
    configS3Key: item.configS3Key
  };
}
async function create(input) {
  const deployedAt = nowIso();
  const configHash = await computeConfigHash(input.config);
  const configS3Key = await put(input.mappingId, input.environment, deployedAt, input.config);
  const item = {
    mappingId: input.mappingId,
    environmentDeployedAt: deploymentHistorySortKey(input.environment, deployedAt),
    environment: input.environment,
    sourceType: input.sourceType,
    sourceNumber: input.sourceNumber,
    configS3Key,
    configHash,
    deployedAt,
    deployedBy: input.deployedBy,
    ...input.promotedFrom ? { promotedFrom: input.promotedFrom } : {},
    ...input.rollbackOf ? { rollbackOf: input.rollbackOf } : {}
  };
  const currentItem = toDeploymentCurrentItem(item);
  await dynamoClient2.send(
    new import_lib_dynamodb3.PutCommand({
      TableName: TABLE_NAMES.deployments,
      Item: item
    })
  );
  await dynamoClient2.send(
    new import_lib_dynamodb3.PutCommand({
      TableName: TABLE_NAMES.deploymentCurrent,
      Item: currentItem
    })
  );
  return item;
}

// src/lib/persistence/mapping-revisions.ts
var import_client_s34 = require("@aws-sdk/client-s3");
var import_lib_dynamodb4 = require("@aws-sdk/lib-dynamodb");
async function readObjectBodyAsString(output) {
  const body = output.Body;
  if (!body) {
    return null;
  }
  if (typeof body === "string") {
    return body;
  }
  const candidate = body;
  if (typeof candidate.transformToString === "function") {
    return candidate.transformToString();
  }
  return null;
}
async function get(mappingId, revision) {
  const result = await dynamoClient2.send(
    new import_lib_dynamodb4.GetCommand({
      TableName: TABLE_NAMES.mappingRevisions,
      Key: {
        mappingId,
        revision
      }
    })
  );
  return result.Item ?? null;
}
async function getConfig(mappingId, revision) {
  const revisionItem = await get(mappingId, revision);
  if (!revisionItem) {
    return null;
  }
  try {
    const output = await s3Client2.send(
      new import_client_s34.GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: revisionItem.configS3Key
      })
    );
    const content = await readObjectBodyAsString(output);
    if (!content) {
      return null;
    }
    return JSON.parse(content);
  } catch (error) {
    const maybe = error;
    if (maybe?.name === "NoSuchKey" || maybe?.Code === "NoSuchKey") {
      return null;
    }
    throw error;
  }
}

// src/lib/persistence/mapping-versions.ts
var import_lib_dynamodb5 = require("@aws-sdk/lib-dynamodb");
async function get2(mappingId, version) {
  const result = await dynamoClient2.send(
    new import_lib_dynamodb5.GetCommand({
      TableName: TABLE_NAMES.mappingVersions,
      Key: {
        mappingId,
        version
      }
    })
  );
  return result.Item ?? null;
}
async function getConfig2(mappingId, version) {
  const versionItem = await get2(mappingId, version);
  if (!versionItem) {
    return null;
  }
  return getConfig(mappingId, versionItem.revisionNumber);
}

// src/lambda/deployment/deploy-mapping.ts
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
function isEnvironment(value) {
  return value === "DEV" || value === "QA" || value === "PROD";
}
function isSourceType(value) {
  return value === "revision" || value === "version";
}
function parseDeployRequest(body) {
  if (!body) {
    return null;
  }
  const environment = body.environment;
  const sourceType = body.sourceType;
  const sourceNumber = body.sourceNumber;
  if (!isEnvironment(environment) || !isSourceType(sourceType)) {
    return null;
  }
  if (typeof sourceNumber !== "number" || !Number.isInteger(sourceNumber) || sourceNumber <= 0) {
    return null;
  }
  return { environment, sourceType, sourceNumber };
}
function isRevisionDeployDisallowed(environment, sourceType) {
  return sourceType === "revision" && environment !== "DEV";
}
async function handler(event) {
  const mappingId = parsePathParam(event, "mappingId") ?? parsePathParam(event, "id");
  if (!mappingId) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, "Missing required path parameter: mappingId", 400, false);
  }
  const request = parseDeployRequest(parseBody(event));
  if (!request) {
    return errorResponse(
      ERROR_CODES.VALIDATION_ERROR,
      "Invalid deployment request body. Expected { environment: DEV|QA|PROD, sourceType: revision|version, sourceNumber: integer>0 }",
      400,
      false
    );
  }
  if (isRevisionDeployDisallowed(request.environment, request.sourceType)) {
    return errorResponse(
      ERROR_CODES.REVISION_NOT_DEPLOYABLE_TO_ENV,
      "Revision deployments are only allowed for DEV",
      400,
      false
    );
  }
  try {
    const mapping = await getItem({
      TableName: getMappingsTableOrThrow(),
      Key: { mappingId }
    });
    if (!mapping) {
      return errorResponse(ERROR_CODES.RESOURCE_NOT_FOUND, `Mapping with id '${mappingId}' not found`, 404, false);
    }
    if (request.sourceType === "revision") {
      const config2 = await getConfig(mappingId, request.sourceNumber);
      if (!config2) {
        return errorResponse(
          ERROR_CODES.SOURCE_NOT_FOUND,
          `Revision source not found: ${mappingId}:${request.sourceNumber}`,
          404,
          false
        );
      }
      const created2 = await create({
        mappingId,
        environment: request.environment,
        sourceType: "revision",
        sourceNumber: request.sourceNumber,
        deployedBy: "system",
        config: config2
      });
      return jsonResponse(201, created2);
    }
    const version = await get2(mappingId, request.sourceNumber);
    if (!version) {
      return errorResponse(
        ERROR_CODES.SOURCE_NOT_FOUND,
        `Version source not found: ${mappingId}:${request.sourceNumber}`,
        404,
        false
      );
    }
    const config = await getConfig2(mappingId, request.sourceNumber);
    if (!config) {
      return errorResponse(
        ERROR_CODES.SNAPSHOT_INTEGRITY_ERROR,
        `Version config snapshot unavailable: ${mappingId}:${request.sourceNumber}`,
        500,
        false
      );
    }
    const created = await create({
      mappingId,
      environment: request.environment,
      sourceType: "version",
      sourceNumber: version.version,
      deployedBy: "system",
      config
    });
    return jsonResponse(201, created);
  } catch {
    const err = internalError();
    return errorResponse(err.code, err.message, err.statusCode, err.retryable);
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
//# sourceMappingURL=deploy-mapping.js.map
