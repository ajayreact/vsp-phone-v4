import type { ReactNode } from 'react';
import { Phone } from 'lucide-react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between bg-primary p-12 text-primary-foreground lg:flex">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15">
            <Phone className="h-5 w-5" />
          </div>
          <span className="text-lg font-semibold">VSP Phone</span>
        </div>
        <div className="max-w-md space-y-4">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight">
            Enterprise cloud phone administration
          </h1>
          <p className="text-primary-foreground/80 text-lg">
            Manage extensions, devices, routing, and analytics from one unified console.
          </p>
        </div>
        <p className="text-sm text-primary-foreground/60">© VSP Phone v4</p>
      </div>
      <div className="flex flex-col items-center justify-center bg-background p-6 sm:p-12">
        {children}
      </div>
    </div>
  );
}
