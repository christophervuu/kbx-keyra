import type { RenderableOutput } from '@/lib/types/domain';

export const INLINE_OUTPUT_NODE_LIMIT_SOFT = 5_000;
export const INLINE_OUTPUT_SIZE_BYTES_SOFT = 512 * 1024;
export const INLINE_OUTPUT_NODE_LIMIT_HARD = 20_000;
export const INLINE_OUTPUT_SIZE_BYTES_HARD = 2 * 1024 * 1024;

export type OutputRenderMode = 'interactive' | 'limited' | 'fallback';

export function resolveOutputRenderMode(output: Pick<RenderableOutput, 'nodeCount' | 'serializedSizeBytes'>): OutputRenderMode {
  if (
    output.nodeCount >= INLINE_OUTPUT_NODE_LIMIT_HARD
    || output.serializedSizeBytes >= INLINE_OUTPUT_SIZE_BYTES_HARD
  ) {
    return 'fallback';
  }

  if (
    output.nodeCount >= INLINE_OUTPUT_NODE_LIMIT_SOFT
    || output.serializedSizeBytes >= INLINE_OUTPUT_SIZE_BYTES_SOFT
  ) {
    return 'limited';
  }

  return 'interactive';
}
