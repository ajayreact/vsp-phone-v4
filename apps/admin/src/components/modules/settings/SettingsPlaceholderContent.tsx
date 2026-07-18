'use client';

import Link from 'next/link';
import { ModuleAccessGate } from '../shared/ModuleShell';
import { PageContainer, PageHeader } from '../../layout/PageHeader';
import { Card, CardBody } from '../../ui/Card';

/** Placeholder for Settings routes that are routed but not fully built for RC1. */
export function SettingsPlaceholderContent({
  moduleId,
  note,
  relatedHref,
  relatedLabel,
}: {
  moduleId: string;
  note: string;
  relatedHref?: string;
  relatedLabel?: string;
}) {
  return (
    <ModuleAccessGate moduleId={moduleId}>
      {({ module }) => (
        <PageContainer>
          <PageHeader title={module.label} description={module.description} />
          <Card className="glass-card max-w-xl">
            <CardBody className="space-y-3 text-sm text-muted-foreground">
              <p>{note}</p>
              {relatedHref && relatedLabel ? (
                <p>
                  Related:{' '}
                  <Link href={relatedHref} className="font-medium text-primary underline-offset-2 hover:underline">
                    {relatedLabel}
                  </Link>
                </p>
              ) : null}
            </CardBody>
          </Card>
        </PageContainer>
      )}
    </ModuleAccessGate>
  );
}
