import type { ReactNode } from 'react';
import { Inter } from 'next/font/google';
import { AuthProvider } from '../lib/auth/AuthProvider';
import { ThemeProvider } from '../lib/theme/ThemeProvider';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata = {
  title: 'VSP Phone Admin',
  description: 'Enterprise PBX administration portal',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <body className="font-sans antialiased">
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
