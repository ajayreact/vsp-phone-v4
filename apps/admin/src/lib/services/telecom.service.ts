import {
  billingRepository,
  extensionsRepository,
  liveCallsRepository,
  opsRepository,
  telnyxNumbersRepository,
  tenantsRepository,
  trunksRepository,
} from '../repositories/telecom.repository';
import type {
  AssignTelnyxNumberPayload,
  PurchaseTelnyxNumberPayload,
  SearchAvailableParams,
  UpdateTelnyxNumberPayload,
} from '../../types/telecom';

export const opsService = {
  getDashboard: opsRepository.getDashboard,
  getHealth: opsRepository.getHealth,
};

export const telnyxNumbersService = {
  list: telnyxNumbersRepository.list,
  getDashboard: telnyxNumbersRepository.getDashboard,
  getSyncStatus: telnyxNumbersRepository.getSyncStatus,
  triggerSync: telnyxNumbersRepository.triggerSync,
  get: telnyxNumbersRepository.get,
  getHistory: telnyxNumbersRepository.getHistory,
  searchAvailable: (params: SearchAvailableParams) => telnyxNumbersRepository.searchAvailable(params),
  listMarketplace: telnyxNumbersRepository.listMarketplace,
  reserve: telnyxNumbersRepository.reserve,
  assign: (id: string, payload: AssignTelnyxNumberPayload) => telnyxNumbersRepository.assign(id, payload),
  reassign: (id: string, payload: AssignTelnyxNumberPayload) => telnyxNumbersRepository.reassign(id, payload),
  suspend: telnyxNumbersRepository.suspend,
  activate: telnyxNumbersRepository.activate,
  release: telnyxNumbersRepository.release,
  purchase: (payload: PurchaseTelnyxNumberPayload) => telnyxNumbersRepository.purchase(payload),
  update: (id: string, payload: UpdateTelnyxNumberPayload) => telnyxNumbersRepository.update(id, payload),
  remove: telnyxNumbersRepository.remove,
  bulkAssign: telnyxNumbersRepository.bulkAssign,
  bulkRelease: telnyxNumbersRepository.bulkRelease,
  bulkPurchase: telnyxNumbersRepository.bulkPurchase,
  bulkReserve: telnyxNumbersRepository.bulkReserve,
  bulkTag: telnyxNumbersRepository.bulkTag,
  bulkEmergency: telnyxNumbersRepository.bulkEmergency,
  listRequests: telnyxNumbersRepository.listRequests,
  approveRequest: telnyxNumbersRepository.approveRequest,
  rejectRequest: telnyxNumbersRepository.rejectRequest,
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
