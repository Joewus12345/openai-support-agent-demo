import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { AppPageShell } from "@/components/app-page-shell";

export default function AdminPage() {
  return (
    <AppPageShell>
      <AdminDashboard />
    </AppPageShell>
  );
}
