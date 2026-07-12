//@ts-check

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_TENANT_PORTAL_V2: process.env.NEXT_PUBLIC_TENANT_PORTAL_V2 ?? 'true',
    NEXT_PUBLIC_TENANT_PORTAL_V2_NAV: process.env.NEXT_PUBLIC_TENANT_PORTAL_V2_NAV ?? 'true',
  },
  output: 'standalone',
};

module.exports = nextConfig;
