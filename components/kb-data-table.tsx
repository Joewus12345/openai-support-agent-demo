"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import useSWR from "swr";

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
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { authFetch } from "@/lib/client/authFetch";
import { useSessionStore } from "@/stores/useSessionStore";

const PAGE_SIZE = 10;

type FileMetadata = {
  name: string;
  size: number;
  createdAt: string;
  modifiedAt: string;
  type: string;
};

type FileResponse = {
  files: FileMetadata[];
  total: number;
  page: number;
  pageSize: number;
};

async function fetcher(url: string) {
  const response = await authFetch(url, { headers: { Accept: "application/json" } });
  const payload = (await response.json().catch(() => null)) as FileResponse | { error?: string } | null;
  if (!response.ok) {
    throw new Error((payload as { error?: string } | null)?.error || "Unable to load files");
  }
  return payload as FileResponse;
}

const humanFileSize = (size: number) => {
  if (size < 1024) return `${size} B`;
  const kb = size / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
};

export function KnowledgeBaseDataTable({ folder = "knowledge_base" }: { folder?: string }) {
  const accountId = useSessionStore((state) => state.activeAccount?.id);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [fileContents, setFileContents] = React.useState<Record<string, string>>({});
  const [loadingContent, setLoadingContent] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const deferredSearch = React.useDeferredValue(search);
  const [page, setPage] = React.useState(0);
  const requestUrl = accountId
    ? `/api/list_files?folder=${encodeURIComponent(folder)}&page=${page + 1}&limit=${PAGE_SIZE}&search=${encodeURIComponent(deferredSearch)}`
    : null;
  const { data, error, isLoading } = useSWR<FileResponse>(requestUrl, fetcher, {
    keepPreviousData: true,
  });

  React.useEffect(() => {
    setPage(0);
    setSelectedId(null);
    setFileContents({});
  }, [accountId, folder]);

  const files = data?.files ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const selectedFile = files.find((file) => file.name === selectedId) ?? null;

  const loadContent = React.useCallback(
    async (file: FileMetadata) => {
      if (fileContents[file.name]) return;
      try {
        setLoadingContent(true);
        const response = await authFetch(
          `/api/knowledge/files/${encodeURIComponent(file.name)}?folder=${encodeURIComponent(folder)}`
        );
        if (!response.ok) throw new Error("Unable to load file content");
        const content = await response.text();
        setFileContents((previous) => ({ ...previous, [file.name]: content }));
      } catch (loadError) {
        console.error("Error loading content", loadError);
      } finally {
        setLoadingContent(false);
      }
    },
    [fileContents, folder]
  );

  const openPreview = (file: FileMetadata) => {
    setSelectedId(file.name);
    void loadContent(file);
  };

  return (
    <>
      <Card className="shadow-sm">
        <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <CardTitle className="text-lg text-pretty">Knowledge Base Files</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Private documents for the active account.
            </p>
          </div>
          <Input
            name="knowledge-search"
            aria-label="Search knowledge base files"
            autoComplete="off"
            placeholder="Search files…"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
            }}
            className="w-full min-w-0 sm:w-64"
          />
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="overflow-hidden rounded-lg border">
            <div className="w-full overflow-x-auto">
              <Table className="text-sm">
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead className="w-[40%] min-w-[160px]">File Name</TableHead>
                    <TableHead className="min-w-[80px]">Type</TableHead>
                    <TableHead className="min-w-[80px]">Size</TableHead>
                    <TableHead className="min-w-[120px]">Created</TableHead>
                    <TableHead className="min-w-[120px]">Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && !data ? (
                    Array.from({ length: 7 }).map((_, index) => (
                      <TableRow key={`kb-loading-row-${index}`}>
                        <TableCell><Skeleton className="h-4 w-44" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-12 rounded-full" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-14" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                      </TableRow>
                    ))
                  ) : error ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-sm text-destructive">
                        {error.message}
                      </TableCell>
                    </TableRow>
                  ) : files.length ? (
                    files.map((file) => (
                      <TableRow key={file.name} className="hover:bg-muted/60">
                        <TableCell className="max-w-[22rem] align-middle">
                          <Button
                            variant="link"
                            className="h-auto max-w-full justify-start px-0 text-left font-medium text-foreground"
                            onClick={() => openPreview(file)}
                          >
                            <span className="truncate">{file.name}</span>
                          </Button>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="px-1.5 text-muted-foreground">
                            {file.type || "md"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground tabular-nums">
                          {humanFileSize(file.size)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(file.createdAt))}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(file.modifiedAt))}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                        {deferredSearch ? "No matching files found." : "No files have been added to this account."}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
          <div className="flex flex-col gap-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span className="tabular-nums">{total} files</span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((current) => Math.max(0, current - 1))}
                disabled={page === 0}
              >
                Previous
              </Button>
              <span className="px-1 text-sm font-medium tabular-nums">
                Page {Math.min(page + 1, totalPages)} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))}
                disabled={page >= totalPages - 1}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Drawer open={Boolean(selectedFile)} onOpenChange={(open) => !open && setSelectedId(null)}>
        <DrawerContent className="max-h-[85vh] overscroll-contain">
          <DrawerHeader className="gap-1 text-left">
            <DrawerTitle className="break-words">{selectedFile?.name ?? "Document Preview"}</DrawerTitle>
            <DrawerDescription>Account-private Markdown preview</DrawerDescription>
          </DrawerHeader>
          <div className="overflow-y-auto overscroll-contain px-4 pb-8 text-sm">
            {loadingContent && selectedFile && !fileContents[selectedFile.name] ? (
              <div className="space-y-3" aria-label="Loading file preview" aria-busy="true">
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
              <p className="text-muted-foreground">The file content is unavailable.</p>
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
