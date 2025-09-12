"use client";
import { KB_FOLDERS } from "@/config/demoData";
import { Copy } from "lucide-react";
import { useState } from "react";

interface KBFile {
  type: string;
  filename: string;
  filepath: string;
}

export default function InitVS() {
  const [loadingOpenAI, setLoadingOpenAI] = useState(false);
  const [vectorStoreId, setVectorStoreId] = useState<string | null>(null);
  const [statusOpenAI, setStatusOpenAI] = useState<string>("");
  const [errorOpenAI, setErrorOpenAI] = useState<string | null>(null);
  const [successOpenAI, setSuccessOpenAI] = useState<boolean>(false);

  const [loadingOllama, setLoadingOllama] = useState(false);
  const [statusOllama, setStatusOllama] = useState<string>("");
  const [errorOllama, setErrorOllama] = useState<string | null>(null);
  const [successOllama, setSuccessOllama] = useState(false);

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
    <div className="h-screen w-full bg-white flex flex-col items-center pt-16 md:pt-32">
      <div className="flex flex-col gap-4 max-w-lg">
        <div className="text-2xl font-bold">Initialize the Vector Store</div>
        <div className="text-sm text-zinc-500 space-y-2">
          <p>
            For this demo to work, you need to load knowledge base content into a vector store. The content in the
            <span className="font-mono bg-zinc-100 rounded-md p-1">/public/knowledge_base</span> and
            <span className="font-mono bg-zinc-100 rounded-md p-1">/public/faq</span> folders will be embedded using
            Ollama and stored locally.
          </p>
          <p>
            Feel free to update these articles with your own content. After making changes you can re-run this step to
            regenerate the embeddings.
          </p>
        </div>
        <div className="flex gap-4">
          {!loadingOpenAI ? (
            <div
              className="bg-[#2B83F6] text-white text-sm font-medium py-2 px-4 rounded-lg hover:bg-[#2B83F6]/90 cursor-pointer"
              onClick={handleInitializeOpenAI}
            >
              Initialize with OpenAI
            </div>
          ) : (
            <div className="text-sm text-zinc-500 animate-pulse">{statusOpenAI}</div>
          )}
        {!loadingOllama ? (
            <div
              className="bg-[#2B83F6] text-white text-sm font-medium py-2 px-4 rounded-lg hover:bg-[#2B83F6]/90 cursor-pointer"
              onClick={handleInitializeOllama}
            >
              Initialize with Ollama
            </div>
          ) : (
            <div className="text-sm text-zinc-500 animate-pulse">{statusOllama}</div>
          )}
          {!loadingOllama ? (
            <div
              className="bg-[#2B83F6] text-white text-sm font-medium py-2 px-4 rounded-lg hover:bg-[#2B83F6]/90 cursor-pointer"
              onClick={handleRebuildOllama}
            >
              Rebuild Ollama
            </div>
          ) : null}
        </div>
      </div>
      <div className="mt-6 text-left w-full max-w-lg space-y-4">
        {errorOpenAI && <div className="text-red-500 text-sm">{errorOpenAI}</div>}
        {successOpenAI && !errorOpenAI && (
          <div className="text-zinc-600 text-sm">
            Knowledge base updated successfully.
            <div className="flex items-center gap-2 mt-4">
              <div className="text-zinc-900">Vector Store ID:</div>
              <div className="font-mono text-sm p-1 bg-zinc-100 rounded-md">{vectorStoreId ?? ""}</div>
              <Copy
                onClick={() => copyToClipboard(vectorStoreId ?? "")}
                size={16}
                className="cursor-pointer text-zinc-400 hover:text-zinc-600 transition-all duration-100"
              />
            </div>
          </div>
        )}
        {errorOllama && <div className="text-red-500 text-sm">{errorOllama}</div>}
        {successOllama && !errorOllama && (
          <div className="text-zinc-600 text-sm">Knowledge base updated successfully.</div>
        )}
      </div>
    </div>
  );
}
