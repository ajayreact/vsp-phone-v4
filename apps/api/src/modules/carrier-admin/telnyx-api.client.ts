import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type TelnyxPhoneNumberApi = {
  id: string;
  phone_number: string;
  status?: string;
  connection_name?: string;
  connection_id?: string;
  messaging_profile_name?: string;
  region_information?: Array<{ region_type: string; region_name: string }>;
  cost_information?: { monthly_cost?: string; currency?: string };
  created_at?: string;
  tags?: string[];
  features?: Array<{ name: string }>;
};

type TelnyxListResponse = {
  data: TelnyxPhoneNumberApi[];
  meta?: { total_pages?: number; page_number?: number };
};

@Injectable()
export class TelnyxApiClient {
  private readonly logger = new Logger(TelnyxApiClient.name);
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = (config.get<string>('TELNYX_API_KEY') || '').trim();
    this.baseUrl = (config.get<string>('TELNYX_API_BASE_URL') || 'https://api.telnyx.com/v2').replace(/\/$/, '');
  }

  get enabled(): boolean {
    return this.apiKey.length > 0;
  }

  async listPhoneNumbers(page = 1): Promise<TelnyxPhoneNumberApi[]> {
    if (!this.enabled) return [];
    const res = await this.request<TelnyxListResponse>(`/phone_numbers?page[number]=${page}&page[size]=250`);
    return res.data ?? [];
  }

  async listAllPhoneNumbers(): Promise<TelnyxPhoneNumberApi[]> {
    const all: TelnyxPhoneNumberApi[] = [];
    let page = 1;
    for (;;) {
      const batch = await this.listPhoneNumbers(page);
      all.push(...batch);
      if (batch.length < 250) break;
      page += 1;
      if (page > 20) break;
    }
    return all;
  }

  async purchaseNumber(payload: {
    phoneNumber?: string;
    countryCode?: string;
    region?: string;
    connectionId?: string;
  }): Promise<TelnyxPhoneNumberApi> {
    const body: Record<string, unknown> = {};
    if (payload.phoneNumber) {
      body.phone_numbers = [{ phone_number: payload.phoneNumber }];
    } else {
      body.phone_number_type = 'local';
      body.country_code = payload.countryCode ?? 'US';
      if (payload.region) body.administrative_area = payload.region;
    }
    if (payload.connectionId) body.connection_id = payload.connectionId;

    const res = await this.request<{ data: TelnyxPhoneNumberApi }>('/number_orders', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return res.data;
  }

  async releaseNumber(telnyxId: string): Promise<void> {
    await this.request(`/phone_numbers/${encodeURIComponent(telnyxId)}`, { method: 'DELETE' });
  }

  async searchAvailableNumbers(params: {
    countryCode?: string;
    administrativeArea?: string;
    locality?: string;
    phoneNumberType?: 'local' | 'toll_free' | 'mobile' | 'national';
    features?: string[];
    limit?: number;
  }): Promise<TelnyxPhoneNumberApi[]> {
    const search = new URLSearchParams();
    search.set('filter[country_code]', params.countryCode ?? 'US');
    if (params.administrativeArea) search.set('filter[administrative_area]', params.administrativeArea);
    if (params.locality) search.set('filter[locality]', params.locality);
    if (params.phoneNumberType) search.set('filter[phone_number_type]', params.phoneNumberType);
    if (params.features?.length) {
      for (const f of params.features) search.append('filter[features][]', f);
    }
    search.set('filter[limit]', String(params.limit ?? 50));
    const res = await this.request<{ data: TelnyxPhoneNumberApi[] }>(`/available_phone_numbers?${search.toString()}`);
    return res.data ?? [];
  }

  async updateNumber(telnyxId: string, patch: Record<string, unknown>): Promise<TelnyxPhoneNumberApi> {
    const res = await this.request<{ data: TelnyxPhoneNumberApi }>(
      `/phone_numbers/${encodeURIComponent(telnyxId)}`,
      { method: 'PATCH', body: JSON.stringify(patch) },
    );
    return res.data;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    if (!this.enabled) {
      throw new Error('TELNYX_API_KEY is not configured');
    }
    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) {
      const text = await res.text();
      this.logger.warn(`Telnyx API ${init?.method ?? 'GET'} ${path} failed: ${res.status} ${text}`);
      throw new Error(text || `Telnyx API error ${res.status}`);
    }
    if (res.status === 204) return {} as T;
    return res.json() as Promise<T>;
  }
}
