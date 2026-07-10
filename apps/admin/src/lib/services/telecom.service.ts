import {
  billingRepository,
  extensionsRepository,
  liveCallsRepository,
  opsRepository,
  telnyxNumbersRepository,
  tenantsRepository,
  trunksRepository,
} from '../repositories/telecom.repository';
import type { AssignTelnyxNumberPayload } from '../../types/telecom';

export const opsService = {
  getDashboard: opsRepository.getDashboard,
  getHealth: opsRepository.getHealth,
};

export const telnyxNumbersService = {
  list: telnyxNumbersRepository.list,
  searchAvailable: telnyxNumbersRepository.searchAvailable,
  reserve: telnyxNumbersRepository.reserve,
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

export const tenantsService = {
  list: tenantsRepository.list,
};

export const billingService = {
  getSummary: billingRepository.getSummary,
};
