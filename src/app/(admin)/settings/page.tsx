import { AdminShell } from "@/components/admin/AdminShell";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { PromptRegistrySettings } from "@/components/admin/PromptRegistrySettings";

export const metadata = { title: "Internal settings" };

export default function SettingsPage() {
  return (
    <AdminShell>
      <AdminPageHeader
        eyebrow="Settings"
        title="Internal settings"
        description="Feature flags, thresholds, prompt versions, and broker-tunable knobs. Typed schema, audited writes, and explicit AI prompt provenance."
      />
      <PromptRegistrySettings />
    </AdminShell>
  );
}
