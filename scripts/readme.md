# Mapping Engine Test Runner

This folder contains scripts for running and testing the mapping engine against data-driven fixtures.

## Explain Rule Local Runner (`run-explain-rule.ts`)

A terminal-based runner for executing `explain-rule` Lambda request fixtures locally.

### Prerequisites
- Node.js (v18+ recommended)
- Dependencies installed (`npm install`)
- Environment variables configured for local AI runtime:
  - `AI_RUNTIME_MODE=local`
  - `PROMPT_REGISTRY_LOCAL_DIR=./tests/lib/ai/fixtures/local-runtime`
  - `DSL_ASSET_LOCAL_PATH=./tests/lib/ai/fixtures/local-runtime/dsl-reference.md`
  - `GITHUB_TOKEN=<your GitHub Models token>`

### Usage

#### Show environment setup help
```
npm run explain-rule:run -- --env
```

#### List available request fixtures
```
npm run explain-rule:run -- --list
```

#### Print request examples from fixtures
```
npm run explain-rule:run -- --examples
```

#### Run all explain-rule fixtures
```
npm run explain-rule:run
```
Or:
```
npm run explain-rule:run -- --all
```

#### Run a specific explain-rule fixture
```
npm run explain-rule:run -- <fixture-name>
```
Example:
```
npm run explain-rule:run -- valid-direct-source
```

### Fixture Structure
Each fixture is a directory under `tests/lambda/ai/fixtures/` and includes:
- `description.md` — Human-readable summary
- `request.json` — Request body passed to the Lambda handler
- `assertions.json` (optional) — Runtime assertions:
  - `requiresModel` (boolean)
  - `expectedStatusCode` (number)
  - `expectedBodyContains` (string[])

Fixtures marked with `requiresModel: true` are skipped if `GITHUB_TOKEN` is not set.

## Mapping Engine Test Runner (`run-engine.ts`)

A terminal-based runner for executing mapping engine test fixtures and viewing detailed output, diagnostics, and traces.

### Prerequisites
- Node.js (v18+ recommended)
- Dependencies installed (`npm install`)

### Usage

#### List all available fixtures
```
npm run engine:run -- --list
```

#### Run all fixtures
```
npm run engine:run
```
Or:
```
npm run engine:run -- --all
```

#### Run a specific fixture
```
npm run engine:run -- <fixture-name>
```
Example:
```
npm run engine:run -- simple-direct-mapping
```

### Output
- For each fixture, the runner prints:
  - Description
  - Input/output data
  - Diagnostics and trace
  - PASS/FAIL status (with color)
- Exit code is 0 if all pass, 1 if any fail or missing fixture.

### Fixture Structure
Each fixture is a directory under `tests/engine/fixtures/` and must include:
- `description.md` — Description of the test
- `source-schema.json` — Source JSON schema
- `target-schema.json` — Target JSON schema
- `source-data.json` — Input data
- `mapping-config.json` — Mapping configuration
- `expected-output.json` — Expected output

### Example
```
npm run engine:run -- array-mapping
```

---

## Project Tests

To run all project tests (including engine and function tests):
```
npm test
```
Or:
```
npm run test
```

---

For troubleshooting or more details, see the script source or ask for help!