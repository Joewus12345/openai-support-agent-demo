"use client";

import { Link as LinkIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";

import ChatImage from "./ChatImage";
import ImageModal from "./ImageModal";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Separator } from "./ui/separator";
import { Skeleton } from "./ui/skeleton";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { cn } from "@/lib/utils";
import { ImageProps } from "next/image";
import { authFetch } from "@/lib/client/authFetch";
import { useSessionStore } from "@/stores/useSessionStore";

const articleDateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

type FileMetadata = {
  name: string;
  size: number;
  createdAt: string;
  modifiedAt: string;
  type: string;
};

const PAGE_SIZE = 10;

const getFileId = (file: FileMetadata) =>
  file.name.replace(/\.([^.]+)$/u, "") || file.name;

const markdownComponents: Components = {
  img: (props) => (
    <ImageModal src={(props.src as string) ?? ""}>
      <ChatImage
        {...(props as unknown as ImageProps)}
        alt={props.alt || "image"}
        className="cursor-pointer rounded-md object-cover"
      />
    </ImageModal>
  ),
  a: ({ node, ...props }) => {
    void node;
    return (
      <a {...props} target="_blank" rel="noopener noreferrer">
        {props.children}
      </a>
    );
  },
};

export default function ListArticles({
  title,
  page,
  folder,
}: {
  title: string;
  page: string;
  folder: string;
}) {
  const accountId = useSessionStore((state) => state.activeAccount?.id);
  const [files, setFiles] = useState<FileMetadata[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fileContents, setFileContents] = useState<Record<string, string>>({});
  const [loadingContent, setLoadingContent] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(true);

  const getLink = useCallback(
    (section: string) => {
      const url = new URL(
        `/${page}?section=${section}`,
        window.location.origin
      );
      navigator.clipboard.writeText(url.toString());
    },
    [page]
  );

  useEffect(() => {
    const fetchFiles = async () => {
      try {
        setLoadingFiles(true);
        const response = await authFetch(`/api/list_files?folder=${folder}&limit=100`);
        const payload = await response.json();
        const metadata = (payload?.files as FileMetadata[]) ?? [];
        metadata.sort((a, b) => a.name.localeCompare(b.name));
        setFiles(metadata);

        const urlParams = new URLSearchParams(window.location.search);
        const section = urlParams.get("section");
        if (section) {
          setSelectedId(section);
          const index = metadata.findIndex(
            (file) => getFileId(file) === section
          );
          if (index >= 0) {
            setPageIndex(Math.floor(index / PAGE_SIZE));
          }
        }
      } catch (error) {
        console.error("Error fetching files or contents:", error);
      } finally {
        setLoadingFiles(false);
      }
    };

    fetchFiles();
  }, [accountId, folder]);

  useEffect(() => {
    if (!selectedId) return;
    const selectedFile = files.find((file) => getFileId(file) === selectedId);
    if (!selectedFile || fileContents[selectedId]) return;

    const fetchContent = async () => {
      try {
        setLoadingContent(true);
        const fileResponse = await authFetch(
          `/api/knowledge/files/${encodeURIComponent(selectedFile.name)}?folder=${encodeURIComponent(folder)}`
        );
        const text = await fileResponse.text();
        setFileContents((prev) => ({ ...prev, [selectedId]: text }));
      } catch (error) {
        console.error("Error fetching file content:", error);
      } finally {
        setLoadingContent(false);
      }
    };

    void fetchContent();
  }, [selectedId, files, folder, fileContents]);

  const paginatedFiles = useMemo(() => {
    const start = pageIndex * PAGE_SIZE;
    return files.slice(start, start + PAGE_SIZE);
  }, [files, pageIndex]);

  const totalPages = Math.max(1, Math.ceil(files.length / PAGE_SIZE));
  const selectedFile = files.find((file) => getFileId(file) === selectedId);
  const selectedContent = selectedId ? fileContents[selectedId] : null;

  const totalSize = files.reduce((acc, file) => acc + file.size, 0);

  const humanFileSize = (size: number) => {
    if (size < 1024) return `${size} B`;
    const kb = size / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  };

  const renderedContent = useMemo(() => {
    if (!selectedContent) return null;
    const [firstLine, ...rest] = selectedContent.split("\n");
    const contentBody = rest.join("\n");
    const cleanedTitle = firstLine.replace(/^#+\s*/, "");

    return (
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <div className="text-lg font-semibold leading-tight">
              {cleanedTitle || selectedFile?.name || "Untitled"}
            </div>
            {selectedFile ? (
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="secondary" className="capitalize">
                  {selectedFile.type || "md"}
                </Badge>
                <span>{humanFileSize(selectedFile.size)}</span>
                <span>
                  Updated {articleDateFormatter.format(new Date(selectedFile.modifiedAt))}
                </span>
              </div>
            ) : null}
          </div>
          {selectedId ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => getLink(selectedId)}
              aria-label="Copy link to this article"
            >
              <LinkIcon className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
        <Separator />
        <ReactMarkdown
          components={markdownComponents}
          className="prose prose-sm max-w-none text-muted-foreground"
        >
          {contentBody}
        </ReactMarkdown>
      </div>
    );
  }, [selectedContent, selectedFile, selectedId, getLink]);

  const layoutHasDetail = Boolean(
    selectedFile && (selectedContent || loadingContent)
  );

  return (
    <div className="w-full space-y-4 p-4">
      <div className="flex flex-wrap justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold leading-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">
            Browse account knowledge files and preview content without leaving
            the table.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="secondary">{files.length} files</Badge>
          <Badge variant="outline">{humanFileSize(totalSize)}</Badge>
        </div>
      </div>

      <div
        className={cn(
          "grid gap-4",
          layoutHasDetail ? "lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]" : ""
        )}
      >
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Knowledge base files</CardTitle>
            <CardDescription>
              Showing {PAGE_SIZE} files per page
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableCaption className="sr-only">
                  Knowledge base files
                </TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[160px]">Name</TableHead>
                    <TableHead className="w-24">Type</TableHead>
                    <TableHead className="w-28">Size</TableHead>
                    <TableHead className="min-w-[160px]">Created</TableHead>
                    <TableHead className="min-w-[160px]">Modified</TableHead>
                    <TableHead className="w-20 text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingFiles ? (
                    Array.from({ length: 7 }).map((_, index) => (
                      <TableRow key={`article-loading-row-${index}`}>
                        <TableCell><Skeleton className="h-4 w-44" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-14" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                        <TableCell className="text-right"><Skeleton className="ml-auto h-8 w-14" /></TableCell>
                      </TableRow>
                    ))
                  ) : paginatedFiles.length ? (
                    paginatedFiles.map((file) => {
                      const id = getFileId(file);
                      const fileIndex = files.findIndex(
                        (entry) => getFileId(entry) === id
                      );
                      const isSelected = id === selectedId;
                      return (
                        <TableRow
                          key={id}
                          data-state={isSelected ? "selected" : undefined}
                          className={cn(isSelected ? "bg-primary/5" : "")}
                        >
                          <TableCell className="font-medium">
                            {file.name}
                          </TableCell>
                          <TableCell className="capitalize text-muted-foreground">
                            {file.type || "md"}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {humanFileSize(file.size)}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {articleDateFormatter.format(new Date(file.createdAt))}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {articleDateFormatter.format(new Date(file.modifiedAt))}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2"
                              onClick={() => {
                                if (fileIndex >= 0) {
                                  setPageIndex(Math.floor(fileIndex / PAGE_SIZE));
                                }
                                setSelectedId(id);
                              }}
                            >
                              View
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="py-6 text-center text-sm text-muted-foreground"
                      >
                        No files found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
              <span>
                Page {pageIndex + 1} of {totalPages}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPageIndex((prev) => Math.max(0, prev - 1))}
                  disabled={pageIndex === 0}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setPageIndex((prev) => Math.min(totalPages - 1, prev + 1))
                  }
                  disabled={pageIndex >= totalPages - 1}
                >
                  Next
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {layoutHasDetail ? (
          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Preview</CardTitle>
              <CardDescription>Selected article</CardDescription>
            </CardHeader>
            <CardContent className="min-h-[320px] space-y-3">
              {loadingContent && !selectedContent ? (
                <div className="min-h-[240px] space-y-4" aria-label="Loading article preview" aria-busy="true">
                  <Skeleton className="h-7 w-3/4" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-5/6" />
                  <Skeleton className="h-4 w-11/12" />
                  <Skeleton className="h-28 w-full" />
                </div>
              ) : selectedContent ? (
                renderedContent
              ) : (
                <p className="text-sm text-muted-foreground">
                  Select a file to preview its contents.
                </p>
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
