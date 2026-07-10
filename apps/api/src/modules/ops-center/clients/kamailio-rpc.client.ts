import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type JsonRpcResponse = {
  result?: unknown;
  error?: { code: number; message: string };
};

/** Kamailio JSON-RPC client (jsonrpcs module). */
@Injectable()
export class KamailioRpcClient {
  private readonly logger = new Logger(KamailioRpcClient.name);
  private readonly endpoints: string[];

  constructor(private readonly config: ConfigService) {
    const raw = this.config.get<string>('KAMAILIO_RPC_ENDPOINTS') ?? '';
    this.endpoints = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  isConfigured(): boolean {
    return this.endpoints.length > 0;
  }

  async call(method: string, params: unknown[] = []): Promise<unknown> {
    if (!this.endpoints.length) {
      throw new Error('KAMAILIO_RPC_ENDPOINTS not configured');
    }

    let lastError: Error | null = null;
    for (const endpoint of this.endpoints) {
      try {
        return await this.postRpc(endpoint, method, params);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        this.logger.warn(`Kamailio RPC ${method} failed on ${endpoint}: ${lastError.message}`);
      }
    }
    throw lastError ?? new Error('Kamailio RPC unavailable');
  }

  async tryCall(method: string, params: unknown[] = []): Promise<{ ok: boolean; result?: unknown; error?: string }> {
    try {
      const result = await this.call(method, params);
      return { ok: true, result };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async postRpc(endpoint: string, method: string, params: unknown[]): Promise<unknown> {
    const url = endpoint.includes('://') ? endpoint : `http://${endpoint}/RPC`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method, params, id: Date.now() }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const body = (await res.json()) as JsonRpcResponse;
    if (body.error) {
      throw new Error(body.error.message);
    }
    return body.result;
  }
}
