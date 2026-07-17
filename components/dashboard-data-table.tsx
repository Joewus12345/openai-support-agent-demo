"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { authFetch } from "@/lib/client/authFetch";

export type DashboardJobRow = {
  id: string;
  script: string;
  status: string;
  target: string;
  createdAt: string;
  finishedAt: string | null;
};

export type DashboardFileRow = {
  name: string;
  size: number;
  modifiedAt: string;
  type: string;
};

const humanFileSize = (size: number) => {
  if (size < 1024) return `${size} B`;
  const kb = size / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
};

function JobRows({ jobs, loading }: { jobs: DashboardJobRow[]; loading: boolean }) {
  if (loading) {
    return Array.from({ length: 5 }).map((_, index) => (
      <TableRow key={`job-loading-${index}`}>
        <TableCell><Skeleton className="h-4 w-28" /></TableCell>
        <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
        <TableCell><Skeleton className="h-4 w-40" /></TableCell>
        <TableCell><Skeleton className="h-4 w-28" /></TableCell>
        <TableCell><Skeleton className="h-4 w-28" /></TableCell>
      </TableRow>
    ));
  }
  if (!jobs.length) {
    return (
      <TableRow>
        <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
          No scrape jobs have been created for this account.
        </TableCell>
      </TableRow>
    );
  }
  return jobs.map((job) => (
    <TableRow key={job.id} className="hover:bg-muted/50">
      <TableCell className="max-w-56 truncate font-medium text-foreground">{job.script}</TableCell>
      <TableCell>
        <Badge variant="outline" className="capitalize text-muted-foreground">
          {job.status.replace(/_/gu, " ")}
        </Badge>
      </TableCell>
      <TableCell className="max-w-72 truncate text-sm text-muted-foreground" title={job.target || undefined}>
        {job.target || "—"}
      </TableCell>
      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{job.createdAt}</TableCell>
      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{job.finishedAt || "—"}</TableCell>
    </TableRow>
  ));
}

export function DashboardDataTable({
  jobs,
  files,
  loadingJobs = false,
  loadingFiles = false,
}: {
  jobs: DashboardJobRow[];
  files: DashboardFileRow[];
  loadingJobs?: boolean;
  loadingFiles?: boolean;
}) {
  const [selectedFile, setSelectedFile] = React.useState<DashboardFileRow | null>(null);
  const [fileContents, setFileContents] = React.useState<Record<string, string>>({});
  const [loadingContent, setLoadingContent] = React.useState(false);

  const openFile = async (file: DashboardFileRow) => {
    setSelectedFile(file);
    if (fileContents[file.name]) return;
    try {
      setLoadingContent(true);
      const response = await authFetch(
        `/api/knowledge/files/${encodeURIComponent(file.name)}?folder=knowledge_base`
      );
      if (!response.ok) throw new Error("Unable to load document preview");
      const text = await response.text();
      setFileContents((previous) => ({ ...previous, [file.name]: text }));
    } catch (error) {
      console.error("Failed to load file", error);
    } finally {
      setLoadingContent(false);
    }
  };

  return (
    <>
      <Card className="min-w-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg text-pretty">Operational Overview</CardTitle>
        </CardHeader>
        <CardContent className="min-w-0">
          <Tabs defaultValue="jobs" className="min-w-0 space-y-4">
            <TabsList className="grid w-full grid-cols-2 sm:w-fit sm:min-w-72">
              <TabsTrigger value="jobs">Scrape Jobs</TabsTrigger>
              <TabsTrigger value="kb">Knowledge Base</TabsTrigger>
            </TabsList>
            <TabsContent value="jobs" className="min-w-0 space-y-3">
              <div className="overflow-hidden rounded-lg border">
                <div className="w-full overflow-x-auto overscroll-x-contain">
                  <Table className="min-w-[820px]">
                    <TableHeader className="bg-muted/40">
                      <TableRow>
                        <TableHead className="min-w-[160px]">Script</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="min-w-[200px]">Target</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Finished</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody><JobRows jobs={jobs} loading={loadingJobs} /></TableBody>
                  </Table>
                </div>
              </div>
            </TabsContent>
            <TabsContent value="kb" className="min-w-0 space-y-3">
              <div className="overflow-hidden rounded-lg border">
                <div className="w-full overflow-x-auto overscroll-x-contain">
                  <Table className="min-w-[680px]">
                    <TableHeader className="bg-muted/40">
                      <TableRow>
                        <TableHead className="min-w-[280px]">File Name</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Size</TableHead>
                        <TableHead>Updated</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loadingFiles ? (
                        Array.from({ length: 5 }).map((_, index) => (
                          <TableRow key={`file-loading-${index}`}>
                            <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                            <TableCell><Skeleton className="h-5 w-12 rounded-full" /></TableCell>
                            <TableCell><Skeleton className="h-4 w-14" /></TableCell>
                            <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                          </TableRow>
                        ))
                      ) : files.length ? (
                        files.map((file) => (
                          <TableRow key={file.name} className="hover:bg-muted/50">
                            <TableCell className="max-w-80">
                              <Button
                                variant="link"
                                className="h-auto max-w-full justify-start px-0 text-left font-medium text-foreground"
                                onClick={() => void openFile(file)}
                              >
                                <span className="truncate">{file.name}</span>
                              </Button>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-muted-foreground">
                                {file.type || "md"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground tabular-nums">
                              {humanFileSize(file.size)}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                              {file.modifiedAt}
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                            No knowledge files have been added to this account.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Drawer open={Boolean(selectedFile)} onOpenChange={(open) => !open && setSelectedFile(null)}>
        <DrawerContent className="max-h-[85vh] overscroll-contain">
          <DrawerHeader className="gap-1 text-left">
            <DrawerTitle className="break-words">{selectedFile?.name ?? "Document Preview"}</DrawerTitle>
            <DrawerDescription>Account-private Markdown preview</DrawerDescription>
          </DrawerHeader>
          <div className="overflow-y-auto overscroll-contain px-4 pb-8">
            {loadingContent && selectedFile && !fileContents[selectedFile.name] ? (
              <div className="space-y-3" aria-label="Loading document preview" aria-busy="true">
                <Skeleton className="h-7 w-2/3" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-32 w-full" />
              </div>
            ) : selectedFile && fileContents[selectedFile.name] ? (
              <ReactMarkdown className="prose prose-sm max-w-none break-words">
                {fileContents[selectedFile.name]}
              </ReactMarkdown>
            ) : (
              <p className="text-sm text-muted-foreground">The file content is unavailable.</p>
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}

export function DashboardDataTableSkeleton() {
  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3"><CardTitle className="text-lg">Operational Overview</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <Skeleton className="h-9 w-72" />
        <div className="overflow-hidden rounded-lg border p-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="grid grid-cols-5 gap-4 border-b py-3 last:border-0">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
