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

// src/lambda/mapping/create-mapping.ts
var create_mapping_exports = {};
__export(create_mapping_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(create_mapping_exports);

// src/engine/diagnostics/codes.ts
var DIAGNOSTIC_CODES = {
  "KEYRA-E001": {
    code: "KEYRA-E001",
    severity: "error",
    messageTemplate: "Invalid syntax: {detail}"
  },
  "KEYRA-E002": {
    code: "KEYRA-E002",
    severity: "error",
    messageTemplate: "Unknown function: `{name}`"
  },
  "KEYRA-E003": {
    code: "KEYRA-E003",
    severity: "error",
    messageTemplate: "Wrong number of arguments for `{name}`: expected {expected}, got {actual}"
  },
  "KEYRA-E004": {
    code: "KEYRA-E004",
    severity: "error",
    messageTemplate: "Expression exceeds maximum nesting depth ({depth})"
  },
  "KEYRA-E005": {
    code: "KEYRA-E005",
    severity: "error",
    messageTemplate: "Type mismatch in `{function}`: expected `{expected}`, got `{actual}` for argument `{argName}`"
  },
  "KEYRA-E010": {
    code: "KEYRA-E010",
    severity: "error",
    messageTemplate: "`item()` used outside array context"
  },
  "KEYRA-E011": {
    code: "KEYRA-E011",
    severity: "error",
    messageTemplate: "Undefined constant: `{name}`"
  },
  "KEYRA-E012": {
    code: "KEYRA-E012",
    severity: "warning",
    messageTemplate: "External source not available: `{name}`"
  },
  "KEYRA-E013": {
    code: "KEYRA-E013",
    severity: "error",
    messageTemplate: "`parent()` used outside nested array context"
  },
  "KEYRA-E015": {
    code: "KEYRA-E015",
    severity: "error",
    messageTemplate: "`map()` template must be an object literal or an expression"
  },
  "KEYRA-E016": {
    code: "KEYRA-E016",
    severity: "warning",
    messageTemplate: "`filter()` produced empty array \u2014 all elements filtered out"
  },
  "KEYRA-E017": {
    code: "KEYRA-E017",
    severity: "error",
    messageTemplate: "`filter()`/`find()` condition must evaluate to a boolean"
  },
  "KEYRA-E018": {
    code: "KEYRA-E018",
    severity: "error",
    messageTemplate: "`get()` first argument must be an object, got `{type}`"
  },
  "KEYRA-E019": {
    code: "KEYRA-E019",
    severity: "warning",
    messageTemplate: "`find()` matched no elements \u2014 returning null"
  },
  "KEYRA-E020": {
    code: "KEYRA-E020",
    severity: "error",
    messageTemplate: "Unsupported cast: `{fromType}` \u2192 `{toType}`"
  },
  "KEYRA-E021": {
    code: "KEYRA-E021",
    severity: "error",
    messageTemplate: 'Unknown target type: `{targetType}`. Expected "string", "number", or "boolean"'
  },
  "KEYRA-E030": {
    code: "KEYRA-E030",
    severity: "error",
    messageTemplate: "Source path not found in schema: `{path}`"
  },
  "KEYRA-E031": {
    code: "KEYRA-E031",
    severity: "error",
    messageTemplate: "Target path not found in schema: `{path}`"
  },
  "KEYRA-E040": {
    code: "KEYRA-E040",
    severity: "error",
    messageTemplate: 'Date parse failed: value `"{value}"` does not match format `"{format}"`'
  },
  "KEYRA-E050": {
    code: "KEYRA-E050",
    severity: "error",
    messageTemplate: "Division by zero"
  },
  "KEYRA-E060": {
    code: "KEYRA-E060",
    severity: "error",
    messageTemplate: "`valueMap` mappings argument must be an object literal"
  },
  "KEYRA-W001": {
    code: "KEYRA-W001",
    severity: "warning",
    messageTemplate: "Null propagation: `{function}` received null argument `{argName}`"
  },
  "KEYRA-W002": {
    code: "KEYRA-W002",
    severity: "warning",
    messageTemplate: "Source path resolved to null at runtime: `{path}`"
  },
  "KEYRA-W003": {
    code: "KEYRA-W003",
    severity: "warning",
    messageTemplate: '`valueMap` no match for value `"{value}"` \u2014 returning fallback'
  },
  "KEYRA-W004": {
    code: "KEYRA-W004",
    severity: "warning",
    messageTemplate: "Array index out of bounds: index `{index}`, array length `{length}`"
  },
  "KEYRA-W005": {
    code: "KEYRA-W005",
    severity: "warning",
    messageTemplate: "Required target field `{path}` has no mapping rule \u2014 defaulting to null"
  },
  "KEYRA-W006": {
    code: "KEYRA-W006",
    severity: "warning",
    messageTemplate: "Duplicate target path: `{path}` is mapped by rules at indices {indices}"
  }
};

// src/engine/diagnostics/format.ts
function formatDiagnosticMessage(code, params) {
  const template = DIAGNOSTIC_CODES[code].messageTemplate;
  return template.replaceAll(/\{(\w+)\}/g, (fullMatch, paramName) => {
    return params[paramName] ?? fullMatch;
  });
}

// src/engine/dsl/resolve-path.ts
function tokenizePath(path) {
  if (path.length === 0) {
    return [];
  }
  const segments = [];
  let index = 0;
  while (index < path.length) {
    const char = path[index];
    if (char === ".") {
      return null;
    }
    if (char === "[") {
      index += 1;
      if (index >= path.length) {
        return null;
      }
      if (path[index] === "'") {
        index += 1;
        const keyStart2 = index;
        while (index < path.length && path[index] !== "'") {
          index += 1;
        }
        if (index >= path.length) {
          return null;
        }
        const key = path.slice(keyStart2, index);
        index += 1;
        if (path[index] !== "]") {
          return null;
        }
        segments.push(key);
        index += 1;
      } else {
        const numberStart = index;
        while (index < path.length && /[0-9]/.test(path[index] ?? "")) {
          index += 1;
        }
        if (numberStart === index) {
          return null;
        }
        if (path[index] !== "]") {
          return null;
        }
        const raw = path.slice(numberStart, index);
        segments.push(Number(raw));
        index += 1;
      }
      if (index < path.length && path[index] === ".") {
        index += 1;
        if (index >= path.length) {
          return null;
        }
      }
      continue;
    }
    const keyStart = index;
    while (index < path.length && path[index] !== "." && path[index] !== "[") {
      index += 1;
    }
    if (keyStart === index) {
      return null;
    }
    segments.push(path.slice(keyStart, index));
    if (index < path.length && path[index] === ".") {
      index += 1;
      if (index >= path.length) {
        return null;
      }
    }
  }
  return segments;
}
function getSegmentValue(current, segment) {
  if (current === null || current === void 0) {
    return null;
  }
  if (typeof segment === "number") {
    if (!Array.isArray(current)) {
      return null;
    }
    return current[segment];
  }
  if (typeof current !== "object") {
    return null;
  }
  return current[segment];
}
function resolvePath(obj, path) {
  if (path.length === 0) {
    return obj;
  }
  if (obj === null || obj === void 0) {
    return null;
  }
  const segments = tokenizePath(path);
  if (segments === null) {
    return null;
  }
  let current = obj;
  for (const segment of segments) {
    current = getSegmentValue(current, segment);
    if (current === null) {
      return null;
    }
  }
  return current;
}

// src/engine/functions/arrays.ts
var mapSignature = {
  parameters: [
    { name: "array", type: "array", required: true },
    { name: "templateOrExpression", type: "any", required: true }
  ],
  returnType: "array",
  handlesNull: true,
  lazyArgs: [1]
};
var filterSignature = {
  parameters: [
    { name: "array", type: "array", required: true },
    { name: "condition", type: "any", required: true }
  ],
  returnType: "array",
  handlesNull: true,
  lazyArgs: [1]
};
var findSignature = {
  parameters: [
    { name: "array", type: "array", required: true },
    { name: "condition", type: "any", required: true }
  ],
  returnType: "any",
  handlesNull: true,
  lazyArgs: [1]
};
var arraySignature = {
  parameters: [
    { name: "value", type: "any", required: true },
    { name: "rest", type: "any", required: false, variadic: true }
  ],
  returnType: "array",
  handlesNull: true
};
var mergeSignature = {
  parameters: [
    { name: "array", type: "any", required: true },
    { name: "rest", type: "any", required: false, variadic: true }
  ],
  returnType: "array",
  handlesNull: true
};
var flattenSignature = {
  parameters: [{ name: "array", type: "array", required: true }],
  returnType: "array"
};
var firstSignature = {
  parameters: [{ name: "array", type: "array", required: true }],
  returnType: "any"
};
var nthSignature = {
  parameters: [
    { name: "array", type: "array", required: true },
    { name: "index", type: "number", required: true }
  ],
  returnType: "any"
};
var joinSignature = {
  parameters: [
    { name: "array", type: "array", required: true },
    { name: "separator", type: "string", required: true }
  ],
  returnType: "string",
  handlesNull: true
};
var countSignature = {
  parameters: [{ name: "array", type: "array", required: true }],
  returnType: "number",
  handlesNull: true
};
var getSignature = {
  parameters: [
    { name: "object", type: "any", required: true },
    { name: "path", type: "string", required: true }
  ],
  returnType: "any",
  handlesNull: true
};
function isAstNode(value) {
  return typeof value === "object" && value !== null && "type" in value;
}
var mapImplementation = (args, context) => {
  const arrayValue = args[0];
  const templateNode = args[1];
  if (arrayValue === null) {
    return null;
  }
  if (!Array.isArray(arrayValue)) {
    return null;
  }
  if (!isAstNode(templateNode)) {
    context.addDiagnostic({
      code: DIAGNOSTIC_CODES["KEYRA-E015"].code,
      severity: DIAGNOSTIC_CODES["KEYRA-E015"].severity,
      message: formatDiagnosticMessage("KEYRA-E015", {}),
      location: {
        function: "map",
        argumentIndex: 1
      }
    });
    return null;
  }
  const result = [];
  for (const element of arrayValue) {
    context.pushScope(element);
    try {
      const evaluation = context.evaluate(templateNode, context);
      for (const diagnostic of evaluation.diagnostics) {
        context.addDiagnostic(diagnostic);
      }
      result.push(evaluation.value);
    } finally {
      context.popScope();
    }
  }
  return result;
};
function appendDiagnostics(context, diagnostics) {
  for (const diagnostic of diagnostics) {
    context.addDiagnostic(diagnostic);
  }
}
function emitConditionTypeDiagnostic(context, functionName) {
  context.addDiagnostic({
    code: DIAGNOSTIC_CODES["KEYRA-E017"].code,
    severity: DIAGNOSTIC_CODES["KEYRA-E017"].severity,
    message: formatDiagnosticMessage("KEYRA-E017", {}),
    location: {
      function: functionName,
      argumentIndex: 1
    }
  });
}
function getTypeName(value) {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  if (typeof value === "string") {
    return "string";
  }
  if (typeof value === "number") {
    return "number";
  }
  if (typeof value === "boolean") {
    return "boolean";
  }
  if (typeof value === "object") {
    return "object";
  }
  return typeof value;
}
var filterImplementation = (args, context) => {
  const arrayValue = args[0];
  const conditionNode = args[1];
  if (arrayValue === null) {
    return null;
  }
  if (!Array.isArray(arrayValue)) {
    return null;
  }
  if (!isAstNode(conditionNode)) {
    emitConditionTypeDiagnostic(context, "filter");
    return [];
  }
  const result = [];
  for (const element of arrayValue) {
    context.pushScope(element);
    try {
      const conditionResult = context.evaluate(conditionNode, context);
      appendDiagnostics(context, conditionResult.diagnostics);
      if (conditionResult.value === true) {
        result.push(element);
        continue;
      }
      if (conditionResult.value !== null && typeof conditionResult.value !== "boolean") {
        emitConditionTypeDiagnostic(context, "filter");
      }
    } finally {
      context.popScope();
    }
  }
  if (arrayValue.length > 0 && result.length === 0) {
    context.addDiagnostic({
      code: DIAGNOSTIC_CODES["KEYRA-E016"].code,
      severity: DIAGNOSTIC_CODES["KEYRA-E016"].severity,
      message: formatDiagnosticMessage("KEYRA-E016", {}),
      location: {
        function: "filter"
      }
    });
  }
  return result;
};
var findImplementation = (args, context) => {
  const arrayValue = args[0];
  const conditionNode = args[1];
  if (arrayValue === null) {
    return null;
  }
  if (!Array.isArray(arrayValue)) {
    return null;
  }
  if (arrayValue.length === 0) {
    return null;
  }
  if (!isAstNode(conditionNode)) {
    emitConditionTypeDiagnostic(context, "find");
    context.addDiagnostic({
      code: DIAGNOSTIC_CODES["KEYRA-E019"].code,
      severity: DIAGNOSTIC_CODES["KEYRA-E019"].severity,
      message: formatDiagnosticMessage("KEYRA-E019", {}),
      location: {
        function: "find"
      }
    });
    return null;
  }
  for (const element of arrayValue) {
    context.pushScope(element);
    try {
      const conditionResult = context.evaluate(conditionNode, context);
      appendDiagnostics(context, conditionResult.diagnostics);
      if (conditionResult.value === true) {
        return element;
      }
      if (conditionResult.value !== null && typeof conditionResult.value !== "boolean") {
        emitConditionTypeDiagnostic(context, "find");
      }
    } finally {
      context.popScope();
    }
  }
  context.addDiagnostic({
    code: DIAGNOSTIC_CODES["KEYRA-E019"].code,
    severity: DIAGNOSTIC_CODES["KEYRA-E019"].severity,
    message: formatDiagnosticMessage("KEYRA-E019", {}),
    location: {
      function: "find"
    }
  });
  return null;
};
var arrayImplementation = (args) => {
  return [...args];
};
var mergeImplementation = (args, context) => {
  const result = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === null) {
      continue;
    }
    if (!Array.isArray(arg)) {
      context.addDiagnostic({
        code: DIAGNOSTIC_CODES["KEYRA-E005"].code,
        severity: DIAGNOSTIC_CODES["KEYRA-E005"].severity,
        message: formatDiagnosticMessage("KEYRA-E005", {
          function: "merge",
          expected: "array",
          actual: getTypeName(arg),
          argName: "array"
        }),
        location: {
          function: "merge",
          argumentIndex: index
        }
      });
      continue;
    }
    result.push(...arg);
  }
  return result;
};
var flattenImplementation = (args) => {
  const input = args[0];
  const result = [];
  for (const element of input) {
    if (Array.isArray(element)) {
      result.push(...element);
      continue;
    }
    result.push(element);
  }
  return result;
};
var firstImplementation = (args) => {
  const input = args[0];
  if (input.length === 0) {
    return null;
  }
  return input[0];
};
var nthImplementation = (args, context) => {
  const input = args[0];
  const rawIndex = args[1];
  const normalizedIndex = rawIndex < 0 ? input.length + rawIndex : rawIndex;
  if (normalizedIndex < 0 || normalizedIndex >= input.length) {
    context.addDiagnostic({
      code: DIAGNOSTIC_CODES["KEYRA-W004"].code,
      severity: DIAGNOSTIC_CODES["KEYRA-W004"].severity,
      message: formatDiagnosticMessage("KEYRA-W004", {
        index: String(rawIndex),
        length: String(input.length)
      }),
      location: {
        function: "nth",
        argumentIndex: 1
      }
    });
    return null;
  }
  return input[normalizedIndex];
};
var joinImplementation = (args, context) => {
  const input = args[0];
  const separator = args[1];
  if (input === null) {
    return null;
  }
  if (!Array.isArray(input)) {
    return null;
  }
  const parts = [];
  for (let index = 0; index < input.length; index += 1) {
    const element = input[index];
    if (element === null) {
      continue;
    }
    if (typeof element !== "string") {
      context.addDiagnostic({
        code: DIAGNOSTIC_CODES["KEYRA-E005"].code,
        severity: DIAGNOSTIC_CODES["KEYRA-E005"].severity,
        message: formatDiagnosticMessage("KEYRA-E005", {
          function: "join",
          expected: "string",
          actual: getTypeName(element),
          argName: "array"
        }),
        location: {
          function: "join",
          argumentIndex: 0
        }
      });
      continue;
    }
    parts.push(element);
  }
  return parts.join(separator);
};
var countImplementation = (args) => {
  const input = args[0];
  if (input === null) {
    return 0;
  }
  if (!Array.isArray(input)) {
    return 0;
  }
  return input.length;
};
var getImplementation = (args, context) => {
  const objectValue = args[0];
  const path = args[1];
  if (objectValue === null) {
    return null;
  }
  if (typeof objectValue !== "object" || Array.isArray(objectValue)) {
    context.addDiagnostic({
      code: DIAGNOSTIC_CODES["KEYRA-E018"].code,
      severity: DIAGNOSTIC_CODES["KEYRA-E018"].severity,
      message: formatDiagnosticMessage("KEYRA-E018", {
        type: getTypeName(objectValue)
      }),
      location: {
        function: "get",
        argumentIndex: 0
      }
    });
    return null;
  }
  const resolved = resolvePath(objectValue, path);
  return resolved === void 0 ? null : resolved;
};
function registerArrayFunctions(registry) {
  registry.registerFunction("map", mapSignature, mapImplementation);
  registry.registerFunction("filter", filterSignature, filterImplementation);
  registry.registerFunction("find", findSignature, findImplementation);
  registry.registerFunction("array", arraySignature, arrayImplementation);
  registry.registerFunction("merge", mergeSignature, mergeImplementation);
  registry.registerFunction("flatten", flattenSignature, flattenImplementation);
  registry.registerFunction("first", firstSignature, firstImplementation);
  registry.registerFunction("nth", nthSignature, nthImplementation);
  registry.registerFunction("join", joinSignature, joinImplementation);
  registry.registerFunction("count", countSignature, countImplementation);
  registry.registerFunction("get", getSignature, getImplementation);
}

// src/engine/functions/conditional.ts
var ifSignature = {
  parameters: [
    { name: "condition", type: "boolean", required: true },
    { name: "then", type: "any", required: true },
    { name: "else", type: "any", required: true }
  ],
  returnType: "any",
  handlesNull: true
};
var eqSignature = {
  parameters: [
    { name: "a", type: "any", required: true },
    { name: "b", type: "any", required: true }
  ],
  returnType: "boolean",
  handlesNull: true
};
var neqSignature = {
  parameters: [
    { name: "a", type: "any", required: true },
    { name: "b", type: "any", required: true }
  ],
  returnType: "boolean",
  handlesNull: true
};
var gtSignature = {
  parameters: [
    { name: "a", type: "number", required: true },
    { name: "b", type: "number", required: true }
  ],
  returnType: "boolean"
};
var gteSignature = {
  parameters: [
    { name: "a", type: "number", required: true },
    { name: "b", type: "number", required: true }
  ],
  returnType: "boolean"
};
var ltSignature = {
  parameters: [
    { name: "a", type: "number", required: true },
    { name: "b", type: "number", required: true }
  ],
  returnType: "boolean"
};
var lteSignature = {
  parameters: [
    { name: "a", type: "number", required: true },
    { name: "b", type: "number", required: true }
  ],
  returnType: "boolean"
};
var andSignature = {
  parameters: [
    { name: "a", type: "boolean", required: true },
    { name: "b", type: "boolean", required: true }
  ],
  returnType: "boolean",
  handlesNull: true
};
var orSignature = {
  parameters: [
    { name: "a", type: "boolean", required: true },
    { name: "b", type: "boolean", required: true }
  ],
  returnType: "boolean",
  handlesNull: true
};
var notSignature = {
  parameters: [{ name: "a", type: "boolean", required: true }],
  returnType: "boolean"
};
var ifImplementation = (args) => {
  return args[0] === true ? args[1] : args[2];
};
var eqImplementation = (args) => {
  const [a, b] = args;
  if (a === null && b === null) {
    return true;
  }
  if (a === null || b === null) {
    return false;
  }
  return a === b;
};
var neqImplementation = (args) => {
  const [a, b] = args;
  if (a === null && b === null) {
    return false;
  }
  if (a === null || b === null) {
    return true;
  }
  return a !== b;
};
var gtImplementation = (args) => {
  return args[0] > args[1];
};
var gteImplementation = (args) => {
  return args[0] >= args[1];
};
var ltImplementation = (args) => {
  return args[0] < args[1];
};
var lteImplementation = (args) => {
  return args[0] <= args[1];
};
var andImplementation = (args) => {
  const [a, b] = args;
  if (a === false || b === false) {
    return false;
  }
  if (a === null || b === null) {
    return null;
  }
  return true;
};
var orImplementation = (args) => {
  const [a, b] = args;
  if (a === true || b === true) {
    return true;
  }
  if (a === null || b === null) {
    return null;
  }
  return false;
};
var notImplementation = (args) => {
  return !args[0];
};
function registerConditionalFunctions(registry) {
  registry.registerFunction("if", ifSignature, ifImplementation);
  registry.registerFunction("eq", eqSignature, eqImplementation);
  registry.registerFunction("neq", neqSignature, neqImplementation);
  registry.registerFunction("gt", gtSignature, gtImplementation);
  registry.registerFunction("gte", gteSignature, gteImplementation);
  registry.registerFunction("lt", ltSignature, ltImplementation);
  registry.registerFunction("lte", lteSignature, lteImplementation);
  registry.registerFunction("and", andSignature, andImplementation);
  registry.registerFunction("or", orSignature, orImplementation);
  registry.registerFunction("not", notSignature, notImplementation);
}

// src/engine/functions/date.ts
var TOKENS = ["YYYY", "MM", "DD", "HH", "mm", "ss"];
var SUPPORTED_FORMAT_TOKENS = [...TOKENS, "ISO8601"];
var TOKEN_WIDTHS = {
  YYYY: 4,
  MM: 2,
  DD: 2,
  HH: 2,
  mm: 2,
  ss: 2
};
var formatDateSignature = {
  parameters: [
    { name: "value", type: "string", required: true },
    { name: "inputFormat", type: "string", required: true },
    { name: "outputFormat", type: "string", required: true }
  ],
  returnType: "string"
};
var dateDiffSecondsSignature = {
  parameters: [
    { name: "start", type: "string", required: true },
    { name: "end", type: "string", required: true },
    { name: "inputFormat", type: "string", required: true }
  ],
  returnType: "number"
};
function tokenAt(format, index) {
  for (const token of TOKENS) {
    if (format.startsWith(token, index)) {
      return token;
    }
  }
  return null;
}
function parseByFormat(value, format) {
  const parsed = {};
  let formatIndex = 0;
  let valueIndex = 0;
  while (formatIndex < format.length) {
    const token = tokenAt(format, formatIndex);
    if (token !== null) {
      const width = TOKEN_WIDTHS[token];
      const part = value.slice(valueIndex, valueIndex + width);
      if (part.length !== width || /^\d+$/.test(part) === false) {
        return null;
      }
      parsed[token] = Number(part);
      formatIndex += token.length;
      valueIndex += width;
      continue;
    }
    const expectedLiteral = format[formatIndex];
    const actual = value[valueIndex];
    if (expectedLiteral !== actual) {
      return null;
    }
    formatIndex += 1;
    valueIndex += 1;
  }
  if (valueIndex !== value.length) {
    return null;
  }
  return {
    year: parsed.YYYY,
    month: parsed.MM,
    day: parsed.DD,
    hour: parsed.HH,
    minute: parsed.mm,
    second: parsed.ss
  };
}
function parseIso8601(value) {
  const isoPattern = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/;
  const match = value.match(isoPattern);
  if (match === null) {
    return null;
  }
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: match[4] === void 0 ? 0 : Number(match[4]),
    minute: match[5] === void 0 ? 0 : Number(match[5]),
    second: match[6] === void 0 ? 0 : Number(match[6])
  };
}
function pad(value, width) {
  return String(value).padStart(width, "0");
}
function withDefaults(parts) {
  return {
    year: parts.year ?? 0,
    month: parts.month ?? 1,
    day: parts.day ?? 1,
    hour: parts.hour ?? 0,
    minute: parts.minute ?? 0,
    second: parts.second ?? 0
  };
}
function formatByTokens(parts, outputFormat) {
  const resolved = withDefaults(parts);
  let result = "";
  let index = 0;
  while (index < outputFormat.length) {
    const token = tokenAt(outputFormat, index);
    if (token === null) {
      result += outputFormat[index];
      index += 1;
      continue;
    }
    if (token === "YYYY") {
      result += pad(resolved.year, 4);
    } else if (token === "MM") {
      result += pad(resolved.month, 2);
    } else if (token === "DD") {
      result += pad(resolved.day, 2);
    } else if (token === "HH") {
      result += pad(resolved.hour, 2);
    } else if (token === "mm") {
      result += pad(resolved.minute, 2);
    } else if (token === "ss") {
      result += pad(resolved.second, 2);
    }
    index += token.length;
  }
  return result;
}
function emitE040(context, value, inputFormat, fnName, argumentIndex) {
  context.addDiagnostic({
    code: DIAGNOSTIC_CODES["KEYRA-E040"].code,
    severity: DIAGNOSTIC_CODES["KEYRA-E040"].severity,
    message: formatDiagnosticMessage("KEYRA-E040", {
      value,
      format: inputFormat
    }),
    location: { function: fnName, argumentIndex }
  });
  return null;
}
function parseInputDate(value, inputFormat) {
  const inputHasIsoToken = inputFormat.includes("ISO8601");
  if (inputHasIsoToken && inputFormat !== "ISO8601") {
    return null;
  }
  return inputFormat === "ISO8601" ? parseIso8601(value) : parseByFormat(value, inputFormat);
}
function datePartsToEpochSeconds(parts) {
  const resolved = withDefaults(parts);
  const millis = Date.UTC(
    resolved.year,
    resolved.month - 1,
    resolved.day,
    resolved.hour,
    resolved.minute,
    resolved.second
  );
  return Math.floor(millis / 1e3);
}
var formatDateImplementation = (args, context) => {
  const value = args[0];
  const inputFormat = args[1];
  const outputFormat = args[2];
  if (value.length === 0) {
    return emitE040(context, value, inputFormat, "formatDate", 0);
  }
  const inputHasIsoToken = inputFormat.includes("ISO8601");
  const outputHasIsoToken = outputFormat.includes("ISO8601");
  if (inputHasIsoToken && inputFormat !== "ISO8601" || outputHasIsoToken && outputFormat !== "ISO8601") {
    return emitE040(context, value, inputFormat, "formatDate", 0);
  }
  const parsed = parseInputDate(value, inputFormat);
  if (parsed === null) {
    return emitE040(context, value, inputFormat, "formatDate", 0);
  }
  if (outputFormat === "ISO8601") {
    const resolved = withDefaults(parsed);
    return `${pad(resolved.year, 4)}-${pad(resolved.month, 2)}-${pad(resolved.day, 2)}T${pad(resolved.hour, 2)}:${pad(resolved.minute, 2)}:${pad(resolved.second, 2)}Z`;
  }
  return formatByTokens(parsed, outputFormat);
};
var dateDiffSecondsImplementation = (args, context) => {
  const start = args[0];
  const end = args[1];
  const inputFormat = args[2];
  if (start.length === 0) {
    return emitE040(context, start, inputFormat, "dateDiffSeconds", 0);
  }
  if (end.length === 0) {
    return emitE040(context, end, inputFormat, "dateDiffSeconds", 1);
  }
  const parsedStart = parseInputDate(start, inputFormat);
  if (parsedStart === null) {
    return emitE040(context, start, inputFormat, "dateDiffSeconds", 0);
  }
  const parsedEnd = parseInputDate(end, inputFormat);
  if (parsedEnd === null) {
    return emitE040(context, end, inputFormat, "dateDiffSeconds", 1);
  }
  return datePartsToEpochSeconds(parsedEnd) - datePartsToEpochSeconds(parsedStart);
};
function registerDateFunctions(registry) {
  registry.registerFunction("formatDate", formatDateSignature, formatDateImplementation);
  registry.registerFunction("dateDiffSeconds", dateDiffSecondsSignature, dateDiffSecondsImplementation);
}

// src/engine/functions/lookup.ts
var valueMapSignature = {
  parameters: [
    { name: "value", type: "any", required: true },
    { name: "mappings", type: "any", required: true },
    { name: "fallback", type: "any", required: false }
  ],
  returnType: "any",
  handlesNull: true
};
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
var valueMapImplementation = (args, context) => {
  const value = args[0];
  const mappings = args[1];
  const hasFallback = args.length >= 3;
  const fallback = hasFallback ? args[2] : null;
  if (value === null) {
    return fallback;
  }
  if (!isPlainObject(mappings)) {
    context.addDiagnostic({
      code: DIAGNOSTIC_CODES["KEYRA-E060"].code,
      severity: DIAGNOSTIC_CODES["KEYRA-E060"].severity,
      message: formatDiagnosticMessage("KEYRA-E060", {}),
      location: { function: "valueMap", argumentIndex: 1 }
    });
    return null;
  }
  const key = String(value);
  if (Object.hasOwn(mappings, key)) {
    return mappings[key];
  }
  context.addDiagnostic({
    code: DIAGNOSTIC_CODES["KEYRA-W003"].code,
    severity: DIAGNOSTIC_CODES["KEYRA-W003"].severity,
    message: formatDiagnosticMessage("KEYRA-W003", { value: key }),
    location: { function: "valueMap", argumentIndex: 0 }
  });
  return fallback;
};
function registerLookupFunctions(registry) {
  registry.registerFunction("valueMap", valueMapSignature, valueMapImplementation);
}

// src/engine/functions/math.ts
var addSignature = {
  parameters: [
    { name: "a", type: "number", required: true },
    { name: "b", type: "number", required: true }
  ],
  returnType: "number"
};
var subtractSignature = {
  parameters: [
    { name: "a", type: "number", required: true },
    { name: "b", type: "number", required: true }
  ],
  returnType: "number"
};
var multiplySignature = {
  parameters: [
    { name: "a", type: "number", required: true },
    { name: "b", type: "number", required: true }
  ],
  returnType: "number"
};
var divideSignature = {
  parameters: [
    { name: "a", type: "number", required: true },
    { name: "b", type: "number", required: true }
  ],
  returnType: "number"
};
var roundSignature = {
  parameters: [
    { name: "value", type: "number", required: true },
    { name: "decimals", type: "number", required: false }
  ],
  returnType: "number"
};
var absSignature = {
  parameters: [{ name: "value", type: "number", required: true }],
  returnType: "number"
};
var addImplementation = (args) => {
  return args[0] + args[1];
};
var subtractImplementation = (args) => {
  return args[0] - args[1];
};
var multiplyImplementation = (args) => {
  return args[0] * args[1];
};
var divideImplementation = (args, context) => {
  const a = args[0];
  const b = args[1];
  if (b === 0) {
    context.addDiagnostic({
      code: DIAGNOSTIC_CODES["KEYRA-E050"].code,
      severity: DIAGNOSTIC_CODES["KEYRA-E050"].severity,
      message: formatDiagnosticMessage("KEYRA-E050", {}),
      location: { function: "divide", argumentIndex: 1 }
    });
    return null;
  }
  return a / b;
};
var roundImplementation = (args) => {
  const value = args[0];
  const decimals = args[1] ?? 0;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};
var absImplementation = (args) => {
  return Math.abs(args[0]);
};
function registerMathFunctions(registry) {
  registry.registerFunction("add", addSignature, addImplementation);
  registry.registerFunction("subtract", subtractSignature, subtractImplementation);
  registry.registerFunction("multiply", multiplySignature, multiplyImplementation);
  registry.registerFunction("divide", divideSignature, divideImplementation);
  registry.registerFunction("round", roundSignature, roundImplementation);
  registry.registerFunction("abs", absSignature, absImplementation);
}

// src/engine/functions/null-handling.ts
var defaultSignature = {
  parameters: [
    { name: "value", type: "any", required: true },
    { name: "fallback", type: "any", required: true }
  ],
  returnType: "any",
  handlesNull: true
};
var coalesceSignature = {
  parameters: [
    { name: "value", type: "any", required: true },
    { name: "rest", type: "any", required: false, variadic: true }
  ],
  returnType: "any",
  handlesNull: true
};
var isNullSignature = {
  parameters: [{ name: "value", type: "any", required: true }],
  returnType: "boolean",
  handlesNull: true
};
var defaultImplementation = (args) => {
  return args[0] === null ? args[1] : args[0];
};
var coalesceImplementation = (args) => {
  for (const value of args) {
    if (value !== null) {
      return value;
    }
  }
  return null;
};
var isNullImplementation = (args) => {
  return args[0] === null;
};
function registerNullHandlingFunctions(registry) {
  registry.registerFunction("default", defaultSignature, defaultImplementation);
  registry.registerFunction("coalesce", coalesceSignature, coalesceImplementation);
  registry.registerFunction("isNull", isNullSignature, isNullImplementation);
}

// src/engine/functions/source-access.ts
var sourceSignature = {
  parameters: [{ name: "path", type: "string", required: true }],
  returnType: "any"
};
var itemSignature = {
  parameters: [{ name: "path", type: "string", required: true }],
  returnType: "any"
};
var parentSignature = {
  parameters: [{ name: "path", type: "string", required: true }],
  returnType: "any"
};
var constantSignature = {
  parameters: [{ name: "name", type: "string", required: true }],
  returnType: "any"
};
var externalSignature = {
  parameters: [{ name: "name", type: "string", required: true }],
  returnType: "any"
};
var staticSignature = {
  parameters: [{ name: "value", type: "any", required: true }],
  returnType: "any",
  handlesNull: true
};
var sourceImplementation = (args, context) => {
  const path = args[0];
  const resolved = resolvePath(context.sourceData, path);
  if (resolved === null || resolved === void 0) {
    context.addDiagnostic({
      code: DIAGNOSTIC_CODES["KEYRA-W002"].code,
      severity: DIAGNOSTIC_CODES["KEYRA-W002"].severity,
      message: formatDiagnosticMessage("KEYRA-W002", { path }),
      location: { function: "source", argumentIndex: 0 }
    });
    return null;
  }
  return resolved;
};
var itemImplementation = (args, context) => {
  return resolvePath(context.currentItem, args[0]);
};
var parentImplementation = (args, context) => {
  return resolvePath(context.parentItem, args[0]);
};
var constantImplementation = (args, context) => {
  const name = args[0];
  if (!Object.hasOwn(context.constants, name)) {
    context.addDiagnostic({
      code: DIAGNOSTIC_CODES["KEYRA-E011"].code,
      severity: DIAGNOSTIC_CODES["KEYRA-E011"].severity,
      message: formatDiagnosticMessage("KEYRA-E011", { name }),
      location: { function: "constant", argumentIndex: 0 }
    });
    return null;
  }
  return context.constants[name];
};
var externalImplementation = (args, context) => {
  const name = args[0];
  if (!Object.hasOwn(context.externalSources, name)) {
    context.addDiagnostic({
      code: DIAGNOSTIC_CODES["KEYRA-E012"].code,
      severity: DIAGNOSTIC_CODES["KEYRA-E012"].severity,
      message: formatDiagnosticMessage("KEYRA-E012", { name }),
      location: { function: "external", argumentIndex: 0 }
    });
    return null;
  }
  return context.externalSources[name];
};
var staticImplementation = (args) => {
  return args[0];
};
function registerSourceAccessFunctions(registry) {
  registry.registerFunction("source", sourceSignature, sourceImplementation);
  registry.registerFunction("item", itemSignature, itemImplementation);
  registry.registerFunction("parent", parentSignature, parentImplementation);
  registry.registerFunction("constant", constantSignature, constantImplementation);
  registry.registerFunction("external", externalSignature, externalImplementation);
  registry.registerFunction("static", staticSignature, staticImplementation);
}

// src/engine/functions/string.ts
var concatSignature = {
  parameters: [
    { name: "value", type: "string", required: true },
    { name: "rest", type: "string", required: false, variadic: true }
  ],
  returnType: "string"
};
var substringSignature = {
  parameters: [
    { name: "value", type: "string", required: true },
    { name: "start", type: "number", required: true },
    { name: "end", type: "number", required: false }
  ],
  returnType: "string"
};
var upperSignature = {
  parameters: [{ name: "value", type: "string", required: true }],
  returnType: "string"
};
var lowerSignature = {
  parameters: [{ name: "value", type: "string", required: true }],
  returnType: "string"
};
var trimSignature = {
  parameters: [{ name: "value", type: "string", required: true }],
  returnType: "string"
};
var replaceSignature = {
  parameters: [
    { name: "value", type: "string", required: true },
    { name: "search", type: "string", required: true },
    { name: "replacement", type: "string", required: true }
  ],
  returnType: "string"
};
var replaceAllSignature = {
  parameters: [
    { name: "value", type: "string", required: true },
    { name: "search", type: "string", required: true },
    { name: "replacement", type: "string", required: false }
  ],
  returnType: "string"
};
var containsSignature = {
  parameters: [
    { name: "haystack", type: "string", required: true },
    { name: "needle", type: "string", required: true }
  ],
  returnType: "boolean",
  handlesNull: true
};
var lengthSignature = {
  parameters: [{ name: "value", type: "string", required: true }],
  returnType: "number"
};
var splitSignature = {
  parameters: [
    { name: "value", type: "string", required: true },
    { name: "separator", type: "string", required: true }
  ],
  returnType: "array"
};
var concatImplementation = (args) => {
  return args.join("");
};
var substringImplementation = (args) => {
  const value = args[0];
  const start = args[1];
  const end = args[2];
  const resolvedStart = start < 0 ? Math.max(0, value.length + start) : start;
  if (end === void 0) {
    return value.slice(resolvedStart);
  }
  const resolvedEnd = end < 0 ? Math.max(0, value.length + end) : end;
  return value.slice(resolvedStart, resolvedEnd);
};
var upperImplementation = (args) => {
  return args[0].toUpperCase();
};
var lowerImplementation = (args) => {
  return args[0].toLowerCase();
};
var trimImplementation = (args) => {
  return args[0].trim();
};
var replaceImplementation = (args) => {
  return args[0].replace(args[1], args[2]);
};
var replaceAllImplementation = (args) => {
  return args[0].replaceAll(args[1], args[2] ?? "");
};
var containsImplementation = (args) => {
  const haystack = args[0];
  const needle = args[1];
  if (haystack === null || needle === null) {
    return false;
  }
  return haystack.includes(needle);
};
var lengthImplementation = (args) => {
  return args[0].length;
};
var splitImplementation = (args) => {
  const value = args[0];
  const separator = args[1];
  return value.split(separator);
};
function registerStringFunctions(registry) {
  registry.registerFunction("concat", concatSignature, concatImplementation);
  registry.registerFunction("substring", substringSignature, substringImplementation);
  registry.registerFunction("upper", upperSignature, upperImplementation);
  registry.registerFunction("lower", lowerSignature, lowerImplementation);
  registry.registerFunction("trim", trimSignature, trimImplementation);
  registry.registerFunction("replace", replaceSignature, replaceImplementation);
  registry.registerFunction("replaceAll", replaceAllSignature, replaceAllImplementation);
  registry.registerFunction("contains", containsSignature, containsImplementation);
  registry.registerFunction("length", lengthSignature, lengthImplementation);
  registry.registerFunction("split", splitSignature, splitImplementation);
}

// src/engine/functions/type-conversion.ts
var castSignature = {
  parameters: [
    { name: "value", type: "any", required: true },
    { name: "targetType", type: "string", required: true }
  ],
  returnType: "any",
  handlesNull: true
};
function getValueType(value) {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  if (typeof value === "string") {
    return "string";
  }
  if (typeof value === "number") {
    return "number";
  }
  if (typeof value === "boolean") {
    return "boolean";
  }
  if (typeof value === "object") {
    return "object";
  }
  return "any";
}
function isCastTargetType(value) {
  return value === "string" || value === "number" || value === "boolean";
}
function emitUnsupportedCast(context, fromType, toType) {
  context.addDiagnostic({
    code: DIAGNOSTIC_CODES["KEYRA-E020"].code,
    severity: DIAGNOSTIC_CODES["KEYRA-E020"].severity,
    message: formatDiagnosticMessage("KEYRA-E020", {
      fromType,
      toType
    }),
    location: { function: "cast" }
  });
  return null;
}
var castImplementation = (args, context) => {
  const value = args[0];
  const targetType = args[1];
  if (value === null) {
    return null;
  }
  if (!isCastTargetType(targetType)) {
    context.addDiagnostic({
      code: DIAGNOSTIC_CODES["KEYRA-E021"].code,
      severity: DIAGNOSTIC_CODES["KEYRA-E021"].severity,
      message: formatDiagnosticMessage("KEYRA-E021", {
        targetType
      }),
      location: { function: "cast", argumentIndex: 1 }
    });
    return null;
  }
  const fromType = getValueType(value);
  if (fromType === targetType) {
    return value;
  }
  if (fromType === "string") {
    const stringValue = value;
    if (targetType === "number") {
      if (stringValue.trim() === "") {
        return emitUnsupportedCast(context, fromType, targetType);
      }
      const parsed = Number(stringValue);
      if (Number.isNaN(parsed) || Number.isFinite(parsed) === false) {
        return emitUnsupportedCast(context, fromType, targetType);
      }
      return parsed;
    }
    if (targetType === "boolean") {
      if (stringValue === "true") {
        return true;
      }
      if (stringValue === "false" || stringValue === "") {
        return false;
      }
      return true;
    }
  }
  if (fromType === "number") {
    const numberValue = value;
    if (targetType === "string") {
      return String(numberValue);
    }
    if (targetType === "boolean") {
      return numberValue !== 0;
    }
  }
  if (fromType === "boolean") {
    const booleanValue = value;
    if (targetType === "string") {
      return booleanValue ? "true" : "false";
    }
    if (targetType === "number") {
      return booleanValue ? 1 : 0;
    }
  }
  return emitUnsupportedCast(context, fromType, targetType);
};
function registerTypeConversionFunctions(registry) {
  registry.registerFunction("cast", castSignature, castImplementation);
}

// src/engine/functions/index.ts
function registerAllFunctions(registry) {
  registerSourceAccessFunctions(registry);
  registerArrayFunctions(registry);
  registerTypeConversionFunctions(registry);
  registerNullHandlingFunctions(registry);
  registerConditionalFunctions(registry);
  registerLookupFunctions(registry);
  registerStringFunctions(registry);
  registerDateFunctions(registry);
  registerMathFunctions(registry);
}

// src/engine/registry/function-registry.ts
var FunctionRegistry = class {
  functions = /* @__PURE__ */ new Map();
  registerFunction(name, signature, implementation) {
    if (this.functions.has(name)) {
      throw new Error(`Function \`${name}\` is already registered`);
    }
    this.functions.set(name, {
      name,
      signature,
      implementation
    });
  }
  getFunction(name) {
    return this.functions.get(name);
  }
  hasFunction(name) {
    return this.functions.has(name);
  }
  listFunctions() {
    return Array.from(this.functions.keys());
  }
};
function createRegistry() {
  return new FunctionRegistry();
}
var defaultRegistry = createRegistry();

// src/engine/dsl/parser.ts
function parseTokens(options) {
  const parser = new TokenParser(options);
  return parser.parse();
}
var TokenParser = class {
  tokens;
  maxDepth;
  expression;
  position = 0;
  constructor(options) {
    this.tokens = options.tokens;
    this.maxDepth = options.maxDepth;
    this.expression = options.expression;
  }
  parse() {
    try {
      const ast = this.parseExpression(1);
      const current = this.currentToken();
      if (current.type !== "EOF") {
        throw this.syntaxError(`expected end of input, found ${describeToken(current)}`);
      }
      return {
        ast,
        diagnostics: []
      };
    } catch (error) {
      if (error instanceof ParserFailure) {
        return {
          ast: null,
          diagnostics: [error.diagnostic]
        };
      }
      throw error;
    }
  }
  parseExpression(depth) {
    if (depth > this.maxDepth) {
      throw this.maxDepthError();
    }
    const token = this.currentToken();
    switch (token.type) {
      case "StringLiteral":
        this.advance();
        return this.toStringLiteralNode(token);
      case "NumberLiteral":
        this.advance();
        return this.toNumberLiteralNode(token);
      case "BooleanLiteral":
        this.advance();
        return this.toBooleanLiteralNode(token);
      case "NullLiteral":
        this.advance();
        return this.toNullLiteralNode(token);
      case "Identifier":
        return this.parseFunctionCall(depth);
      case "OpenBrace":
        return this.parseObjectTemplate(depth);
      default:
        throw this.syntaxError(`expected expression, found ${describeToken(token)}`);
    }
  }
  parseFunctionCall(depth) {
    const nameToken = this.consume("Identifier");
    const openParen = this.tryConsume("OpenParen");
    if (openParen === null) {
      throw this.syntaxError(`expected '(', found ${describeToken(this.currentToken())}`);
    }
    const args = [];
    if (this.currentToken().type !== "CloseParen") {
      args.push(this.parseExpression(depth + 1));
      while (this.tryConsume("Comma") !== null) {
        if (this.currentToken().type === "CloseParen") {
          throw this.syntaxError(`unexpected token ${describeToken(this.currentToken())} after comma`);
        }
        args.push(this.parseExpression(depth + 1));
      }
    }
    const closeParen = this.tryConsume("CloseParen");
    if (closeParen === null) {
      throw this.syntaxError(`expected ')', found ${describeToken(this.currentToken())}`);
    }
    return {
      type: "FunctionCall",
      name: nameToken.value,
      arguments: args,
      start: nameToken.start,
      end: closeParen.end
    };
  }
  parseObjectTemplate(depth) {
    const openBrace = this.consume("OpenBrace");
    const properties = [];
    if (this.currentToken().type !== "CloseBrace") {
      properties.push(this.parseObjectTemplateProperty(depth));
      while (this.tryConsume("Comma") !== null) {
        if (this.currentToken().type === "CloseBrace") {
          throw this.syntaxError(`unexpected token ${describeToken(this.currentToken())} after comma`);
        }
        properties.push(this.parseObjectTemplateProperty(depth));
      }
    }
    const closeBrace = this.tryConsume("CloseBrace");
    if (closeBrace === null) {
      throw this.syntaxError(`expected '}', found ${describeToken(this.currentToken())}`);
    }
    return {
      type: "ObjectTemplate",
      properties,
      start: openBrace.start,
      end: closeBrace.end
    };
  }
  parseObjectTemplateProperty(depth) {
    const keyToken = this.currentToken();
    if (keyToken.type !== "StringLiteral") {
      throw this.syntaxError("object template keys must be strings");
    }
    this.advance();
    const colon = this.tryConsume("Colon");
    if (colon === null) {
      throw this.syntaxError(`expected ':', found ${describeToken(this.currentToken())}`);
    }
    const value = this.parseExpression(depth + 1);
    return {
      key: keyToken.value,
      value,
      start: keyToken.start,
      end: value.end
    };
  }
  consume(type) {
    const token = this.currentToken();
    if (token.type !== type) {
      throw this.syntaxError(`expected ${formatExpectedToken(type)}, found ${describeToken(token)}`);
    }
    this.advance();
    return token;
  }
  tryConsume(type) {
    const token = this.currentToken();
    if (token.type !== type) {
      return null;
    }
    this.advance();
    return token;
  }
  currentToken() {
    const current = this.tokens[this.position];
    if (current !== void 0) {
      return current;
    }
    const last = this.tokens[this.tokens.length - 1];
    if (last !== void 0) {
      return last;
    }
    return {
      type: "EOF",
      value: "",
      start: 0,
      end: 0
    };
  }
  advance() {
    if (this.position < this.tokens.length - 1) {
      this.position += 1;
    }
  }
  toStringLiteralNode(token) {
    return {
      type: "StringLiteral",
      value: token.value,
      start: token.start,
      end: token.end
    };
  }
  toNumberLiteralNode(token) {
    return {
      type: "NumberLiteral",
      value: Number(token.value),
      start: token.start,
      end: token.end
    };
  }
  toBooleanLiteralNode(token) {
    return {
      type: "BooleanLiteral",
      value: token.value === "true",
      start: token.start,
      end: token.end
    };
  }
  toNullLiteralNode(token) {
    return {
      type: "NullLiteral",
      start: token.start,
      end: token.end
    };
  }
  syntaxError(detail) {
    const diagnostic = {
      code: DIAGNOSTIC_CODES["KEYRA-E001"].code,
      severity: DIAGNOSTIC_CODES["KEYRA-E001"].severity,
      message: formatDiagnosticMessage("KEYRA-E001", { detail }),
      expression: this.expression
    };
    return new ParserFailure(diagnostic);
  }
  maxDepthError() {
    const diagnostic = {
      code: DIAGNOSTIC_CODES["KEYRA-E004"].code,
      severity: DIAGNOSTIC_CODES["KEYRA-E004"].severity,
      message: formatDiagnosticMessage("KEYRA-E004", { depth: String(this.maxDepth) }),
      expression: this.expression
    };
    return new ParserFailure(diagnostic);
  }
};
var ParserFailure = class extends Error {
  diagnostic;
  constructor(diagnostic) {
    super(diagnostic.message);
    this.diagnostic = diagnostic;
  }
};
function describeToken(token) {
  if (token.type === "EOF") {
    return "end of input";
  }
  if (token.value.length > 0) {
    return `'${token.value}'`;
  }
  return token.type;
}
function formatExpectedToken(type) {
  const printableMap = {
    StringLiteral: "string literal",
    NumberLiteral: "number literal",
    BooleanLiteral: "boolean literal",
    NullLiteral: "null literal",
    Identifier: "identifier",
    OpenParen: "'('",
    CloseParen: "')'",
    Comma: "','",
    OpenBrace: "'{'",
    CloseBrace: "'}'",
    Colon: "':'",
    EOF: "end of input"
  };
  return printableMap[type];
}

// src/engine/dsl/tokenizer.ts
var WHITESPACE = /* @__PURE__ */ new Set([" ", "	", "\n", "\r"]);
var PUNCTUATION_TOKEN_MAP = {
  "(": "OpenParen",
  ")": "CloseParen",
  ",": "Comma",
  "{": "OpenBrace",
  "}": "CloseBrace",
  ":": "Colon"
};
function tokenize(expression) {
  const tokens = [];
  const diagnostics = [];
  let position = 0;
  const pushSyntaxError = (detail) => {
    diagnostics.push({
      code: DIAGNOSTIC_CODES["KEYRA-E001"].code,
      severity: DIAGNOSTIC_CODES["KEYRA-E001"].severity,
      message: formatDiagnosticMessage("KEYRA-E001", { detail }),
      expression
    });
  };
  const peek = () => expression[position];
  const createToken = (type, value, start, end) => ({
    type,
    value,
    start,
    end
  });
  while (position < expression.length) {
    const current = peek();
    if (current === void 0) {
      break;
    }
    if (WHITESPACE.has(current)) {
      position += 1;
      continue;
    }
    const punctuationType = PUNCTUATION_TOKEN_MAP[current];
    if (punctuationType !== void 0) {
      const tokenStart = position;
      position += 1;
      tokens.push(createToken(punctuationType, current, tokenStart, position));
      continue;
    }
    if (current === '"') {
      const tokenStart = position;
      position += 1;
      let value = "";
      let terminated = false;
      while (position < expression.length) {
        const char = expression[position];
        if (char === '"') {
          terminated = true;
          position += 1;
          break;
        }
        if (char === "\\") {
          const escapedChar = expression[position + 1];
          if (escapedChar === void 0) {
            pushSyntaxError("unterminated string literal");
            position = expression.length;
            break;
          }
          if (escapedChar === '"') {
            value += '"';
          } else if (escapedChar === "\\") {
            value += "\\";
          } else if (escapedChar === "n") {
            value += "\n";
          } else if (escapedChar === "t") {
            value += "	";
          } else {
            pushSyntaxError(`invalid escape sequence \\${escapedChar}`);
            value += escapedChar;
          }
          position += 2;
          continue;
        }
        value += char;
        position += 1;
      }
      if (!terminated) {
        pushSyntaxError("unterminated string literal");
        continue;
      }
      tokens.push(createToken("StringLiteral", value, tokenStart, position));
      continue;
    }
    if (isNumberStart(current, expression[position + 1])) {
      const tokenStart = position;
      if (current === "-") {
        position += 1;
      }
      const integerStart = position;
      while (isDigit(expression[position])) {
        position += 1;
      }
      const integerPart = expression.slice(integerStart, position);
      if (!isValidIntegerPart(integerPart)) {
        pushSyntaxError(`invalid number literal '${expression.slice(tokenStart, position)}'`);
      }
      if (expression[position] === ".") {
        const dotPosition = position;
        position += 1;
        const fractionStart = position;
        while (isDigit(expression[position])) {
          position += 1;
        }
        const fractionPart = expression.slice(fractionStart, position);
        if (fractionPart.length === 0) {
          pushSyntaxError(
            `invalid number literal '${expression.slice(tokenStart, dotPosition + 1)}'`
          );
        }
      }
      const rawNumber = expression.slice(tokenStart, position);
      tokens.push(createToken("NumberLiteral", rawNumber, tokenStart, position));
      continue;
    }
    if (isLetter(current)) {
      const tokenStart = position;
      while (isLetter(expression[position])) {
        position += 1;
      }
      const value = expression.slice(tokenStart, position);
      if (value === "true" || value === "false") {
        tokens.push(createToken("BooleanLiteral", value, tokenStart, position));
      } else if (value === "null") {
        tokens.push(createToken("NullLiteral", value, tokenStart, position));
      } else {
        tokens.push(createToken("Identifier", value, tokenStart, position));
      }
      continue;
    }
    pushSyntaxError(`unexpected character '${current}'`);
    position += 1;
  }
  tokens.push(createToken("EOF", "", expression.length, expression.length));
  return {
    tokens,
    diagnostics
  };
}
function isDigit(char) {
  return char !== void 0 && char >= "0" && char <= "9";
}
function isLetter(char) {
  if (char === void 0) {
    return false;
  }
  return char >= "a" && char <= "z" || char >= "A" && char <= "Z";
}
function isNumberStart(char, next) {
  if (char === void 0) {
    return false;
  }
  if (char === "-") {
    return isDigit(next);
  }
  return isDigit(char);
}
function isValidIntegerPart(integerPart) {
  if (integerPart.length === 0) {
    return false;
  }
  if (integerPart === "0") {
    return true;
  }
  return !integerPart.startsWith("0");
}

// src/engine/dsl/index.ts
var DEFAULT_MAX_DEPTH = 32;
function parse(expression, options) {
  const tokenized = tokenize(expression);
  const parseResult = parseTokens({
    tokens: tokenized.tokens,
    maxDepth: options?.maxDepth ?? DEFAULT_MAX_DEPTH,
    expression
  });
  const diagnostics = [...tokenized.diagnostics, ...parseResult.diagnostics];
  let ast = parseResult.ast;
  if (ast !== null && options?.registry !== void 0) {
    diagnostics.push(...validateFunctionCalls(ast, options.registry, expression));
  }
  if (diagnostics.some((diagnostic) => diagnostic.code === "KEYRA-E001" || diagnostic.code === "KEYRA-E004")) {
    ast = null;
  }
  return {
    success: ast !== null,
    ast,
    diagnostics
  };
}
function validateFunctionCalls(root, registry, expression) {
  const diagnostics = [];
  const visit = (node) => {
    if (node.type === "FunctionCall") {
      validateFunctionCall(node, registry, diagnostics, expression);
      for (const argument of node.arguments) {
        visit(argument);
      }
      return;
    }
    if (node.type === "ObjectTemplate") {
      for (const property of node.properties) {
        visit(property.value);
      }
    }
  };
  visit(root);
  return diagnostics;
}
function validateFunctionCall(node, registry, diagnostics, expression) {
  const name = node.name;
  const registered = registry.getFunction(name);
  if (registered === void 0) {
    diagnostics.push({
      code: DIAGNOSTIC_CODES["KEYRA-E002"].code,
      severity: DIAGNOSTIC_CODES["KEYRA-E002"].severity,
      message: formatDiagnosticMessage("KEYRA-E002", { name }),
      expression,
      location: {
        function: name
      }
    });
    return;
  }
  const actual = node.arguments.length;
  const arity = getArityInfo(registered.signature.parameters);
  const tooFewArgs = actual < arity.min;
  const tooManyArgs = actual > arity.max;
  if (tooFewArgs || tooManyArgs) {
    diagnostics.push({
      code: DIAGNOSTIC_CODES["KEYRA-E003"].code,
      severity: DIAGNOSTIC_CODES["KEYRA-E003"].severity,
      message: formatDiagnosticMessage("KEYRA-E003", {
        name,
        expected: formatExpectedArity(arity.min, arity.max),
        actual: String(actual)
      }),
      expression,
      location: {
        function: name
      }
    });
  }
}
function getArityInfo(parameters) {
  const min = parameters.filter(
    (parameter) => parameter.required && parameter.variadic !== true
  ).length;
  const hasVariadic = parameters.some((parameter) => parameter.variadic === true);
  const max = hasVariadic ? Number.POSITIVE_INFINITY : parameters.length;
  return { min, max };
}
function formatExpectedArity(min, max) {
  if (max === Number.POSITIVE_INFINITY) {
    return `${min}+`;
  }
  if (min === max) {
    return String(min);
  }
  return `${min}-${max}`;
}

// src/engine/validate/schema-tree.ts
var schemaTreeCache = /* @__PURE__ */ new WeakMap();
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
function mapJsonSchemaType(raw) {
  if (Array.isArray(raw)) {
    const first = raw.find((entry) => entry !== "null");
    return mapJsonSchemaType(first);
  }
  switch (raw) {
    case "string":
      return "string";
    case "number":
    case "integer":
      return "number";
    case "boolean":
      return "boolean";
    case "null":
      return "null";
    case "array":
      return "array";
    case "object":
      return "object";
    default:
      return "any";
  }
}
function decodePointerToken(token) {
  return token.replaceAll("~1", "/").replaceAll("~0", "~");
}
function resolveLocalRef(rootSchema, ref) {
  if (!ref.startsWith("#/")) {
    return void 0;
  }
  const tokens = ref.slice(2).split("/").map((token) => decodePointerToken(token));
  let current = rootSchema;
  for (const token of tokens) {
    if (!isRecord(current)) {
      return void 0;
    }
    current = current[token];
  }
  return current;
}
function mergeChildMaps(left, right) {
  const merged = { ...left };
  for (const [key, rightNode] of Object.entries(right)) {
    const leftNode = merged[key];
    if (!leftNode) {
      merged[key] = rightNode;
      continue;
    }
    merged[key] = {
      type: rightNode.type === "any" ? leftNode.type : rightNode.type,
      required: leftNode.required || rightNode.required,
      children: mergeChildMaps(leftNode.children, rightNode.children),
      item: rightNode.item ?? leftNode.item
    };
  }
  return merged;
}
function buildNode(schema, context) {
  if (!isRecord(schema)) {
    return {
      type: "any",
      required: context.required,
      children: {}
    };
  }
  const ref = typeof schema.$ref === "string" ? schema.$ref : void 0;
  if (ref) {
    if (context.seenRefs.has(ref)) {
      return {
        type: "any",
        required: context.required,
        children: {}
      };
    }
    context.seenRefs.add(ref);
    const resolved = resolveLocalRef(context.rootSchema, ref);
    const node = buildNode(resolved, context);
    context.seenRefs.delete(ref);
    return {
      ...node,
      required: context.required
    };
  }
  const directType = mapJsonSchemaType(schema.type);
  const nodeType = directType === "any" && isRecord(schema.properties) ? "object" : directType;
  let children = {};
  if (isRecord(schema.properties)) {
    const requiredSet = new Set(
      Array.isArray(schema.required) ? schema.required.filter((value) => typeof value === "string") : []
    );
    const map = {};
    for (const [key, childSchema] of Object.entries(schema.properties)) {
      map[key] = buildNode(childSchema, {
        ...context,
        required: requiredSet.has(key)
      });
    }
    children = map;
  }
  let item;
  if (nodeType === "array") {
    item = buildNode(schema.items, {
      ...context,
      required: false
    });
  }
  if (Array.isArray(schema.allOf) && schema.allOf.length > 0) {
    for (const part of schema.allOf) {
      const partNode = buildNode(part, {
        ...context,
        required: context.required
      });
      children = mergeChildMaps(children, partNode.children);
      item = item ?? partNode.item;
    }
  }
  return {
    type: nodeType,
    required: context.required,
    children,
    item
  };
}
function tokenizePath2(path) {
  if (path.length === 0) {
    return [];
  }
  const segments = [];
  let index = 0;
  while (index < path.length) {
    const char = path[index];
    if (char === ".") {
      return null;
    }
    if (char === "[") {
      index += 1;
      if (index >= path.length) {
        return null;
      }
      if (path[index] === "'") {
        index += 1;
        const keyStart = index;
        while (index < path.length && path[index] !== "'") {
          index += 1;
        }
        if (index >= path.length) {
          return null;
        }
        const key = path.slice(keyStart, index);
        index += 1;
        if (path[index] !== "]") {
          return null;
        }
        segments.push(key);
        index += 1;
      } else {
        const numberStart = index;
        while (index < path.length && /[0-9]/.test(path[index] ?? "")) {
          index += 1;
        }
        if (numberStart === index || path[index] !== "]") {
          return null;
        }
        const raw = path.slice(numberStart, index);
        segments.push(Number(raw));
        index += 1;
      }
      if (index < path.length && path[index] === ".") {
        index += 1;
        if (index >= path.length) {
          return null;
        }
      }
      continue;
    }
    const start = index;
    while (index < path.length && path[index] !== "." && path[index] !== "[") {
      index += 1;
    }
    if (start === index) {
      return null;
    }
    segments.push(path.slice(start, index));
    if (index < path.length && path[index] === ".") {
      index += 1;
      if (index >= path.length) {
        return null;
      }
    }
  }
  return segments;
}
function descendForSegment(node, segment) {
  if (typeof segment === "number") {
    return node.type === "array" ? node.item : void 0;
  }
  if (node.children[segment]) {
    return node.children[segment];
  }
  if (node.type === "array" && node.item) {
    return descendForSegment(node.item, segment);
  }
  return void 0;
}
function resolveNodeAtPath(root, path) {
  const segments = tokenizePath2(path);
  if (segments === null) {
    return void 0;
  }
  let current = root;
  for (const segment of segments) {
    if (!current) {
      return void 0;
    }
    current = descendForSegment(current, segment);
  }
  return current;
}
function hasObjectishArrayItem(node) {
  if (!node.item) {
    return false;
  }
  if (Object.keys(node.item.children).length > 0) {
    return true;
  }
  return node.item.type === "object";
}
function collectRequiredLeafPaths(node, path, output, parentRequired) {
  const isRequired = parentRequired && node.required;
  if (node.type === "array") {
    if (hasObjectishArrayItem(node)) {
      if (node.item) {
        const childEntries = Object.entries(node.item.children);
        for (const [childKey, childNode] of childEntries) {
          const childPath = path.length === 0 ? childKey : `${path}.${childKey}`;
          collectRequiredLeafPaths(childNode, childPath, output, isRequired);
        }
      }
      return;
    }
    if (isRequired && path.length > 0) {
      output.push(path);
    }
    return;
  }
  const children = Object.entries(node.children);
  if (children.length === 0) {
    if (isRequired && path.length > 0) {
      output.push(path);
    }
    return;
  }
  for (const [key, child] of children) {
    const childPath = path.length === 0 ? key : `${path}.${key}`;
    collectRequiredLeafPaths(child, childPath, output, isRequired);
  }
}
var SchemaTreeImpl = class {
  constructor(rootNode, diagnostics = []) {
    this.rootNode = rootNode;
    this.diagnostics = diagnostics;
  }
  rootNode;
  diagnostics;
  hasPath(path) {
    if (path.length === 0) {
      return true;
    }
    return resolveNodeAtPath(this.rootNode, path) !== void 0;
  }
  getTypeAtPath(path) {
    if (path.length === 0) {
      return this.rootNode.type;
    }
    return resolveNodeAtPath(this.rootNode, path)?.type;
  }
  getRequiredLeafPaths() {
    const paths = [];
    collectRequiredLeafPaths(this.rootNode, "", paths, true);
    return paths;
  }
  isArrayPath(path) {
    if (path.length === 0) {
      return this.rootNode.type === "array";
    }
    return resolveNodeAtPath(this.rootNode, path)?.type === "array";
  }
};
function createPermissiveXsdTree() {
  const infoDiagnostic = {
    code: "KEYRA-I001",
    severity: "info",
    message: "XSD schema support is not yet implemented \u2014 schema-dependent validation checks are skipped"
  };
  return {
    diagnostics: [infoDiagnostic],
    hasPath: () => true,
    getTypeAtPath: () => void 0,
    getRequiredLeafPaths: () => [],
    isArrayPath: () => false
  };
}
function buildJsonSchemaTree(schema) {
  const rootNode = buildNode(schema, {
    rootSchema: schema,
    required: true,
    seenRefs: /* @__PURE__ */ new Set()
  });
  return new SchemaTreeImpl(rootNode, []);
}
function buildSchemaTree(schema, format = "json-schema") {
  if (format === "xsd") {
    return createPermissiveXsdTree();
  }
  return buildJsonSchemaTree(schema);
}
function getOrBuildSchemaTree(schema, format = "json-schema") {
  if (!isRecord(schema)) {
    return buildSchemaTree(schema, format);
  }
  const cached = schemaTreeCache.get(schema);
  if (cached) {
    return cached;
  }
  const tree = buildSchemaTree(schema, format);
  schemaTreeCache.set(schema, tree);
  return tree;
}

// src/engine/validate/ast-utils.ts
function walkAst(node, visitor) {
  visitor(node);
  if (node.type === "FunctionCall") {
    for (const argument of node.arguments) {
      walkAst(argument, visitor);
    }
    return;
  }
  if (node.type === "ObjectTemplate") {
    for (const property of node.properties) {
      walkAst(property.value, visitor);
    }
  }
}
function findFunctionCalls(node, functionName) {
  const matches = [];
  walkAst(node, (current) => {
    if (current.type === "FunctionCall" && current.name === functionName) {
      matches.push(current);
    }
  });
  return matches;
}

// src/engine/validate/source-paths.ts
function validateSourcePaths(parsedRules, sourceSchemaTree) {
  const diagnostics = [];
  for (const parsedRule of parsedRules) {
    if (parsedRule.ast === null) {
      continue;
    }
    const sourceCalls = findFunctionCalls(parsedRule.ast, "source");
    for (const sourceCall of sourceCalls) {
      const firstArgument = sourceCall.arguments[0];
      if (!firstArgument || firstArgument.type !== "StringLiteral") {
        continue;
      }
      const sourcePath = firstArgument.value;
      if (sourcePath === "") {
        continue;
      }
      if (sourceSchemaTree.hasPath(sourcePath)) {
        continue;
      }
      diagnostics.push({
        code: "KEYRA-E030",
        severity: "error",
        message: formatDiagnosticMessage("KEYRA-E030", { path: sourcePath }),
        ruleIndex: parsedRule.ruleIndex,
        targetPath: parsedRule.rule.target,
        expression: parsedRule.rule.expression,
        location: {
          function: "source"
        }
      });
    }
  }
  return diagnostics;
}

// src/engine/validate/target-paths.ts
function validateTargetPaths(rules, targetSchemaTree) {
  const diagnostics = [];
  for (const [ruleIndex, rule] of rules.entries()) {
    if (targetSchemaTree.hasPath(rule.target)) {
      continue;
    }
    diagnostics.push({
      code: "KEYRA-E031",
      severity: "error",
      message: formatDiagnosticMessage("KEYRA-E031", { path: rule.target }),
      ruleIndex,
      targetPath: rule.target,
      expression: rule.expression,
      location: {
        function: "target"
      }
    });
  }
  return diagnostics;
}
function detectDuplicateTargets(rules) {
  const diagnostics = [];
  const targetRuleIndexes = /* @__PURE__ */ new Map();
  for (const [ruleIndex, rule] of rules.entries()) {
    const indexes = targetRuleIndexes.get(rule.target) ?? [];
    indexes.push(ruleIndex);
    targetRuleIndexes.set(rule.target, indexes);
  }
  for (const [targetPath, indexes] of targetRuleIndexes.entries()) {
    if (indexes.length < 2) {
      continue;
    }
    const indexList = indexes.join(", ");
    for (let i = 1; i < indexes.length; i += 1) {
      const duplicateRuleIndex = indexes[i];
      if (duplicateRuleIndex === void 0) {
        continue;
      }
      const duplicateRule = rules[duplicateRuleIndex];
      if (!duplicateRule) {
        continue;
      }
      diagnostics.push({
        code: "KEYRA-W006",
        severity: "warning",
        message: formatDiagnosticMessage("KEYRA-W006", {
          path: targetPath,
          indices: indexList
        }),
        ruleIndex: duplicateRuleIndex,
        targetPath,
        expression: duplicateRule.expression,
        location: {
          function: "target"
        }
      });
    }
  }
  return diagnostics;
}

// src/engine/validate/type-inference.ts
var TYPE_LITERALS = [
  "string",
  "number",
  "boolean",
  "null",
  "array",
  "object",
  "any"
];
function isValueType(value) {
  return TYPE_LITERALS.includes(value);
}
function inferType(node, context) {
  switch (node.type) {
    case "StringLiteral":
      return "string";
    case "NumberLiteral":
      return "number";
    case "BooleanLiteral":
      return "boolean";
    case "NullLiteral":
      return "null";
    case "ObjectTemplate":
      return "object";
    case "FunctionCall":
      return inferFunctionCallType(node, context);
    default:
      return void 0;
  }
}
function inferFunctionCallType(node, context) {
  switch (node.name) {
    case "source": {
      const pathArgument = node.arguments[0];
      if (!pathArgument || pathArgument.type !== "StringLiteral") {
        return "any";
      }
      return context.sourceSchema.getTypeAtPath(pathArgument.value) ?? "any";
    }
    case "cast": {
      const targetTypeArgument = node.arguments[1];
      if (!targetTypeArgument || targetTypeArgument.type !== "StringLiteral") {
        return void 0;
      }
      return isValueType(targetTypeArgument.value) ? targetTypeArgument.value : void 0;
    }
    case "map":
    case "filter":
      return "array";
    case "find": {
      const arrayArgument = node.arguments[0];
      if (!arrayArgument) {
        return "any";
      }
      inferType(arrayArgument, context);
      return "any";
    }
    case "if": {
      const thenArgument = node.arguments[1];
      const elseArgument = node.arguments[2];
      if (!thenArgument || !elseArgument) {
        return void 0;
      }
      const thenType = inferType(thenArgument, context);
      const elseType = inferType(elseArgument, context);
      if (!thenType || !elseType) {
        return void 0;
      }
      return thenType === elseType ? thenType : "any";
    }
    case "static": {
      const valueArgument = node.arguments[0];
      if (!valueArgument) {
        return void 0;
      }
      return inferType(valueArgument, context);
    }
    case "item": {
      if (context.arrayDepth < 1) {
        return "any";
      }
      const pathArgument = node.arguments[0];
      if (!pathArgument || pathArgument.type !== "StringLiteral") {
        return "any";
      }
      const scopedPath = context.currentItemPath ? pathArgument.value.length === 0 ? context.currentItemPath : `${context.currentItemPath}.${pathArgument.value}` : pathArgument.value;
      return context.sourceSchema.getTypeAtPath(scopedPath) ?? "any";
    }
    case "parent": {
      if (context.arrayDepth < 2) {
        return "any";
      }
      const pathArgument = node.arguments[0];
      if (!pathArgument || pathArgument.type !== "StringLiteral") {
        return "any";
      }
      const scopedPath = context.parentItemPath ? pathArgument.value.length === 0 ? context.parentItemPath : `${context.parentItemPath}.${pathArgument.value}` : pathArgument.value;
      return context.sourceSchema.getTypeAtPath(scopedPath) ?? "any";
    }
    default:
      break;
  }
  const registered = context.registry.getFunction(node.name);
  if (!registered) {
    return void 0;
  }
  if (registered.signature.returnType === "any") {
    return void 0;
  }
  return registered.signature.returnType;
}

// src/engine/validate/type-compatibility.ts
function isTypeKnown(type) {
  return type !== void 0 && type !== "any";
}
function areTypesCompatible(actual, expected) {
  if (actual === "null") {
    return true;
  }
  if (actual === expected) {
    return true;
  }
  return false;
}
function mapRuleTypeToValueType(ruleType) {
  return ruleType;
}
function validateTypeCompatibility(parsedRules, sourceSchema, targetSchema, registry) {
  const diagnostics = [];
  for (const parsedRule of parsedRules) {
    if (parsedRule.ast === null) {
      continue;
    }
    const expectedTargetType = targetSchema.getTypeAtPath(parsedRule.rule.target);
    if (!isTypeKnown(expectedTargetType)) {
      continue;
    }
    const inferredExpressionType = inferType(parsedRule.ast, {
      registry,
      sourceSchema,
      arrayDepth: 0
    });
    const actualType = isTypeKnown(inferredExpressionType) ? inferredExpressionType : mapRuleTypeToValueType(parsedRule.rule.type);
    if (!isTypeKnown(actualType)) {
      continue;
    }
    if (areTypesCompatible(actualType, expectedTargetType)) {
      continue;
    }
    diagnostics.push({
      code: "KEYRA-E005",
      severity: "error",
      message: `Type mismatch: rule produces \`${actualType}\`, target field \`${parsedRule.rule.target}\` expects \`${expectedTargetType}\``,
      ruleIndex: parsedRule.ruleIndex,
      targetPath: parsedRule.rule.target,
      expression: parsedRule.rule.expression,
      location: {
        function: "validateTypeCompatibility"
      }
    });
  }
  return diagnostics;
}

// src/engine/validate/array-context.ts
function getScopedItemPathFromArrayArgument(arrayArgument, fallbackPath) {
  if (!arrayArgument || arrayArgument.type !== "FunctionCall") {
    return fallbackPath;
  }
  if (arrayArgument.name === "source" || arrayArgument.name === "item" || arrayArgument.name === "parent") {
    const firstArg = arrayArgument.arguments[0];
    if (firstArg && firstArg.type === "StringLiteral" && firstArg.value.length > 0) {
      return firstArg.value;
    }
  }
  return fallbackPath;
}
function createRuleDiagnostic(code, parsedRule, functionName) {
  const message = code === "KEYRA-E017" ? formatDiagnosticMessage("KEYRA-E017", {}) : formatDiagnosticMessage(code, {});
  return {
    code,
    severity: "error",
    message,
    ruleIndex: parsedRule.ruleIndex,
    targetPath: parsedRule.rule.target,
    expression: parsedRule.rule.expression,
    location: {
      function: functionName
    }
  };
}
function walkNode(node, parsedRule, walkContext, sourceSchema, registry, diagnostics) {
  if (node.type === "ObjectTemplate") {
    for (const property of node.properties) {
      walkNode(property.value, parsedRule, walkContext, sourceSchema, registry, diagnostics);
    }
    return;
  }
  if (node.type !== "FunctionCall") {
    return;
  }
  if (node.name === "item" && walkContext.arrayDepth < 1) {
    diagnostics.push(createRuleDiagnostic("KEYRA-E010", parsedRule, "item"));
  }
  if (node.name === "parent" && walkContext.arrayDepth < 2) {
    diagnostics.push(createRuleDiagnostic("KEYRA-E013", parsedRule, "parent"));
  }
  if (node.name === "map" || node.name === "filter" || node.name === "find") {
    const firstArg = node.arguments[0];
    const secondArg = node.arguments[1];
    if (firstArg) {
      walkNode(firstArg, parsedRule, walkContext, sourceSchema, registry, diagnostics);
    }
    if (secondArg) {
      const scopedItemPath = getScopedItemPathFromArrayArgument(firstArg, walkContext.currentItemPath);
      const childContext = {
        arrayDepth: walkContext.arrayDepth + 1,
        currentItemPath: scopedItemPath,
        parentItemPath: walkContext.currentItemPath
      };
      walkNode(secondArg, parsedRule, childContext, sourceSchema, registry, diagnostics);
      if (node.name === "filter" || node.name === "find") {
        const inferredConditionType = inferType(secondArg, {
          registry,
          sourceSchema,
          arrayDepth: childContext.arrayDepth,
          currentItemPath: childContext.currentItemPath,
          parentItemPath: childContext.parentItemPath
        });
        if (inferredConditionType !== void 0 && inferredConditionType !== "any" && inferredConditionType !== "boolean") {
          diagnostics.push(createRuleDiagnostic("KEYRA-E017", parsedRule, node.name));
        }
      }
    }
    return;
  }
  for (const argument of node.arguments) {
    walkNode(argument, parsedRule, walkContext, sourceSchema, registry, diagnostics);
  }
}
function validateArrayContext(parsedRules, registry, sourceSchema) {
  const diagnostics = [];
  for (const parsedRule of parsedRules) {
    if (parsedRule.ast === null) {
      continue;
    }
    walkNode(
      parsedRule.ast,
      parsedRule,
      { arrayDepth: 0 },
      sourceSchema,
      registry,
      diagnostics
    );
  }
  return diagnostics;
}

// src/engine/validate/constants-externals.ts
function hasConstant(constants, name) {
  return Object.hasOwn(constants, name);
}
function validateConstantsAndExternals(parsedRules, config) {
  const diagnostics = [];
  const declaredExternalSources = new Set(config.externalSources);
  for (const parsedRule of parsedRules) {
    if (parsedRule.ast === null) {
      continue;
    }
    const constantCalls = findFunctionCalls(parsedRule.ast, "constant");
    for (const call of constantCalls) {
      const argument = call.arguments[0];
      if (!argument || argument.type !== "StringLiteral") {
        continue;
      }
      const constantName = argument.value;
      if (hasConstant(config.constants, constantName)) {
        continue;
      }
      diagnostics.push({
        code: "KEYRA-E011",
        severity: "error",
        message: formatDiagnosticMessage("KEYRA-E011", { name: constantName }),
        ruleIndex: parsedRule.ruleIndex,
        targetPath: parsedRule.rule.target,
        expression: parsedRule.rule.expression,
        location: {
          function: "constant"
        }
      });
    }
    const externalCalls = findFunctionCalls(parsedRule.ast, "external");
    for (const call of externalCalls) {
      const argument = call.arguments[0];
      if (!argument || argument.type !== "StringLiteral") {
        continue;
      }
      const externalName = argument.value;
      if (declaredExternalSources.has(externalName)) {
        continue;
      }
      diagnostics.push({
        code: "KEYRA-E012",
        severity: "warning",
        message: formatDiagnosticMessage("KEYRA-E012", { name: externalName }),
        ruleIndex: parsedRule.ruleIndex,
        targetPath: parsedRule.rule.target,
        expression: parsedRule.rule.expression,
        location: {
          function: "external"
        }
      });
    }
  }
  return diagnostics;
}

// src/engine/validate/coverage.ts
function computeCoverage(rules, targetSchema) {
  const requiredPaths = targetSchema.getRequiredLeafPaths();
  const uniqueRuleTargets = new Set(rules.map((rule) => rule.target));
  const unmappedFields = [];
  let mapped = 0;
  for (const requiredPath of requiredPaths) {
    if (uniqueRuleTargets.has(requiredPath)) {
      mapped += 1;
      continue;
    }
    unmappedFields.push(requiredPath);
  }
  const total = requiredPaths.length;
  const percentage = total === 0 ? 100 : Math.round(mapped / total * 100);
  return {
    total,
    mapped,
    percentage,
    unmappedFields: unmappedFields.length > 0 ? unmappedFields : void 0
  };
}

// src/engine/validate.ts
function validate(config, sourceSchema, targetSchema, options) {
  try {
    void options;
    const diagnostics = [];
    const sourceTree = sourceSchema === null || sourceSchema === void 0 ? null : getOrBuildSchemaTree(sourceSchema, detectSchemaFormat(sourceSchema));
    const targetTree = targetSchema === null || targetSchema === void 0 ? null : getOrBuildSchemaTree(targetSchema, detectSchemaFormat(targetSchema));
    if (sourceTree) {
      diagnostics.push(...sourceTree.diagnostics);
    }
    if (targetTree) {
      diagnostics.push(...targetTree.diagnostics);
    }
    const parsedRules = parseRules(config);
    diagnostics.push(...collectParseDiagnostics(parsedRules));
    const validAsts = parsedRules.filter((parsedRule) => parsedRule.ast !== null);
    if (sourceTree) {
      diagnostics.push(...validateSourcePaths(validAsts, sourceTree));
    }
    if (targetTree) {
      diagnostics.push(...validateTargetPaths(config.rules, targetTree));
    }
    diagnostics.push(...detectDuplicateTargets(config.rules));
    if (sourceTree && targetTree) {
      diagnostics.push(...validateTypeCompatibility(validAsts, sourceTree, targetTree, defaultRegistry));
    }
    if (sourceTree) {
      diagnostics.push(...validateArrayContext(validAsts, defaultRegistry, sourceTree));
    }
    diagnostics.push(...validateConstantsAndExternals(validAsts, config.config));
    const coverage = targetTree ? computeCoverage(config.rules, targetTree) : void 0;
    const valid = !diagnostics.some((diagnostic) => diagnostic.severity === "error");
    return {
      valid,
      diagnostics,
      coverage
    };
  } catch (error) {
    return {
      valid: false,
      diagnostics: [
        {
          code: "KEYRA-E001",
          severity: "error",
          message: `Validation pipeline failed: ${error instanceof Error ? error.message : String(error)}`
        }
      ]
    };
  }
}
function detectSchemaFormat(schema) {
  if (typeof schema === "string") {
    return "xsd";
  }
  return "json-schema";
}
function parseRules(config) {
  return config.rules.map((rule, ruleIndex) => {
    const parseResult = parse(rule.expression, {
      registry: defaultRegistry
    });
    return {
      ruleIndex,
      rule,
      ast: parseResult.ast,
      parseDiagnostics: parseResult.diagnostics
    };
  });
}
function collectParseDiagnostics(parsedRules) {
  const diagnostics = [];
  for (const parsedRule of parsedRules) {
    for (const parseDiagnostic of parsedRule.parseDiagnostics) {
      diagnostics.push({
        ...parseDiagnostic,
        ruleIndex: parsedRule.ruleIndex,
        targetPath: parsedRule.rule.target,
        expression: parsedRule.rule.expression
      });
    }
  }
  return diagnostics;
}

// src/engine/index.ts
registerAllFunctions(defaultRegistry);

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

// src/lambda/mapping/create-mapping.ts
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
function toEngineConfig(config) {
  const sourceSchemaRef = {
    schemaId: config.sourceSchemaRef?.schemaId ?? "",
    type: config.sourceSchemaRef?.type === "github" ? "github" : "local",
    ...config.sourceSchemaRef?.commitSha ? { commitSha: config.sourceSchemaRef.commitSha } : {}
  };
  const targetSchemaRef = {
    schemaId: config.targetSchemaRef?.schemaId ?? "",
    type: config.targetSchemaRef?.type === "github" ? "github" : "local",
    ...config.targetSchemaRef?.commitSha ? { commitSha: config.targetSchemaRef.commitSha } : {}
  };
  const rules = (config.rules ?? []).map((rule) => ({
    target: rule.target,
    type: rule.type === "null" || rule.type === "any" ? "string" : rule.type,
    expression: rule.expression,
    ...rule.description ? { description: rule.description } : {}
  }));
  return {
    name: config.name,
    version: config.version,
    engineVersion: config.engineVersion,
    sourceSchemaRef,
    targetSchemaRef,
    config: {
      unmappedTargets: config.config.unmappedTargets ?? "omit",
      nullSubtrees: config.config.nullSubtrees ?? [],
      constants: config.config.constants ?? {},
      externalSources: config.config.externalSources ?? []
    },
    rules
  };
}
function deriveStatusAndCoverage(config) {
  const ruleCount = config.rules.length;
  if (ruleCount === 0) {
    return { status: "draft", coverage: 0, ruleCount };
  }
  const result = validate(toEngineConfig(config), null, null);
  const hasErrors = result.diagnostics.some((diagnostic) => diagnostic.severity === "error");
  return {
    status: hasErrors ? "has-errors" : "ready",
    coverage: result.coverage?.percentage ?? 0,
    ruleCount
  };
}
function buildConfigS3Key(mappingId) {
  return `mappings/${mappingId}/config.json`;
}
async function handler(event) {
  const body = parseBody(event);
  const required = requireFields(body, ["projectId", "name"]);
  if (!required.ok) {
    const err = required.error;
    return errorResponse(err?.code ?? ERROR_CODES.VALIDATION_ERROR, err?.message ?? "Validation failed", err?.statusCode ?? 400, err?.retryable ?? false);
  }
  try {
    const mappingId = generateMappingId();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const config = {
      id: mappingId,
      projectId: String(body?.projectId ?? ""),
      name: String(body?.name ?? ""),
      version: 1,
      engineVersion: typeof body?.engineVersion === "string" ? body.engineVersion : "1.0.0",
      sourceSchemaRef: body?.sourceSchemaRef ?? void 0,
      targetSchemaRef: body?.targetSchemaRef ?? void 0,
      config: body?.config ?? {},
      rules: Array.isArray(body?.rules) ? body?.rules : []
    };
    const configS3Key = buildConfigS3Key(mappingId);
    const derivation = deriveStatusAndCoverage(config);
    const metadata = {
      mappingId,
      projectId: config.projectId ?? "",
      name: config.name,
      version: 1,
      status: derivation.status,
      sourceSchemaId: config.sourceSchemaRef?.schemaId,
      targetSchemaId: config.targetSchemaRef?.schemaId,
      ruleCount: derivation.ruleCount,
      coverage: derivation.coverage,
      configS3Key,
      createdAt: now,
      updatedAt: now
    };
    await putObject({
      Bucket: getContentBucketOrThrow(),
      Key: configS3Key,
      Body: JSON.stringify(config),
      ContentType: "application/json"
    });
    await putItem({
      TableName: getMappingsTableOrThrow(),
      Item: metadata
    });
    return jsonResponse(201, metadata);
  } catch {
    const err = internalError();
    return errorResponse(err.code, err.message, err.statusCode, err.retryable);
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
//# sourceMappingURL=create-mapping.js.map
