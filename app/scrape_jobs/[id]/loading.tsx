import { AppPageShell } from "@/components/app-page-shell";
import { ScrapeJobDetailSkeleton } from "@/components/loading/scrape-job-detail-skeleton";

export default function ScrapeJobDetailLoading() {
  return <AppPageShell><ScrapeJobDetailSkeleton /></AppPageShell>;
}
