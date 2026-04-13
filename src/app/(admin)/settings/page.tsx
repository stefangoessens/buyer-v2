import { AdminShell } from "@/components/admin/AdminShell";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";

export const metadata = { title: "Internal settings" };

/**
 * Settings landing. KIN-807 fills this with the typed schema editor,
 * audit history, and role-gated writes.
 */
export default function SettingsPage() {
  return (
    <AdminShell>
      <AdminPageHeader
        eyebrow="Settings"
        title="Internal settings"
        description="Feature flags, thresholds, and broker-tunable knobs. Typed schema, audited writes, role-aware access."
      />
      <AdminEmptyState
        title="No settings bound yet"
        description="KIN-807 lands the typed settings table and the audit history view."
      />
    </AdminShell>
  );
}
