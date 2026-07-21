import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import { TenantSearchService } from './tenant-search.service';

describe('TenantSearchService', () => {
  let service: TenantSearchService;
  let extensionFindMany: jest.Mock;

  beforeEach(async () => {
    extensionFindMany = jest.fn().mockResolvedValue([]);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantSearchService,
        {
          provide: PrismaService,
          useValue: {
            connected: true,
            user: { findMany: jest.fn().mockResolvedValue([]) },
            extension: { findMany: extensionFindMany },
            device: { findMany: jest.fn().mockResolvedValue([]) },
            phoneNumber: { findMany: jest.fn().mockResolvedValue([]) },
            queue: { findMany: jest.fn().mockResolvedValue([]) },
            iVR: { findMany: jest.fn().mockResolvedValue([]) },
          },
        },
      ],
    }).compile();

    service = module.get(TenantSearchService);
  });

  it('scopes extension search to active lifecycle by default', async () => {
    await service.search('tenant-1', 'Basha');

    expect(extensionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          archivedAt: null,
          line: expect.objectContaining({ status: 'ACTIVE', deletedAt: null }),
        }),
      }),
    );
  });

  it('includes archived extensions when lifecycle=all', async () => {
    await service.search('tenant-1', 'Basha', 'all');

    expect(extensionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({
          archivedAt: null,
        }),
      }),
    );
  });
});
