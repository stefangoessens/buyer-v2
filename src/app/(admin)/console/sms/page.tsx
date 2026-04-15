"use client";

import { AdminShell } from "@/components/admin/AdminShell";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { SmsActivityTab } from "@/components/admin/SmsActivityTab";

export default function ConsoleSmsPage() {
  return (
    <AdminShell>
      <AdminPageHeader
        eyebrow="SMS"
        title="SMS activity"
        description="Monitor inbound listing texts, outbound delivery state, matched buyers, and the manual tools ops needs when a message needs intervention."
      />
      <SmsActivityTab />
    </AdminShell>
  );
}
