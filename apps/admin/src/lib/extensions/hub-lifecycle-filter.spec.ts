import { matchesHubLifecycleFilter } from './hub-lifecycle-filter';

describe('matchesHubLifecycleFilter', () => {
  it('hides archived extensions from the default active view', () => {
    expect(matchesHubLifecycleFilter({ archived: false, lineStatus: 'ACTIVE' }, 'active')).toBe(true);
    expect(matchesHubLifecycleFilter({ archived: true, lineStatus: 'ACTIVE' }, 'active')).toBe(false);
    expect(matchesHubLifecycleFilter({ archived: false, lineStatus: 'INACTIVE' }, 'active')).toBe(false);
  });

  it('shows only archived extensions in the archived view', () => {
    expect(matchesHubLifecycleFilter({ archived: true, lineStatus: 'ACTIVE' }, 'archived')).toBe(true);
    expect(matchesHubLifecycleFilter({ archived: false, lineStatus: 'ACTIVE' }, 'archived')).toBe(false);
  });

  it('shows all extensions in the all view', () => {
    expect(matchesHubLifecycleFilter({ archived: true, lineStatus: 'ACTIVE' }, 'all')).toBe(true);
    expect(matchesHubLifecycleFilter({ archived: false, lineStatus: 'INACTIVE' }, 'all')).toBe(true);
  });
});
