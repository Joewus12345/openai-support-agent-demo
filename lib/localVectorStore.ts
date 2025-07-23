import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import ollama from "ollama";
import { KB_FOLDERS } from "@/config/demoData";
import cleanMarkdown from "./cleanMarkdown";

const STORE_PATH = path.join(process.cwd(), "data", "local_vector_store.json");

interface Entry {
  id: string;
  embedding: number[];
  text: string;
  attributes: {
    type: string;
    filename: string;
    filepath: string;
    // chunk?: number;
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
    const model = "nomic-embed-text";
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
    let processed = 0;
    for (const folder of KB_FOLDERS) {
      const dir = path.join(process.cwd(), "public", folder);
      const files = await fs.readdir(dir);
      for (const file of files) {
        const filePath = path.join(dir, file);
        const raw = await fs.readFile(filePath, "utf8");
        const cleaned = cleanMarkdown(raw);
        // const paragraphs = cleaned.split(/\n{2,}/);
        // let chunk = "";
        // let index = 0;
        // for (const para of paragraphs) {
        //   const p = para.trim();
        //   if (!p) continue;
        //   if (chunk.length + p.length > 500 && chunk) {
        //     const embedding = await this.embedding(chunk);
        //     this.store.push({
        //       id: crypto.randomUUID(),
        //       embedding,
        //       text: chunk,
        //       attributes: {
        //         type: folder,
        //         filename: file.replace(/\.md$/, ""),
        //         filepath: `/public/${folder}/${file}`,
        //         chunk: index,
        //       },
        //     });
        //     processed++;
        //     index++;
        //     chunk = p;
        //   } else {
        //     chunk += (chunk ? "\n\n" : "") + p;
        //   }
        // }
        // if (chunk.trim()) {
        //   const embedding = await this.embedding(chunk);
        //   this.store.push({
        //     id: crypto.randomUUID(),
        //     embedding,
        //     text: chunk,
        //     attributes: {
        //       type: folder,
        //       filename: file.replace(/\.md$/, ""),
        //       filepath: `/public/${folder}/${file}`,
        //       chunk: index,
        //     },
        //   });
        //   processed++;
        // }
        const embedding = await this.embedding(cleaned);
        this.store.push({
          id: crypto.randomUUID(),
          embedding,
          text: cleaned,
          attributes: {
            type: folder,
            filename: file.replace(/\.md$/, ""),
            filepath: `/public/${folder}/${file}`,
          },
        });
        processed++;      
      }
    }
    await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
    console.log(`Processed ${processed} files. Writing local vector store...`);
    await fs.writeFile(STORE_PATH, JSON.stringify(this.store, null, 2));
    console.log(
      `Local vector store written to ${STORE_PATH} with ${this.store.length} entries.`
    );
  }

  async search(query: string, limit = 20) {
    await this.ensureLoaded();
    if (this.store.length === 0) {
      throw new Error("Local vector store is empty");
    }
    console.log(`Searching ${this.store.length} stored entries...`);
    const qEmbed = await this.embedding(query);
    const threshold = 0.5
    const results = this.store
      .map((e) => ({
        text: e.text,
        attributes: e.attributes,
        score: cosineSimilarity(qEmbed, e.embedding),
      }))
      .filter((r) => r.score >= threshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    console.log(
      "Top scores:",
      results.map((r) => r.score.toFixed(3))
    );
    return results;
  }

  async getStatus() {
    await this.ensureLoaded();
    return { loaded: this.loaded, count: this.store.length };
  }
}

export const localVectorStore = new LocalVectorStore();
