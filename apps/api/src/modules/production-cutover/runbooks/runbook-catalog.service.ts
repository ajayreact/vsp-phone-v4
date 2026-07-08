import { Injectable } from '@nestjs/common';
import type { ChecklistItem, CutoverPhase } from '../types/cutover.types';

/** Phase 20 — predefined operational checklist templates. */
@Injectable()
export class RunbookCatalogService {
  getTemplate(phase: CutoverPhase): ChecklistItem[] {
    const templates: Record<CutoverPhase, ChecklistItem[]> = {
      pre_cutover: [
        this.item('pc-01', 'Confirm Phase 18 production readiness green', 'Platform Ops'),
        this.item('pc-02', 'Run Phase 19 migration dry-run for pilot tenant', 'Migration Lead'),
        this.item('pc-03', 'Export config snapshot and verify backup location', 'Platform Ops'),
        this.item('pc-04', 'Validate TLS certificates and expiry dates', 'Security'),
        this.item('pc-05', 'Confirm Telnyx webhook and carrier routing', 'Telecom Ops'),
        this.item('pc-06', 'Notify NOC and stakeholders of cutover window', 'Project Manager'),
        this.item('pc-07', 'Verify observability dashboards and alerts', 'NOC'),
      ],
      migration: [
        this.item('mg-01', 'Execute migration import batch (Redis staging)', 'Migration Lead'),
        this.item('mg-02', 'Verify migration batch verification report', 'Migration Lead'),
        this.item('mg-03', 'Validate DID assignments against carrier inventory', 'Telecom Ops'),
        this.item('mg-04', 'Confirm SIP account mappings', 'Telecom Ops'),
        this.item('mg-05', 'Stage Grandstream provisioning profiles', 'Provisioning Ops'),
        this.item('mg-06', 'Run cutover smoke tests', 'QA / NOC'),
      ],
      post_cutover: [
        this.item('po-01', 'Execute full smoke test suite', 'QA / NOC'),
        this.item('po-02', 'Verify inbound and outbound call paths', 'Telecom Ops'),
        this.item('po-03', 'Confirm WebRTC and desk phone registration', 'Telecom Ops'),
        this.item('po-04', 'Validate IVR, queue, and feature codes', 'PBX Ops'),
        this.item('po-05', 'Verify recording and presence indicators', 'PBX Ops'),
        this.item('po-06', 'Sign off go-live checklist with stakeholders', 'Project Manager'),
        this.item('po-07', 'Begin hypercare monitoring (7 days)', 'NOC'),
      ],
      rollback: [
        this.item('rb-01', 'Declare rollback decision with incident commander', 'Project Manager'),
        this.item('rb-02', 'Restore legacy platform traffic routing', 'Telecom Ops'),
        this.item('rb-03', 'Revert DID routing to legacy carrier config', 'Telecom Ops'),
        this.item('rb-04', 'Notify customers of service restoration timeline', 'Support'),
        this.item('rb-05', 'Capture migration batch IDs and failure analysis', 'Migration Lead'),
        this.item('rb-06', 'Run post-rollback verification on legacy platform', 'QA / NOC'),
      ],
    };
    return templates[phase].map((i) => ({ ...i }));
  }

  getAllPhases(): CutoverPhase[] {
    return ['pre_cutover', 'migration', 'post_cutover', 'rollback'];
  }

  private item(id: string, description: string, owner: string): ChecklistItem {
    return { id, description, owner, status: 'pending' };
  }
}
