import { buildDidDestinationsPath } from './did-destinations-url';

describe('DID destinations URL (Assign dropdown ↔ API)', () => {
  it('includes type and phoneNumberId so UI matches API filter', () => {
    expect(buildDidDestinationsPath('EXTENSION', 'pn-5770')).toBe(
      '/v1/tenant/dids/destinations?type=EXTENSION&phoneNumberId=pn-5770',
    );
  });

  it('omits phoneNumberId when not assigning a specific DID', () => {
    expect(buildDidDestinationsPath('EXTENSION')).toBe(
      '/v1/tenant/dids/destinations?type=EXTENSION',
    );
  });
});
