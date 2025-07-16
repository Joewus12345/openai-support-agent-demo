import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import ollama from "ollama";
import { KB_FOLDERS } from "@/config/demoData";

const STORE_PATH = path.join(process.cwd(), "data", "local_vector_store.json");

interface Entry {
  id: string;
  embedding: number[];
  text: string;
  attributes: {
    type: string;
    filename: string;
    filepath: string;
  };
}

function cosineSimilarity(a: number[], b: number[]) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

class LocalVectorStore {
  private store: Entry[] = [];
  private loaded = false;

  private async ensureLoaded() {
    if (this.loaded) return;
    try {
      const data = await fs.readFile(STORE_PATH, "utf8");
      this.store = JSON.parse(data);
    } catch {
      this.store = [];
    }
    this.loaded = true;
  }

  private async embedding(text: string): Promise<number[]> {
    const model = process.env.OLLAMA_MODEL || "llama3";
    const res = await ollama.embeddings({ model, prompt: text });
    return res.embedding;
  }

  async initialize(force = false) {
    if (force) {
      this.store = [];
      this.loaded = true;
    } else {
      await this.ensureLoaded();
      if (this.store.length > 0) return;
    }
    for (const folder of KB_FOLDERS) {
      const dir = path.join(process.cwd(), "public", folder);
      const files = await fs.readdir(dir);
      for (const file of files) {
        const filePath = path.join(dir, file);
        const text = await fs.readFile(filePath, "utf8");
        const embedding = await this.embedding(text);
        this.store.push({
          id: crypto.randomUUID(),
          embedding,
          text,
          attributes: {
            type: folder,
            filename: file.replace(/\.md$/, ""),
            filepath: `/public/${folder}/${file}`,
          },
        });
      }
    }
    await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
    await fs.writeFile(STORE_PATH, JSON.stringify(this.store, null, 2));
  }

  async search(query: string, max_results = 5) {
    await this.ensureLoaded();
    if (this.store.length === 0) return [];
    const qEmbed = await this.embedding(query);
    return this.store
      .map((e) => ({
        text: e.text,
        attributes: e.attributes,
        score: cosineSimilarity(qEmbed, e.embedding),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, max_results);
  }
}

export const localVectorStore = new LocalVectorStore();
