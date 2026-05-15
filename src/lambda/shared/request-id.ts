export function generateRequestId(): string {
  return globalThis.crypto.randomUUID();
}
