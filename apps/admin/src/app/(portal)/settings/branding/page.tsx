import { SettingsPlaceholderContent } from '../../../../components/modules/settings/SettingsPlaceholderContent';

export default function SettingsBrandingPage() {
  return (
    <SettingsPlaceholderContent
      moduleId="settings-branding"
      note="Dedicated branding workspace for RC1+. Brand colors are editable on the Company profile today."
      relatedHref="/settings/company"
      relatedLabel="Settings → Company"
    />
  );
}
