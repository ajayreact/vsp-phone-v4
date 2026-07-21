import type { ExtensionHubRow } from '../hooks/queries/use-extension-hub';

export type HubLifecycleFilter = 'all' | 'active' | 'archived';

export function matchesHubLifecycleFilter(
  row: Pick<ExtensionHubRow, 'archived' | 'lineStatus'>,
  filter: HubLifecycleFilter,
): boolean {
  if (filter === 'all') return true;
  if (filter === 'archived') return Boolean(row.archived);
  return !row.archived && row.lineStatus !== 'INACTIVE';
}
