"use client";
import { KB_FOLDERS } from "@/config/demoData";
import { Copy } from "lucide-react";
import { useMemo, useState } from "react";

import { defaultRouteForRoles } from "@/lib/auth/routes";
import { useSessionStore } from "@/stores/useSessionStore";

interface KBFile {
  type: string;
  filename: string;
  filepath: string;
}

export default function InitVS() {
  const roles = useSessionStore((state) => state.roles);
  const defaultRedirect = useMemo(() => defaultRouteForRoles(roles), [roles]);
  const [loadingOpenAI, setLoadingOpenAI] = useState(false);
  const [vectorStoreId, setVectorStoreId] = useState<string | null>(null);
  const [statusOpenAI, setStatusOpenAI] = useState<string>("");
  const [errorOpenAI, setErrorOpenAI] = useState<string | null>(null);
  const [successOpenAI, setSuccessOpenAI] = useState<boolean>(false);

  const [loadingOllama, setLoadingOllama] = useState(false);
  const [statusOllama, setStatusOllama] = useState<string>("");
  const [errorOllama, setErrorOllama] = useState<string | null>(null);
  const [successOllama, setSuccessOllama] = useState(false);

  if (!roles) {
    return (
      <div className="p-6 text-sm text-gray-700">Checking your access…</div>
    );
  }

  if (!roles.includes("admin")) {
    return (
      <div className="p-6">
        <p className="rounded bg-red-50 p-4 text-red-700">
          You are not authorized to manage the vector store. Return to {defaultRedirect}.
        </p>
      </div>
    );
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const handleInitializeOpenAI = async () => {
    setLoadingOpenAI(true);
    setSuccessOpenAI(false);
    setErrorOpenAI(null);
    setStatusOpenAI("Creating vector store...");
    const response = await fetch("/api/vector_stores/create_store", {
      method: "POST",
      body: JSON.stringify({ name: "CS Knowledge Base" }),
    });
    if (response.status === 200) {
      const vs = await response.json();
      setVectorStoreId(vs.id);
      setStatusOpenAI("Fetching files...");
      const filesList: KBFile[] = [];
      for (const folder of KB_FOLDERS) {
        const folderFiles = await fetch(`/api/list_files?folder=${folder}`).then(
          (res) => res.json()
        );
        console.log(`Files found in folder ${folder}:`, folderFiles);
        filesList.push(
          ...folderFiles.map((file: string) => ({
            type: folder,
            filename: file.split(".")[0],
            filepath: `/public/${folder}/${file}`,
          }))
        );
      }
      setStatusOpenAI(`Uploading ${filesList.length} files to vector store...`);
      for (const file of filesList) {
        const uploadRes = await fetch("/api/vector_stores/upload_file", {
          method: "POST",
          body: JSON.stringify({ filePath: file.filepath }),
        });
        if (uploadRes.status === 200) {
          const fileData = await uploadRes.json();
          const fileId = fileData.id;
          const attributes = {
            type: file.type,
            filename: file.filename,
            filepath: file.filepath,
          };
          const addFileResponse = await fetch("/api/vector_stores/add_file", {
            method: "POST",
            body: JSON.stringify({ vectorStoreId: vs.id, fileId, attributes }),
          });
          if (addFileResponse.status === 200) {
            setStatusOpenAI(`Uploaded ${file.type}/${file.filename}`);
          } else {
            setErrorOpenAI(
              `Failed to add file ${file.filename} to vector store`
            );
          }
        } else {
          setErrorOpenAI(
            `Failed to upload file ${file.filename} to vector store`
          );
        }
      }
      setStatusOpenAI("Uploaded all files to vector store.");
      setLoadingOpenAI(false);
      setSuccessOpenAI(true);
    } else {
      setErrorOpenAI("Failed to create vector store");
      setLoadingOpenAI(false);
    }
  };

  const handleInitializeOllama = async () => {
    setLoadingOllama(true);
    setSuccessOllama(false);
    setErrorOllama(null);
    setStatusOllama("Generating embeddings...");
    const res = await fetch("/api/local_vector_store/init", { method: "POST" });
    if (res.ok) {
      setStatusOllama("Knowledge base loaded.");
      setSuccessOllama(true);
    } else {
      setErrorOllama("Failed to initialize vector store");
    }
    setLoadingOllama(false);
  };

  const handleRebuildOllama = async () => {
    setLoadingOllama(true);
    setSuccessOllama(false);
    setErrorOllama(null);
    setStatusOllama("Rebuilding embeddings...");
    const res = await fetch("/api/local_vector_store/init?force=true", {
      method: "POST",
    });
    if (res.ok) {
      setStatusOllama("Knowledge base rebuilt.");
      setSuccessOllama(true);
    } else {
      setErrorOllama("Failed to rebuild vector store");
    }
    setLoadingOllama(false);
  };

  return (
    <div className="min-h-screen bg-zinc-50 py-10">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 sm:px-6 lg:px-8">
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 border-b border-zinc-200 pb-4 md:flex-row md:items-start md:justify-between md:gap-6">
            <div className="max-w-2xl space-y-2">
              <div className="text-2xl font-bold text-zinc-900">Initialize the Vector Store</div>
              <p className="text-sm text-zinc-600">
                Load knowledge base content into a vector store so your agents can search and retrieve it. Content in
                <span className="font-mono bg-zinc-100 rounded-md px-1 py-0.5">/public/knowledge_base</span> and
                <span className="font-mono bg-zinc-100 rounded-md px-1 py-0.5">/public/faq</span> will be embedded using
                Ollama and stored locally.
              </p>
              <p className="text-sm text-zinc-600">
                Update these articles anytime and re-run initialization to rebuild embeddings. All controls below work in
                dev and production without changing backend logic.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-zinc-600">
              {statusOpenAI ? <div className="rounded-lg bg-zinc-100 px-3 py-2">{statusOpenAI}</div> : null}
              {statusOllama ? <div className="rounded-lg bg-zinc-100 px-3 py-2">{statusOllama}</div> : null}
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm flex flex-col gap-3">
            <div className="text-sm font-semibold text-zinc-900">OpenAI-managed vector store</div>
            <p className="text-xs text-zinc-600">
              Creates a hosted vector store and uploads all demo files. Use this path when you want OpenAI to manage
              storage.
            </p>
            {!loadingOpenAI ? (
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-lg bg-[#2B83F6] px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-[#1d6ccd]"
                onClick={handleInitializeOpenAI}
              >
                Initialize with OpenAI
              </button>
            ) : (
              <div className="text-sm text-zinc-500">{statusOpenAI || "Preparing OpenAI vector store..."}</div>
            )}
            {errorOpenAI && <div className="text-sm text-red-600">{errorOpenAI}</div>}
            {successOpenAI && !errorOpenAI && (
              <div className="rounded-lg bg-zinc-50 p-3 text-sm text-zinc-700">
                <div className="font-medium text-zinc-900">Knowledge base updated.</div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-zinc-600">Vector Store ID:</span>
                  <span className="font-mono rounded-md bg-zinc-100 px-2 py-1 text-xs text-zinc-900">
                    {vectorStoreId ?? ""}
                  </span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(vectorStoreId ?? "")}
                    className="inline-flex items-center gap-1 rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-700 hover:border-[#2B83F6]"
                  >
                    <Copy size={14} /> Copy
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm flex flex-col gap-3">
            <div className="text-sm font-semibold text-zinc-900">Local Ollama vector store</div>
            <p className="text-xs text-zinc-600">
              Generates embeddings locally. Use “Rebuild” after changing files to refresh the embeddings without altering
              backend APIs.
            </p>
            <div className="flex flex-wrap gap-2">
              {!loadingOllama ? (
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-lg bg-[#2B83F6] px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-[#1d6ccd]"
                  onClick={handleInitializeOllama}
                >
                  Initialize with Ollama
                </button>
              ) : (
                <div className="text-sm text-zinc-500">{statusOllama || "Generating embeddings..."}</div>
              )}
              {!loadingOllama ? (
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-800 transition hover:border-[#2B83F6]"
                  onClick={handleRebuildOllama}
                >
                  Rebuild Ollama
                </button>
              ) : null}
            </div>
            {errorOllama && <div className="text-sm text-red-600">{errorOllama}</div>}
            {successOllama && !errorOllama && (
              <div className="rounded-lg bg-zinc-50 p-3 text-sm text-zinc-700">Knowledge base updated successfully.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
