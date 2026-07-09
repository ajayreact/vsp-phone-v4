import type { ReactNode } from 'react';
import { AuthProvider } from '../lib/auth/AuthProvider';
import { ThemeProvider } from '../lib/theme/ThemeProvider';
import './globals.css';

export const metadata = {
  title: 'VSP Phone Admin',
  description: 'Enterprise PBX administration portal',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
