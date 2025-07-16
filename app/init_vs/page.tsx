"use client";
import { useState } from "react";

export default function InitVS() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleInitialize = async () => {
    setLoading(true);
    setSuccess(false);
    setStatus("Generating embeddings...");
    const res = await fetch("/api/local_vector_store/init", { method: "POST" });
    if (res.ok) {
      setStatus("Knowledge base loaded.");
      setSuccess(true);
    } else {
      setError("Failed to initialize vector store");
    }
    setLoading(false);
  };

  return (
    <div className="h-screen w-full bg-white flex flex-col items-center pt-16 md:pt-32">
      <div className="flex flex-col gap-4 max-w-lg">
        <div className="text-2xl font-bold">Initialize the Vector Store</div>
        <div className="text-sm text-zinc-500 space-y-2">
          <p>
            For this demo to work, you need to load knowledge base content into a vector store.
            The content in the <span className="font-mono bg-zinc-100 rounded-md p-1">/public/knowledge_base</span> and
            <span className="font-mono bg-zinc-100 rounded-md p-1">/public/faq</span> folders will be embedded using Ollama
            and stored locally.
          </p>
          <p>
            Feel free to update these articles with your own content. After making changes you can re-run this step to
            regenerate the embeddings.
          </p>
        </div>
        <div className="flex">
          {!loading ? (
            <div
              className="bg-black text-white text-sm font-medium py-2 px-4 rounded-lg hover:bg-zinc-800 cursor-pointer"
              onClick={handleInitialize}
            >
              Initialize vector store
            </div>
          ) : (
            <div className="text-sm text-zinc-500 animate-pulse">{status}</div>
          )}
        </div>
      </div>
      <div className="mt-6 text-left w-full max-w-lg">
        {error && <div className="text-red-500 text-sm">{error}</div>}
        {success && !error && (
          <div className="text-zinc-600 text-sm">Knowledge base updated successfully.</div>
        )}
      </div>
    </div>
  );
}
