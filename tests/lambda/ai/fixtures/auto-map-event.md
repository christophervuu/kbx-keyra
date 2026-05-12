# Auto-Map Event Fixture (Local Invocation)

This fixture provides a ready-to-use API Gateway event payload for invoking `src/lambda/ai/auto-map.ts` locally.

## Environment variables

Set the following before local invocation:

```bash
AI_RUNTIME_MODE=local
PROMPT_REGISTRY_LOCAL_DIR=./path/to/local/prompts
DSL_ASSET_LOCAL_PATH=./path/to/dsl-reference.md
GITHUB_TOKEN=<your-token>
```

## Example invocation

```typescript
import { handler } from './src/lambda/ai/auto-map.js';
import event from './tests/lambda/ai/fixtures/auto-map-event.json';

const result = await handler(event);
console.log(JSON.stringify(JSON.parse(result.body), null, 2));
```
