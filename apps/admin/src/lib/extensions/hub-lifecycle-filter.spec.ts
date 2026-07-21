import { matchesHubLifecycleFilter } from './hub-lifecycle-filter';

describe('matchesHubLifecycleFilter', () => {
  it('hides archived extensions from the default active view', () => {
    expect(matchesHubLifecycleFilter({ archived: false }, 'active')).toBe(true);
    expect(matchesHubLifecycleFilter({ archived: true }, 'active')).toBe(false);
  });

  it('shows only archived extensions in the archived view', () => {
    expect(matchesHubLifecycleFilter({ archived: true }, 'archived')).toBe(true);
    expect(matchesHubLifecycleFilter({ archived: false }, 'archived')).toBe(false);
  });

  it('shows all extensions in the all view', () => {
    expect(matchesHubLifecycleFilter({ archived: true }, 'all')).toBe(true);
    expect(matchesHubLifecycleFilter({ archived: false }, 'all')).toBe(true);
  });
});
