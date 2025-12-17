"use client";

import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";

import { DataTable, type KnowledgeBaseRow } from "@/components/data-table";

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

export function KnowledgeBaseDataTable({
  folder = "knowledge_base",
}: {
  folder?: string;
}) {
  const [files, setFiles] = useState<FileMetadata[]>([]);
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

  const filesWithId: KnowledgeBaseRow[] = useMemo(
    () =>
      files.map((file) => ({
        id: getFileId(file),
        name: file.name,
        type: file.type || "md",
        size: file.size,
        createdAt: file.createdAt,
        modifiedAt: file.modifiedAt,
      })),
    [files]
  );

  const handleSelect = async (fileId: string) => {
    setSelectedId(fileId);
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
  };

  return (
    <DataTable
      variant="knowledgeBase"
      kbData={filesWithId}
      loading={loadingFiles}
      selectedId={selectedId ?? undefined}
      onSelect={handleSelect}
      renderPreview={(item) => {
        const content = item.id ? fileContents[item.id] : undefined;
        if (loadingContent && selectedId === item.id && !content) {
          return <p className="text-sm text-muted-foreground">Loading content...</p>;
        }

        if (content) {
          return (
            <ReactMarkdown className="prose prose-sm max-w-none">
              {content}
            </ReactMarkdown>
          );
        }

        return (
          <p className="text-sm text-muted-foreground">
            Select the file to load its content.
          </p>
        );
      }}
      getHumanFileSize={humanFileSize}
    />
  );
}

