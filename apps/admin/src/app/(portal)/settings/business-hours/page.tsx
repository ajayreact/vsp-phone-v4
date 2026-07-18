import { SettingsPlaceholderContent } from '../../../../components/modules/settings/SettingsPlaceholderContent';

export default function SettingsBusinessHoursPage() {
  return (
    <SettingsPlaceholderContent
      moduleId="settings-business-hours"
      note="Business hours configuration will be expanded here. Site-level hours are available under Sites."
      relatedHref="/settings/sites"
      relatedLabel="Settings → Sites"
    />
  );
}
