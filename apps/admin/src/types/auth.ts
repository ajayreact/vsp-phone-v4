export type MeTenant = {
  id: string;
  name: string;
  slug: string;
};

export type MeRole = {
  id: string;
  name: string;
};

export type MeProfile = {
  firstName: string;
  lastName: string;
  displayName: string;
};

export type AuthSession = {
  userId: string;
  tenantId: string;
  email: string;
  permissions: string[];
  roles: MeRole[];
  tenant: MeTenant | null;
  profile: MeProfile | null;
};

export type LoginResult = {
  accessToken: string;
  tokenType: string;
  expiresInSec: number;
  userId: string;
  tenantId: string;
  email: string;
};
