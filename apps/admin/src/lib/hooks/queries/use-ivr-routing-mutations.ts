import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../query/query-keys';
import { ivrRoutingRepository } from '../../repositories/ivr-routing.repository';

function invalidateIvrRouting(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: queryKeys.tenant.ivrs() });
  void qc.invalidateQueries({ queryKey: queryKeys.tenant.inboundRoutes() });
  void qc.invalidateQueries({ queryKey: queryKeys.tenant.outboundRoutes() });
  void qc.invalidateQueries({ queryKey: queryKeys.tenant.timeConditions() });
  void qc.invalidateQueries({ queryKey: queryKeys.tenant.holidayCalendars() });
  void qc.invalidateQueries({ queryKey: queryKeys.tenant.announcements() });
  void qc.invalidateQueries({ queryKey: queryKeys.tenant.dialPlans() });
  void qc.invalidateQueries({ queryKey: queryKeys.tenant.routingMetrics() });
}

export function useIvrDetail(id: string) {
  return useQuery({
    queryKey: queryKeys.tenant.ivr(id),
    queryFn: () => ivrRoutingRepository.getIvr(id),
    enabled: Boolean(id),
  });
}

export function useCreateIvr() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => ivrRoutingRepository.createIvr(payload),
    onSuccess: () => invalidateIvrRouting(qc),
  });
}

export function useUpdateIvr() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      ivrRoutingRepository.updateIvr(id, payload),
    onSuccess: (_d, v) => {
      invalidateIvrRouting(qc);
      void qc.invalidateQueries({ queryKey: queryKeys.tenant.ivr(v.id) });
    },
  });
}

export function useDeleteIvr() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ivrRoutingRepository.deleteIvr(id),
    onSuccess: () => invalidateIvrRouting(qc),
  });
}

export function useCloneIvr() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { name: string; code: string } }) =>
      ivrRoutingRepository.cloneIvr(id, payload),
    onSuccess: () => invalidateIvrRouting(qc),
  });
}

export function useSaveIvrDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, flow }: { id: string; flow: Record<string, unknown> }) =>
      ivrRoutingRepository.saveIvrDraft(id, flow),
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: queryKeys.tenant.ivr(v.id) });
    },
  });
}

export function usePublishIvr() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, changeNotes }: { id: string; changeNotes?: string }) =>
      ivrRoutingRepository.publishIvr(id, changeNotes),
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: queryKeys.tenant.ivr(v.id) });
    },
  });
}

export function useSimulateIvr() {
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      ivrRoutingRepository.simulateIvr(id, payload),
  });
}

export function useIvrReports(id: string, days = 7) {
  return useQuery({
    queryKey: queryKeys.tenant.ivrReports(id, days),
    queryFn: () => ivrRoutingRepository.getIvrReports(id, days),
    enabled: Boolean(id),
  });
}

export function useInboundRoutes() {
  return useQuery({
    queryKey: queryKeys.tenant.inboundRoutes(),
    queryFn: () => ivrRoutingRepository.getInboundRoutes().then((r) => r.data),
  });
}

export function useOutboundRoutes() {
  return useQuery({
    queryKey: queryKeys.tenant.outboundRoutes(),
    queryFn: () => ivrRoutingRepository.getOutboundRoutes().then((r) => r.data),
  });
}

export function useRoutingMetrics() {
  return useQuery({
    queryKey: queryKeys.tenant.routingMetrics(),
    queryFn: () => ivrRoutingRepository.getRoutingMetrics(),
    refetchInterval: 10000,
  });
}

export function useCreateInboundRoute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => ivrRoutingRepository.createInboundRoute(payload),
    onSuccess: () => invalidateIvrRouting(qc),
  });
}

export function useUpdateInboundRoute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      ivrRoutingRepository.updateInboundRoute(id, payload),
    onSuccess: () => invalidateIvrRouting(qc),
  });
}

export function useDeleteInboundRoute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ivrRoutingRepository.deleteInboundRoute(id),
    onSuccess: () => invalidateIvrRouting(qc),
  });
}

export function useCreateOutboundRoute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => ivrRoutingRepository.createOutboundRoute(payload),
    onSuccess: () => invalidateIvrRouting(qc),
  });
}

export function useUpdateOutboundRoute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      ivrRoutingRepository.updateOutboundRoute(id, payload),
    onSuccess: () => invalidateIvrRouting(qc),
  });
}

export function useDeleteOutboundRoute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ivrRoutingRepository.deleteOutboundRoute(id),
    onSuccess: () => invalidateIvrRouting(qc),
  });
}

export function useTestRoute() {
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => ivrRoutingRepository.testRoute(payload),
  });
}

export function useTimeConditions() {
  return useQuery({
    queryKey: queryKeys.tenant.timeConditions(),
    queryFn: () => ivrRoutingRepository.getTimeConditions().then((r) => r.data),
  });
}

export function useCreateTimeCondition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => ivrRoutingRepository.createTimeCondition(payload),
    onSuccess: () => invalidateIvrRouting(qc),
  });
}

export function useUpdateTimeCondition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      ivrRoutingRepository.updateTimeCondition(id, payload),
    onSuccess: () => invalidateIvrRouting(qc),
  });
}

export function useDeleteTimeCondition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ivrRoutingRepository.deleteTimeCondition(id),
    onSuccess: () => invalidateIvrRouting(qc),
  });
}

export function useHolidayCalendars() {
  return useQuery({
    queryKey: queryKeys.tenant.holidayCalendars(),
    queryFn: () => ivrRoutingRepository.getHolidayCalendars().then((r) => r.data),
  });
}

export function useCreateHolidayCalendar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => ivrRoutingRepository.createHolidayCalendar(payload),
    onSuccess: () => invalidateIvrRouting(qc),
  });
}

export function useUpdateHolidayCalendar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      ivrRoutingRepository.updateHolidayCalendar(id, payload),
    onSuccess: () => invalidateIvrRouting(qc),
  });
}

export function useDeleteHolidayCalendar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ivrRoutingRepository.deleteHolidayCalendar(id),
    onSuccess: () => invalidateIvrRouting(qc),
  });
}

export function useAnnouncements(category?: string) {
  return useQuery({
    queryKey: queryKeys.tenant.announcements(category),
    queryFn: () => ivrRoutingRepository.getAnnouncements(category).then((r) => r.data),
  });
}

export function useCreateAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => ivrRoutingRepository.createAnnouncement(payload),
    onSuccess: () => invalidateIvrRouting(qc),
  });
}

export function useDeleteAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ivrRoutingRepository.deleteAnnouncement(id),
    onSuccess: () => invalidateIvrRouting(qc),
  });
}

export function useDialPlans() {
  return useQuery({
    queryKey: queryKeys.tenant.dialPlans(),
    queryFn: () => ivrRoutingRepository.getDialPlans().then((r) => r.data),
  });
}

export function useCreateDialPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => ivrRoutingRepository.createDialPlan(payload),
    onSuccess: () => invalidateIvrRouting(qc),
  });
}

export function useDeleteDialPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ivrRoutingRepository.deleteDialPlan(id),
    onSuccess: () => invalidateIvrRouting(qc),
  });
}

export function useTestDialPlan() {
  return useMutation({
    mutationFn: (dialedNumber: string) => ivrRoutingRepository.testDialPlan(dialedNumber),
  });
}
