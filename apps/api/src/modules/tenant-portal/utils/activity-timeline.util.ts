export type ActivityEvent = {
  id: string;
  action: string;
  label: string;
  detail?: string;
  at: string;
  actorUserId?: string;
};

const ACTION_LABELS: Record<string, string> = {
  'pbx.extension.create': 'Extension Created',
  'pbx.extension.auto_provision': 'Extension Auto-Provisioned',
  'pbx.extension.full_auto_provision': 'Extension Auto-Provisioned',
  'pbx.extension.rename': 'Extension Renamed',
  'pbx.extension.update': 'Extension Updated',
  'pbx.extension.delete': 'Extension Deleted',
  'pbx.extension.reset': 'Extension Reset',
  'pbx.extension.disable': 'Extension Disabled',
  'pbx.extension.enable': 'Extension Enabled',
  'pbx.extension.archive': 'Extension Archived',
  'pbx.extension.unarchive': 'Extension Restored',
  'pbx.extension.did_unassign': 'DID Removed',
  'pbx.extension.user_assign': 'User Assigned',
  'pbx.extension.user_remove': 'User Unassigned',
  'pbx.did.assign': 'DID Assigned',
  'pbx.line.create': 'Extension Created',
  'pbx.line.update': 'Configuration Updated',
  'pbx.line.delete': 'Extension Deleted',
  'pbx.device.create': 'Device Added',
  'pbx.device.create.enroll': 'Device Added',
  'pbx.device.enroll': 'Device Added',
  'pbx.device.update': 'Device Updated',
  'pbx.device.assign': 'Device Assigned',
  'pbx.device.unassign': 'Device Unassigned',
  'pbx.device.deactivate': 'Device Deactivated',
  'pbx.device.activate': 'Device Activated',
  'pbx.device.make_primary': 'Primary Device Changed',
  'pbx.device.delete': 'Device Removed',
  'pbx.device.reprovision': 'Provisioning Updated',
  'pbx.device.config_rollback': 'Provisioning Rolled Back',
  'pbx.device.move_site': 'Device Moved',
  'pbx.sip.reveal_password': 'SIP Password Viewed',
  'pbx.sip.reset_password': 'SIP Password Reset',
  'pbx.voicemail.create': 'Voicemail Enabled',
  'pbx.voicemail.update': 'Voicemail Updated',
  'pbx.voicemail.delete': 'Voicemail Disabled',
  'pbx.voicemail.greeting.upsert': 'Voicemail Greeting Updated',
  'pbx.recording_policy.create': 'Recording Enabled',
  'pbx.recording_policy.update': 'Recording Policy Updated',
  'pbx.recording_policy.delete': 'Recording Disabled',
  'pbx.provision.commit': 'Provisioning Updated',
};

/** Maps an audit action string to a friendly timeline label; falls back to a title-cased action. */
export function describeAuditAction(action: string): string {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  const tail = action.split('.').pop() ?? action;
  return tail
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
