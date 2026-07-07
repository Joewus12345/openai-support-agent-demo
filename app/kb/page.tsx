"use client";
import ListArticles from "@/components/ListArticles";
import { AppPageShell } from "@/components/app-page-shell";
import { DataTable } from "@/components/data-table";
import datatable from "@/app/dashboard/data.json";

// Page showing all knowledge base articles in /knowledge_base folder
export default function KnowledgeBasePage() {
  return (
    <AppPageShell>
      <ListArticles
        page="kb"
        folder="knowledge_base"
        title="Internal Knowledge Base"
      />
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <DataTable data={datatable} />
      </div>
    </AppPageShell>
  );
}
