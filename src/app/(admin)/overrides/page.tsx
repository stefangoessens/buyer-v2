import { AdminShell } from "@/components/admin/AdminShell";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";

export const metadata = { title: "Manual overrides" };

/**
 * Manual overrides landing. KIN-799 owns the forms and audit table.
 * Admin-only by virtue of sidebar gating plus the role guard on the
 * underlying Convex mutations (not yet written — card blocked on 797).
 */
export default function OverridesIndexPage() {
  return (
    <AdminShell>
      <AdminPageHeader
        eyebrow="Ops tools"
        title="Manual overrides"
        description="Audited manual changes with structured reason capture. Only admins can execute overrides."
      />
      <AdminEmptyState
        title="No overrides yet"
        description="KIN-799 adds the structured reason form and the before/after audit trail table."
      />
    </AdminShell>
  );
}
