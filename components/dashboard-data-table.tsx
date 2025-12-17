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
  DrawerTrigger,
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
  const [selectedFile, setSelectedFile] = React.useState<string | null>(null);
  const [fileContents, setFileContents] = React.useState<Record<string, string>>({});
  const [loadingContent, setLoadingContent] = React.useState(false);

  const loadFile = async (file: DashboardFileRow) => {
    if (fileContents[file.name]) return;
    try {
      setLoadingContent(true);
      const response = await fetch(`/knowledge_base/${file.name}`);
      const text = await response.text();
      setFileContents((prev) => ({ ...prev, [file.name]: text }));
    } catch (error) {
      console.error("Failed to load file", error);
    } finally {
      setLoadingContent(false);
    }
  };

  const renderFileDrawer = (file: DashboardFileRow) => (
    <Drawer key={file.name} onOpenChange={(open) => open && void loadFile(file)}>
      <DrawerTrigger asChild>
        <Button
          variant="link"
          className="px-0 text-left font-medium text-foreground"
          onClick={() => setSelectedFile(file.name)}
        >
          {file.name}
        </Button>
      </DrawerTrigger>
      <DrawerContent className="max-h-[80vh] overflow-y-auto">
        <DrawerHeader className="gap-1">
          <DrawerTitle>{file.name}</DrawerTitle>
          <DrawerDescription>Markdown preview</DrawerDescription>
        </DrawerHeader>
        <div className="px-4 pb-6">
          {loadingContent && selectedFile === file.name && !fileContents[file.name] ? (
            <p className="text-sm text-muted-foreground">Loading content…</p>
          ) : fileContents[file.name] ? (
            <ReactMarkdown className="prose prose-sm max-w-none break-words">
              {fileContents[file.name]}
            </ReactMarkdown>
          ) : (
            <p className="text-sm text-muted-foreground">
              Open the file name to preview its contents.
            </p>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Operational overview</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="jobs" className="space-y-4">
          <TabsList>
            <TabsTrigger value="jobs">Scrape jobs</TabsTrigger>
            <TabsTrigger value="kb">Knowledge base</TabsTrigger>
          </TabsList>
          <TabsContent value="jobs" className="space-y-3">
            <div className="overflow-hidden rounded-lg border">
              <div className="w-full overflow-x-auto">
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
                  <TableBody>
                    {loadingJobs ? (
                      <TableRow>
                        <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                          Loading jobs…
                        </TableCell>
                      </TableRow>
                    ) : jobs.length ? (
                      jobs.map((job) => (
                        <TableRow key={job.id} className="hover:bg-muted/50">
                          <TableCell className="font-medium text-foreground">{job.script}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize text-muted-foreground px-2">
                              {job.status.replace(/_/g, " ")}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {job.target || "—"}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {job.createdAt}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {job.finishedAt || "—"}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                          No job history found.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="kb" className="space-y-3">
            <div className="overflow-hidden rounded-lg border">
              <div className="w-full overflow-x-auto">
                <Table className="min-w-[720px]">
                  <TableHeader className="bg-muted/40">
                    <TableRow>
                      <TableHead className="min-w-[280px]">File name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>Updated</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingFiles ? (
                      <TableRow>
                        <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                          Loading files…
                        </TableCell>
                      </TableRow>
                    ) : files.length ? (
                      files.map((file) => (
                        <TableRow key={file.name} className="hover:bg-muted/50">
                          <TableCell className="font-medium text-foreground">
                            {renderFileDrawer(file)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="px-2 text-muted-foreground">
                              {file.type || "md"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {humanFileSize(file.size)}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {file.modifiedAt}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                          No files available.
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
  );
}

export function DashboardDataTableSkeleton() {
  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Operational overview</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs defaultValue="jobs">
          <TabsList>
            <TabsTrigger value="jobs">Scrape jobs</TabsTrigger>
            <TabsTrigger value="kb">Knowledge base</TabsTrigger>
          </TabsList>
          <TabsContent value="jobs" className="space-y-3">
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableBody>
                  {Array.from({ length: 4 }).map((_, index) => (
                    <TableRow key={`job-skeleton-${index}`}>
                      <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
          <TabsContent value="kb" className="space-y-3">
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableBody>
                  {Array.from({ length: 4 }).map((_, index) => (
                    <TableRow key={`kb-skeleton-${index}`}>
                      <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
