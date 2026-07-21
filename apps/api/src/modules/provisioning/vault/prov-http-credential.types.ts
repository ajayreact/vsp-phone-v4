export interface StoredProvHttpCred {
  username: string;
  passwordEnc: string;
  version: string;
  createdAt: string;
  expiresAt?: string | null;
}
