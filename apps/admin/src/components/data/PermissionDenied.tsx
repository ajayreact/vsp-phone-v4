import { ShieldOff } from 'lucide-react';
import { Card, CardBody } from '../ui/Card';

export function PermissionDenied({ module }: { module: string }) {
  return (
    <Card>
      <CardBody className="flex flex-col items-center justify-center py-16 text-center">
        <ShieldOff className="mb-4 h-10 w-10 text-muted-foreground" />
        <h3 className="text-lg font-semibold">Access denied</h3>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          You do not have permission to view {module}. Contact your organization administrator.
        </p>
      </CardBody>
    </Card>
  );
}
