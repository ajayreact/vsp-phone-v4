import { SettingsPlaceholderContent } from '../../../../components/modules/settings/SettingsPlaceholderContent';

export default function SettingsDangerZonePage() {
  return (
    <SettingsPlaceholderContent
      moduleId="settings-danger-zone"
      note="Destructive tenant lifecycle actions are Platform Admin only in this pilot. No tenant self-service delete/reset is exposed here."
    />
  );
}
