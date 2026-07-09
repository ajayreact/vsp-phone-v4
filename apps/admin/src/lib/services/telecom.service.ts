import {
  billingRepository,
  extensionsRepository,
  liveCallsRepository,
  opsRepository,
  resourceRepository,
  telnyxNumbersRepository,
  tenantsRepository,
  trunksRepository,
} from '../repositories/telecom.repository';
import type { AssignTelnyxNumberPayload } from '../../types/telecom';

export const opsService = {
  getDashboard: opsRepository.getDashboardSnapshot,
  getHealth: opsRepository.getHealthDetail,
};

export const telnyxNumbersService = {
  list: telnyxNumbersRepository.list,
  assign: (id: string, payload: AssignTelnyxNumberPayload) => telnyxNumbersRepository.assign(id, payload),
  release: telnyxNumbersRepository.release,
  purchase: telnyxNumbersRepository.purchase,
  update: telnyxNumbersRepository.update,
  remove: telnyxNumbersRepository.remove,
  bulkAssign: telnyxNumbersRepository.bulkAssign,
  bulkRelease: telnyxNumbersRepository.bulkRelease,
};

export const trunksService = {
  list: trunksRepository.list,
};

export const liveCallsService = {
  list: liveCallsRepository.list,
};

export const extensionsService = {
  list: extensionsRepository.list,
};

export const resourceService = {
  list: resourceRepository.list,
};

export const tenantsService = {
  list: tenantsRepository.list,
};

export const billingService = {
  getSummary: billingRepository.getSummary,
};
