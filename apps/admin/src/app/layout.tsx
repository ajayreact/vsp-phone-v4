import type { ReactNode } from 'react';
import { Inter } from 'next/font/google';
import { AuthProvider } from '../lib/auth/AuthProvider';
import { ThemeProvider } from '../lib/theme/ThemeProvider';
import { ToastProvider } from '../lib/toast/ToastProvider';
import { QueryProvider } from '../providers/QueryProvider';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata = {
  title: 'VSP Phone — Operations Center',
  description: 'Telecom operations center for VSP Phone v4 platform administration',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <body className="font-sans antialiased">
        <ThemeProvider>
          <QueryProvider>
            <AuthProvider>
              <ToastProvider>{children}</ToastProvider>
            </AuthProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
