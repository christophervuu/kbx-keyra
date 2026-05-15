export interface DevLogEntry {
  endpoint: string;
  statusCode?: number;
  errorCode?: string;
  requestId?: string;
  duration?: number;
  attempt?: number;
  message: string;
}

interface DevLogger {
  error: (entry: DevLogEntry) => void;
  warn: (entry: DevLogEntry) => void;
  info: (entry: DevLogEntry) => void;
}

type LogLevel = 'error' | 'warn' | 'info';

type ConsoleGroupMethod = (
  label?: string,
  ...data: unknown[]
) => void;

const noop = () => undefined;

const STYLE_BY_LEVEL: Record<LogLevel, string> = {
  error: 'color: #ef4444; font-weight: 700;',
  warn: 'color: #f59e0b; font-weight: 700;',
  info: 'color: #9ca3af; font-weight: 700;',
};

const LABEL_BY_LEVEL: Record<LogLevel, string> = {
  error: '[API ERROR]',
  warn: '[API RETRY]',
  info: '[API OK]',
};

/**
 * Testable factory. Production export uses import.meta.env.DEV.
 */
export function createDevLogger(isDev: boolean): DevLogger {
  if (!isDev) {
    return {
      error: noop,
      warn: noop,
      info: noop,
    };
  }

  const groupMethod: ConsoleGroupMethod =
    typeof console.groupCollapsed === 'function' ? console.groupCollapsed.bind(console) : console.log.bind(console);

  const groupEnd =
    typeof console.groupEnd === 'function' ? console.groupEnd.bind(console) : noop;

  const log = (level: LogLevel, entry: DevLogEntry): void => {
    const timestamp = new Date().toISOString();
    const label = LABEL_BY_LEVEL[level];
    const style = STYLE_BY_LEVEL[level];

    groupMethod(`%c${label}%c ${entry.endpoint} — ${entry.message}`, style, 'color: inherit;');

    console.log('timestamp:', timestamp);
    console.log('endpoint:', entry.endpoint);
    console.log('message:', entry.message);

    if (entry.statusCode !== undefined) {
      console.log('statusCode:', entry.statusCode);
    }

    if (entry.errorCode !== undefined) {
      console.log('errorCode:', entry.errorCode);
    }

    if (entry.requestId !== undefined) {
      console.log('requestId:', entry.requestId);
    }

    if (entry.duration !== undefined) {
      console.log('durationMs:', entry.duration);
    }

    if (entry.attempt !== undefined) {
      console.log('attempt:', entry.attempt);
    }

    groupEnd();
  };

  return {
    error: (entry) => log('error', entry),
    warn: (entry) => log('warn', entry),
    info: (entry) => log('info', entry),
  };
}

// Module-level env gate for production no-op behavior.
export const devLogger = createDevLogger(import.meta.env.DEV);
