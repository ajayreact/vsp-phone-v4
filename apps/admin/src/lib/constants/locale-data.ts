export type CountryOption = {
  code: string;
  name: string;
  phonePrefix: string;
  currency: string;
  timezone: string;
  dateFormat: string;
  timeFormat: '12h' | '24h';
  language: string;
  emergencyRegion: string;
  dialPlan: string;
};

export const COUNTRY_OPTIONS: CountryOption[] = [
  { code: 'US', name: 'United States', phonePrefix: '+1', currency: 'USD', timezone: 'America/New_York', dateFormat: 'MM/DD/YYYY', timeFormat: '12h', language: 'en', emergencyRegion: 'US', dialPlan: 'NANP' },
  { code: 'CA', name: 'Canada', phonePrefix: '+1', currency: 'CAD', timezone: 'America/Toronto', dateFormat: 'YYYY-MM-DD', timeFormat: '24h', language: 'en', emergencyRegion: 'CA', dialPlan: 'NANP' },
  { code: 'GB', name: 'United Kingdom', phonePrefix: '+44', currency: 'GBP', timezone: 'Europe/London', dateFormat: 'DD/MM/YYYY', timeFormat: '24h', language: 'en', emergencyRegion: 'GB', dialPlan: 'E.164' },
  { code: 'IN', name: 'India', phonePrefix: '+91', currency: 'INR', timezone: 'Asia/Kolkata', dateFormat: 'DD/MM/YYYY', timeFormat: '24h', language: 'en', emergencyRegion: 'IN', dialPlan: 'E.164' },
  { code: 'AU', name: 'Australia', phonePrefix: '+61', currency: 'AUD', timezone: 'Australia/Sydney', dateFormat: 'DD/MM/YYYY', timeFormat: '24h', language: 'en', emergencyRegion: 'AU', dialPlan: 'E.164' },
  { code: 'DE', name: 'Germany', phonePrefix: '+49', currency: 'EUR', timezone: 'Europe/Berlin', dateFormat: 'DD.MM.YYYY', timeFormat: '24h', language: 'de', emergencyRegion: 'DE', dialPlan: 'E.164' },
  { code: 'FR', name: 'France', phonePrefix: '+33', currency: 'EUR', timezone: 'Europe/Paris', dateFormat: 'DD/MM/YYYY', timeFormat: '24h', language: 'fr', emergencyRegion: 'FR', dialPlan: 'E.164' },
  { code: 'AE', name: 'United Arab Emirates', phonePrefix: '+971', currency: 'AED', timezone: 'Asia/Dubai', dateFormat: 'DD/MM/YYYY', timeFormat: '24h', language: 'en', emergencyRegion: 'AE', dialPlan: 'E.164' },
  { code: 'SG', name: 'Singapore', phonePrefix: '+65', currency: 'SGD', timezone: 'Asia/Singapore', dateFormat: 'DD/MM/YYYY', timeFormat: '24h', language: 'en', emergencyRegion: 'SG', dialPlan: 'E.164' },
];

export type TimezoneGroup = { region: string; zones: { value: string; label: string }[] };

export const TIMEZONE_GROUPS: TimezoneGroup[] = [
  { region: 'UTC', zones: [{ value: 'UTC', label: 'UTC — Coordinated Universal Time' }] },
  {
    region: 'Americas',
    zones: [
      { value: 'America/New_York', label: 'America/New_York — Eastern Time' },
      { value: 'America/Chicago', label: 'America/Chicago — Central Time' },
      { value: 'America/Denver', label: 'America/Denver — Mountain Time' },
      { value: 'America/Los_Angeles', label: 'America/Los_Angeles — Pacific Time' },
      { value: 'America/Toronto', label: 'America/Toronto — Eastern (Canada)' },
    ],
  },
  {
    region: 'Europe',
    zones: [
      { value: 'Europe/London', label: 'Europe/London — United Kingdom' },
      { value: 'Europe/Paris', label: 'Europe/Paris — France' },
      { value: 'Europe/Berlin', label: 'Europe/Berlin — Germany' },
    ],
  },
  {
    region: 'Asia & Pacific',
    zones: [
      { value: 'Asia/Kolkata', label: 'Asia/Kolkata — India' },
      { value: 'Asia/Dubai', label: 'Asia/Dubai — UAE' },
      { value: 'Asia/Singapore', label: 'Asia/Singapore — Singapore' },
      { value: 'Australia/Sydney', label: 'Australia/Sydney — Australia' },
    ],
  },
];

export const ALL_TIMEZONES = TIMEZONE_GROUPS.flatMap((g) =>
  g.zones.map((z) => ({ ...z, group: g.region })),
);

export const SITE_PRESETS = [
  'Main Office',
  'Head Office',
  'Corporate Office',
  'Branch Office',
  'Regional Office',
  'Custom Site',
] as const;

export const INDUSTRY_OPTIONS = [
  'Technology',
  'Healthcare',
  'Finance',
  'Retail',
  'Manufacturing',
  'Professional Services',
  'Education',
  'Hospitality',
  'Other',
];

export const COMPANY_SIZE_OPTIONS = ['1-10', '11-50', '51-200', '201-1000', '1000+'];

export const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
];

export const BILLING_CYCLE_OPTIONS = ['monthly', 'annual'] as const;

export const RESERVED_SLUGS = new Set([
  'admin', 'api', 'app', 'tenant', 'platform', 'www', 'ops', 'system', 'root',
  'login', 'dashboard', 'null', 'undefined', 'support', 'billing', 'help',
]);

export function slugFromDisplayName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\W+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'tenant';
}

export function countryByCode(code: string): CountryOption | undefined {
  return COUNTRY_OPTIONS.find((c) => c.code === code);
}

/** Matches server-side billing plan seed defaults for limit prefill. */
export const PLAN_LIMIT_DEFAULTS: Record<
  string,
  { storageLimitGb: number; recordingRetentionDays: number }
> = {
  Starter: { storageLimitGb: 25, recordingRetentionDays: 30 },
  Business: { storageLimitGb: 50, recordingRetentionDays: 90 },
  Professional: { storageLimitGb: 200, recordingRetentionDays: 180 },
  Enterprise: { storageLimitGb: 1000, recordingRetentionDays: 365 },
};
