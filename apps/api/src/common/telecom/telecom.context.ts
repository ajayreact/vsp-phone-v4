import { AsyncLocalStorage } from 'node:async_hooks';

export interface TelecomRequestContext {
  requestId: string;
  correlationId: string;
  platformUuid?: string;
  idempotencyKey?: string;
  path: string;
  method: string;
}

export const telecomContextStorage = new AsyncLocalStorage<TelecomRequestContext>();

export function getTelecomContext(): TelecomRequestContext | undefined {
  return telecomContextStorage.getStore();
}
