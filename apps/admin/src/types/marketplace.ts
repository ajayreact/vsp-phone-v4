export type MarketplaceDashboard = {
  myNumbers: number;
  availableNumbers: number;
  pendingRequests: number;
  rejectedRequests: number;
  activeReservations: number;
  recentlyAssigned: Array<{
    id: string;
    phoneNumberId: string;
    number: string;
    status: string;
    assignedAt: string;
  }>;
};

export type MarketplaceSearchParams = {
  search?: string;
  countryCode?: string;
  state?: string;
  city?: string;
  postalCode?: string;
  areaCode?: string;
  prefix?: string;
  contains?: string;
  phoneNumberType?: string;
  voice?: boolean;
  sms?: boolean;
  mms?: boolean;
  emergency?: boolean;
  vanity?: boolean;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  limit?: number;
};

export type MarketplaceNumber = {
  id: string;
  number: string;
  e164: string;
  region: string;
  monthlyCost: number;
  upfrontCost?: number;
  smsEnabled: boolean;
  mmsEnabled: boolean;
  emergencyEnabled: boolean;
  phoneNumberType?: string;
  reservationStatus?: 'available' | 'reserved' | 'reserved_by_you' | 'pending';
  reservationExpiresAt?: string | null;
  reservationId?: string | null;
  estimatedAvailability?: string;
  status: string;
};

export type NumberReservation = {
  id: string;
  phoneNumber: string;
  countryCode: string;
  status: string;
  expiresAt: string;
};

export type TenantNumberRequest = {
  id: string;
  tenantId: string;
  phoneNumber: string;
  status: string;
  requestedBy: string;
  requesterEmail?: string;
  requesterName?: string;
  reviewedBy: string | null;
  reservationId: string | null;
  businessReason: string | null;
  priority: string;
  requestedFeatures: string[];
  notes: string | null;
  reservationExpiresAt: string | null;
  bulkRequestId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PlatformNumberRequest = TenantNumberRequest & {
  tenantName: string;
  companyName: string;
  internalNotes: string | null;
};

export type NumberNotification = {
  id: string;
  tenantId: string;
  userId: string | null;
  type: string;
  title: string;
  body: string;
  read: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type SavedSearch = {
  id: string;
  tenantId: string;
  userId: string;
  name: string;
  filters: Record<string, unknown>;
  createdAt: string;
};

export type FavoriteNumber = {
  id: string;
  tenantId: string;
  userId: string;
  phoneNumber: string;
  createdAt: string;
};

export type MarketplaceReports = {
  requests: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    expired: number;
    assigned: number;
    purchased: number;
    cancelled: number;
  };
  inventory: Record<string, number | string>;
  reservedInventory: number;
  avgApprovalHours: number;
  assignmentStatistics: {
    recentlyAssigned: Array<{ id: string; phoneNumber: string; tenantName: string; assignedAt: string }>;
  };
  tenantUsage: Array<{ tenantId: string; tenantName: string; assignedNumbers: number }>;
};
