import { AdminPanelSkeleton } from "@/components/admin/admin-shared";
import { AppPageShell } from "@/components/app-page-shell";

export default function AdminLoading() {
  return <AppPageShell><AdminPanelSkeleton /></AppPageShell>;
}
