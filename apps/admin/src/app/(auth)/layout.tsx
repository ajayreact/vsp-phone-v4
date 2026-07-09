import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold">VSP Phone</h1>
          <p className="mt-1 text-sm text-muted-foreground">Enterprise Admin Portal</p>
        </div>
        {children}
      </div>
    </div>
  );
}
