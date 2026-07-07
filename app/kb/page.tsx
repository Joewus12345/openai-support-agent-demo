"use client";

import { AppPageShell } from "@/components/app-page-shell";
import { KnowledgeBaseDataTable } from "@/components/kb-data-table";

export default function KnowledgeBasePage() {
  return (
    <AppPageShell>
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <KnowledgeBaseDataTable />
      </div>
    </AppPageShell>
  );
}

