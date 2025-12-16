"use client";

import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";

import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type FileMetadata = {
  name: string;
  size: number;
  createdAt: string;
  modifiedAt: string;
  type: string;
};

const getFileId = (file: FileMetadata) =>
  file.name.replace(/\.([^.]+)$/u, "") || file.name;

const humanFileSize = (size: number) => {
  if (size < 1024) return `${size} B`;
  const kb = size / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
};

export function KnowledgeBaseDataTable({
  folder = "knowledge_base",
}: {
  folder?: string;
}) {
  const [files, setFiles] = useState<FileMetadata[]>([]);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fileContents, setFileContents] = useState<Record<string, string>>({});
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [loadingContent, setLoadingContent] = useState(false);

  useEffect(() => {
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

  const filteredFiles = useMemo(() => {
    if (!query.trim()) return files;
    const lower = query.toLowerCase();
    return files.filter((file) => file.name.toLowerCase().includes(lower));
  }, [files, query]);

  const selectedFile = useMemo(
    () => filteredFiles.find((file) => getFileId(file) === selectedId),
    [filteredFiles, selectedId]
  );

  useEffect(() => {
    if (!selectedId) return;
    if (fileContents[selectedId]) return;
    const file = files.find((entry) => getFileId(entry) === selectedId);
    if (!file) return;

    const fetchContent = async () => {
      try {
        setLoadingContent(true);
        const content = await fetch(`/${folder}/${file.name}`).then((res) =>
          res.text()
        );
        setFileContents((prev) => ({ ...prev, [selectedId]: content }));
      } catch (error) {
        console.error("Error loading content", error);
      } finally {
        setLoadingContent(false);
      }
    };

    void fetchContent();
  }, [selectedId, fileContents, files, folder]);

  return (
    <Card className="shadow-sm">
      <CardHeader className="gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-lg">Knowledge base files</CardTitle>
          <CardDescription>
            Responsive table with inline markdown preview
          </CardDescription>
        </div>
        <Input
          placeholder="Search files"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="w-full min-w-40 sm:w-64"
        />
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className="min-w-[180px]">Name</TableHead>
                <TableHead className="w-24">Type</TableHead>
                <TableHead className="w-28">Size</TableHead>
                <TableHead className="min-w-[160px]">Created</TableHead>
                <TableHead className="min-w-[160px]">Updated</TableHead>
                <TableHead className="w-24 text-right">Preview</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingFiles ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm">
                    Loading files...
                  </TableCell>
                </TableRow>
              ) : filteredFiles.length ? (
                filteredFiles.map((file) => {
                  const id = getFileId(file);
                  const isSelected = id === selectedId;
                  return (
                    <TableRow
                      key={id}
                      data-state={isSelected ? "selected" : undefined}
                      className="hover:bg-muted/60"
                    >
                      <TableCell className="font-medium">{file.name}</TableCell>
                      <TableCell className="capitalize text-muted-foreground">
                        {file.type || "md"}
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
                      <TableCell className="text-right">
                        <Drawer modal={false}>
                          <DrawerTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className={cn(
                                "h-8 px-2",
                                isSelected ? "text-primary" : ""
                              )}
                              onClick={() => setSelectedId(id)}
                            >
                              Preview
                            </Button>
                          </DrawerTrigger>
                          <DrawerContent className="sm:max-w-2xl">
                            <DrawerHeader>
                              <DrawerTitle className="text-lg">
                                {file.name}
                              </DrawerTitle>
                              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                                <Badge variant="secondary" className="capitalize">
                                  {file.type || "md"}
                                </Badge>
                                <span>{humanFileSize(file.size)}</span>
                                <span>
                                  Updated {new Date(file.modifiedAt).toLocaleString()}
                                </span>
                              </div>
                            </DrawerHeader>
                            <div className="max-h-[60vh] overflow-auto px-4 pb-4">
                              {loadingContent && selectedId === id && !fileContents[id] ? (
                                <p className="text-sm text-muted-foreground">
                                  Loading content...
                                </p>
                              ) : fileContents[id] ? (
                                <ReactMarkdown className="prose prose-sm max-w-none">
                                  {fileContents[id]}
                                </ReactMarkdown>
                              ) : (
                                <p className="text-sm text-muted-foreground">
                                  Select the file to load its content.
                                </p>
                              )}
                            </div>
                            <DrawerFooter className="gap-2">
                              <DrawerClose asChild>
                                <Button variant="outline">Close</Button>
                              </DrawerClose>
                            </DrawerFooter>
                          </DrawerContent>
                        </Drawer>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm">
                    No files found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{filteredFiles.length} files</span>
          <span>
            Total size: {humanFileSize(files.reduce((acc, file) => acc + file.size, 0))}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

