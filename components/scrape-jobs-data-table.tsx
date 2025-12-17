"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type ScrapeJobDisplayRow = {
  id: string;
  keywords: string;
  script: React.ReactNode;
  target: React.ReactNode;
  status: React.ReactNode;
  cadence: React.ReactNode;
  timing: React.ReactNode;
  docs: React.ReactNode;
  log: React.ReactNode;
  actions: React.ReactNode;
};

interface ScrapeJobsDataTableProps {
  rows: ScrapeJobDisplayRow[];
  loading?: boolean;
  pageSize?: number;
}

const DEFAULT_PAGE_SIZE = 10;

export function ScrapeJobsDataTable({
  rows,
  loading = false,
  pageSize = DEFAULT_PAGE_SIZE,
}: ScrapeJobsDataTableProps) {
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(0);

  const filteredRows = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) => row.keywords.toLowerCase().includes(term));
  }, [rows, search]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const paginated = filteredRows.slice(
    currentPage * pageSize,
    currentPage * pageSize + pageSize
  );

  const goToPage = (value: number) => {
    setPage(Math.min(Math.max(value, 0), pageCount - 1));
  };

  React.useEffect(() => {
    setPage(0);
  }, [search, rows.length, pageSize]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 px-2 sm:flex-row sm:items-center sm:justify-between sm:px-0">
        <div className="space-y-1">
          <Label className="text-sm font-medium text-muted-foreground" htmlFor="scrape-job-search">
            Search jobs
          </Label>
          <Input
            id="scrape-job-search"
            placeholder="Search by script, target, or status"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full min-w-64 sm:w-80"
          />
        </div>
        <div className="text-sm text-muted-foreground">
          Showing {filteredRows.length} jobs
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border">
        <div className="w-full overflow-auto">
          <Table className="min-w-[960px]">
            <TableHeader className="bg-muted/40 sticky top-0 z-10">
              <TableRow>
                <TableHead>Script</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Cadence &amp; schedule</TableHead>
                <TableHead>Timing</TableHead>
                <TableHead>Docs</TableHead>
                <TableHead>Log snippet</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                    Loading jobs…
                  </TableCell>
                </TableRow>
              ) : paginated.length ? (
                paginated.map((row) => (
                  <TableRow key={row.id} className="align-top hover:bg-muted/50">
                    <TableCell className="min-w-[160px] whitespace-pre-wrap">{row.script}</TableCell>
                    <TableCell className="min-w-[200px] whitespace-pre-wrap">{row.target}</TableCell>
                    <TableCell className="min-w-[120px]">{row.status}</TableCell>
                    <TableCell className="min-w-[240px] whitespace-pre-wrap">{row.cadence}</TableCell>
                    <TableCell className="min-w-[220px] whitespace-pre-wrap">{row.timing}</TableCell>
                    <TableCell className="min-w-[80px]">{row.docs}</TableCell>
                    <TableCell className="min-w-[220px] whitespace-pre-wrap">{row.log}</TableCell>
                    <TableCell className="min-w-[140px] text-right">{row.actions}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                    No jobs found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
      <Separator />
      <div className="flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span>
          Page {currentPage + 1} of {pageCount}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => goToPage(0)}
            disabled={currentPage === 0}
            aria-label="First page"
          >
            «
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage === 0}
            aria-label="Previous page"
          >
            ‹
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage >= pageCount - 1}
            aria-label="Next page"
          >
            ›
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => goToPage(pageCount - 1)}
            disabled={currentPage >= pageCount - 1}
            aria-label="Last page"
          >
            »
          </Button>
        </div>
      </div>
    </div>
  );
}

