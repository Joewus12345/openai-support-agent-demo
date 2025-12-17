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
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const PAGE_SIZE = 10;

type FileMetadata = {
  name: string;
  size: number;
  createdAt: string;
  modifiedAt: string;
  type: string;
};

const getFileId = (file: FileMetadata) => file.name;

const humanFileSize = (size: number) => {
  if (size < 1024) return `${size} B`;
  const kb = size / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
};

export function KnowledgeBaseDataTable({ folder = "knowledge_base" }: { folder?: string }) {
  const [files, setFiles] = React.useState<FileMetadata[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [fileContents, setFileContents] = React.useState<Record<string, string>>({});
  const [loadingFiles, setLoadingFiles] = React.useState(true);
  const [loadingContent, setLoadingContent] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(0);

  React.useEffect(() => {
    const fetchFiles = async () => {
      try {
        setLoadingFiles(true);
        const response = await fetch(`/api/list_files?folder=${folder}`);
        const payload = await response.json();
        const metadata = (payload?.files as FileMetadata[]) ?? [];
        metadata.sort((a, b) => a.name.localeCompare(b.name));
        setFiles(metadata);
      } catch (error) {
        console.error("Error fetching files", error);
      } finally {
        setLoadingFiles(false);
      }
    };

    void fetchFiles();
  }, [folder]);

  const filteredFiles = React.useMemo(() => {
    const term = search.toLowerCase();
    return files.filter((file) => file.name.toLowerCase().includes(term));
  }, [files, search]);

  const totalPages = Math.max(1, Math.ceil(filteredFiles.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const paginatedFiles = filteredFiles.slice(
    currentPage * PAGE_SIZE,
    currentPage * PAGE_SIZE + PAGE_SIZE
  );

  const loadContent = React.useCallback(
    async (fileId: string) => {
      if (fileContents[fileId]) return;
      const file = files.find((entry) => getFileId(entry) === fileId);
      if (!file) return;

      try {
        setLoadingContent(true);
        const content = await fetch(`/${folder}/${file.name}`).then((res) => res.text());
        setFileContents((prev) => ({ ...prev, [fileId]: content }));
      } catch (error) {
        console.error("Error loading content", error);
      } finally {
        setLoadingContent(false);
      }
    },
    [fileContents, files, folder]
  );

  const handleSelect = async (fileId: string) => {
    setSelectedId(fileId);
    await loadContent(fileId);
  };

  const renderPreview = (fileId: string) => {
    const content = fileContents[fileId];
    if (loadingContent && selectedId === fileId && !content) {
      return <p className="text-sm text-muted-foreground">Loading content...</p>;
    }

    if (content) {
      return (
        <ReactMarkdown className="prose prose-sm max-w-none break-words">
          {content}
        </ReactMarkdown>
      );
    }

    return (
      <p className="text-sm text-muted-foreground">
        Select the file to load its content.
      </p>
    );
  };

  return (
    <Card className="shadow-sm">
      <CardHeader className="gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-lg">Knowledge base files</CardTitle>
        </div>
        <Input
          placeholder="Search files"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(0);
          }}
          className="w-full min-w-40 sm:w-64"
        />
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="overflow-hidden rounded-lg border">
          <div className="w-full overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead className="w-[40%] min-w-[200px]">File name</TableHead>
                  <TableHead className="min-w-[100px]">Type</TableHead>
                  <TableHead className="min-w-[100px]">Size</TableHead>
                  <TableHead className="min-w-[140px]">Created</TableHead>
                  <TableHead className="min-w-[140px]">Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingFiles ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center">
                      Loading files...
                    </TableCell>
                  </TableRow>
                ) : paginatedFiles.length ? (
                  paginatedFiles.map((file) => (
                    <TableRow
                      key={file.name}
                      data-state={selectedId === file.name ? "selected" : undefined}
                      className="hover:bg-muted/60"
                    >
                      <TableCell className="align-middle">
                        <Drawer>
                          <DrawerTrigger asChild>
                            <Button
                              variant="link"
                              className="text-foreground w-fit px-0 text-left"
                              onClick={() => handleSelect(file.name)}
                            >
                              {file.name}
                            </Button>
                          </DrawerTrigger>
                          <DrawerContent>
                            <DrawerHeader className="gap-1">
                              <DrawerTitle>{file.name}</DrawerTitle>
                              <DrawerDescription>Markdown preview</DrawerDescription>
                            </DrawerHeader>
                            <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto px-4 pb-6 text-sm">
                              {renderPreview(file.name)}
                            </div>
                          </DrawerContent>
                        </Drawer>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-muted-foreground px-1.5">
                          {file.type || "md"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {humanFileSize(file.size)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(file.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(file.modifiedAt).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center">
                      No files found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
        <div className="flex flex-col gap-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>{filteredFiles.length} files</span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={() => setPage(0)}
              disabled={currentPage === 0}
            >
              «
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={currentPage === 0}
            >
              ‹
            </Button>
            <span className="px-2 text-sm font-medium">
              Page {currentPage + 1} of {totalPages}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={currentPage >= totalPages - 1}
            >
              ›
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={() => setPage(totalPages - 1)}
              disabled={currentPage >= totalPages - 1}
            >
              »
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
