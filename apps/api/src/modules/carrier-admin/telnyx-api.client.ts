import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type TelnyxPhoneNumberApi = {
  id: string;
  phone_number: string;
  status?: string;
  connection_name?: string;
  connection_id?: string;
  messaging_profile_id?: string;
  messaging_profile_name?: string;
  region_information?: Array<{ region_type: string; region_name: string }>;
  cost_information?: { monthly_cost?: string; currency?: string; upfront_cost?: string };
  created_at?: string;
  tags?: string[];
  features?: Array<{ name: string }>;
  phone_number_type?: string;
  emergency_enabled?: boolean;
  emergency_address_id?: string;
  caller_id_name?: string;
};

type TelnyxListResponse = {
  data: TelnyxPhoneNumberApi[];
  meta?: { total_pages?: number; page_number?: number; total_results?: number };
};

export type TelnyxSearchParams = {
  countryCode?: string;
  administrativeArea?: string;
  locality?: string;
  postalCode?: string;
  nationalDestinationCode?: string;
  phoneNumberType?: 'local' | 'toll_free' | 'mobile' | 'national';
  features?: string[];
  limit?: number;
  startsWith?: string;
  endsWith?: string;
  contains?: string;
  bestEffort?: boolean;
  quickship?: boolean;
  reservable?: boolean;
  sort?: string;
};

export type TelnyxAvailableNumber = TelnyxPhoneNumberApi & {
  vanity_format?: string;
  reservable?: boolean;
  quickship?: boolean;
  best_effort?: boolean;
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
      if (page > 50) break;
    }
    return all;
  }

  async getPhoneNumber(telnyxId: string): Promise<TelnyxPhoneNumberApi | null> {
    if (!this.enabled) return null;
    try {
      const res = await this.request<{ data: TelnyxPhoneNumberApi }>(
        `/phone_numbers/${encodeURIComponent(telnyxId)}`,
      );
      return res.data ?? null;
    } catch {
      return null;
    }
  }

  async purchaseNumber(payload: {
    phoneNumber?: string;
    phoneNumbers?: string[];
    countryCode?: string;
    region?: string;
    connectionId?: string;
    messagingProfileId?: string;
  }): Promise<TelnyxPhoneNumberApi> {
    const body: Record<string, unknown> = {};
    if (payload.phoneNumbers?.length) {
      body.phone_numbers = payload.phoneNumbers.map((n) => ({ phone_number: n }));
    } else if (payload.phoneNumber) {
      body.phone_numbers = [{ phone_number: payload.phoneNumber }];
    } else {
      body.phone_number_type = 'local';
      body.country_code = payload.countryCode ?? 'US';
      if (payload.region) body.administrative_area = payload.region;
    }
    if (payload.connectionId) body.connection_id = payload.connectionId;
    if (payload.messagingProfileId) body.messaging_profile_id = payload.messagingProfileId;

    const res = await this.request<{ data: TelnyxPhoneNumberApi }>('/number_orders', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return res.data;
  }

  async releaseNumber(telnyxId: string): Promise<void> {
    await this.request(`/phone_numbers/${encodeURIComponent(telnyxId)}`, { method: 'DELETE' });
  }

  async searchAvailableNumbers(params: TelnyxSearchParams): Promise<TelnyxAvailableNumber[]> {
    const search = new URLSearchParams();
    search.set('filter[country_code]', params.countryCode ?? 'US');
    if (params.administrativeArea) search.set('filter[administrative_area]', params.administrativeArea);
    if (params.locality) search.set('filter[locality]', params.locality);
    if (params.postalCode) search.set('filter[postal_code]', params.postalCode);
    if (params.nationalDestinationCode) {
      search.set('filter[national_destination_code]', params.nationalDestinationCode);
    }
    if (params.phoneNumberType) search.set('filter[phone_number_type]', params.phoneNumberType);
    if (params.features?.length) {
      for (const f of params.features) search.append('filter[features][]', f);
    }
    if (params.startsWith) search.set('filter[starts_with]', params.startsWith);
    if (params.endsWith) search.set('filter[ends_with]', params.endsWith);
    if (params.contains) search.set('filter[contains]', params.contains);
    if (params.bestEffort) search.set('filter[best_effort]', 'true');
    if (params.quickship) search.set('filter[quickship]', 'true');
    if (params.reservable) search.set('filter[reservable]', 'true');
    search.set('filter[limit]', String(Math.min(params.limit ?? 50, 250)));

    const res = await this.request<{ data: TelnyxAvailableNumber[] }>(
      `/available_phone_numbers?${search.toString()}`,
    );
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
