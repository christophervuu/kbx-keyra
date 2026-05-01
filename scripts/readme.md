# Mapping Engine Test Runner

This folder contains scripts for running and testing the mapping engine against data-driven fixtures.

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