/** Standard API error envelope returned to clients. */
export interface ApiErrorBody {
  success: false;
  code: string;
  message: string;
  details: unknown;
  field: string | null;
  requestId: string;
  timestamp: string;
}

export interface MappedApiError {
  status: number;
  code: string;
  message: string;
  details: unknown;
  field: string | null;
}

export interface ValidationDetail {
  field: string;
  message: string;
}
