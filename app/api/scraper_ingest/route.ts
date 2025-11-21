import crypto from "crypto";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import OpenAI from "openai";
import { NextResponse } from "next/server";

import { KB_FOLDERS } from "@/config/demoData";
import { VECTOR_STORE_ID } from "@/config/constants";
import { clearFileSearchCache } from "@/config/functions";
import { localVectorStore } from "@/lib/localVectorStore";

const openai = new OpenAI();

interface MarkdownBlob {
  content: string;
  source?: string;
  filename?: string;
}

type Manifest = Record<string, string>;

function sanitizeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "-");
}

async function readManifest(manifestPath: string): Promise<Manifest> {
  try {
    const data = await fsp.readFile(manifestPath, "utf8");
    const parsed = JSON.parse(data);
    if (parsed && typeof parsed === "object") {
      return parsed as Manifest;
    }
  } catch {
    // No manifest yet
  }
  return {};
}

async function writeManifest(manifestPath: string, manifest: Manifest) {
  const tempPath = `${manifestPath}.tmp`;
  await fsp.writeFile(tempPath, JSON.stringify(manifest, null, 2));
  await fsp.rename(tempPath, manifestPath);
}

async function runIngestionService(
  markdown_blobs: MarkdownBlob[],
  chunkSize: number
) {
  return await new Promise<any>((resolve, reject) => {
    const python = spawn(
      "python",
      ["crawl4AI-agent-v2/ingest_service.py", "--chunk-size", String(chunkSize)],
      {
        cwd: process.cwd(),
      }
    );

    let stdout = "";
    let stderr = "";

    python.on("error", (error) => {
      reject(
        new Error(
          `Failed to start ingestion service: ${(error as Error).message}`
        )
      );
    });

    python.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    python.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    python.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Ingestion service exited with code ${code}: ${stderr}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout || "{}");
        resolve(parsed);
      } catch (error) {
        reject(new Error(`Failed to parse ingestion output: ${(error as Error).message}`));
      }
    });

    python.stdin.write(
      JSON.stringify({
        markdown_blobs,
        chunk_size: chunkSize,
      })
    );
    python.stdin.end();
  });
}

async function uploadToVectorStore(
  filePath: string,
  vectorStoreId: string,
  destinationFolder: string
) {
  const stream = fs.createReadStream(filePath);
  const file = await openai.files.create({
    file: stream,
    purpose: "assistants",
  });

  const vectorStoreFile = await openai.vectorStores.files.create(vectorStoreId, {
    file_id: file.id,
    attributes: {
      source: path.basename(filePath),
      destination: destinationFolder,
    },
  });

  return { fileId: file.id, vectorStoreFile };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const markdownBlobs: MarkdownBlob[] = body.markdownBlobs || [];
    const destinationFolder: string = body.destinationFolder || "knowledge_base";
    const chunkSize: number = body.chunkSize || 1000;
    const vectorStoreId: string = body.vectorStoreId || VECTOR_STORE_ID;
    const forceLocalRebuild: boolean = body.forceLocalRebuild === true;

    if (!Array.isArray(markdownBlobs) || markdownBlobs.length === 0) {
      return NextResponse.json(
        { error: "markdownBlobs array is required" },
        { status: 400 }
      );
    }

    if (!KB_FOLDERS.includes(destinationFolder)) {
      return NextResponse.json(
        { error: `destinationFolder must be one of: ${KB_FOLDERS.join(", ")}` },
        { status: 400 }
      );
    }

    const baseDir = path.join(process.cwd(), "public", destinationFolder);
    await fsp.mkdir(baseDir, { recursive: true });

    const manifestPath = path.join(baseDir, ".ingest-manifest.json");
    const manifest = await readManifest(manifestPath);

    const timestamp = Date.now();
    const changedFiles: string[] = [];
    const unchangedFiles: string[] = [];
    const normalizedBlobs: MarkdownBlob[] = [];

    for (let i = 0; i < markdownBlobs.length; i++) {
      const blob = markdownBlobs[i];
      const content = (blob.content || "").trim();
      if (!content) continue;

      const filename = sanitizeFilename(
        blob.filename || blob.source || `ingest-${timestamp}-${i}.md`
      );
      const normalizedFilename = filename.endsWith(".md")
        ? filename
        : `${filename}.md`;

      const filePath = path.join(baseDir, normalizedFilename);
      const relativeFilePath = path.relative(process.cwd(), filePath);
      const contentHash = crypto
        .createHash("sha256")
        .update(content, "utf8")
        .digest("hex");

      const previousHash = manifest[relativeFilePath];
      if (previousHash === contentHash) {
        unchangedFiles.push(relativeFilePath);
        try {
          await fsp.access(filePath);
        } catch {
          await fsp.writeFile(filePath, content, "utf8");
        }
        continue;
      }

      await fsp.writeFile(filePath, content, "utf8");
      changedFiles.push(relativeFilePath);
      manifest[relativeFilePath] = contentHash;
      normalizedBlobs.push({
        content,
        source: blob.source || relativeFilePath,
        filename: normalizedFilename,
      });
    }

    if (normalizedBlobs.length === 0 && !forceLocalRebuild) {
      return NextResponse.json({
        message: "No new or changed files detected; ingestion skipped",
        unchangedFiles,
        vectorStoreId,
        uploadedFiles: [],
        ingestion: null,
      });
    }

    let ingestion = null;
    const uploadedFiles = [] as Array<{
      filePath: string;
      fileId: string;
      vectorStoreFile: any;
    }>;

    if (normalizedBlobs.length > 0) {
      ingestion = await runIngestionService(normalizedBlobs, chunkSize);

      for (const filePath of changedFiles) {
        const absolutePath = path.join(process.cwd(), filePath);
        const uploaded = await uploadToVectorStore(
          absolutePath,
          vectorStoreId,
          destinationFolder
        );
        uploadedFiles.push({
          filePath,
          fileId: uploaded.fileId,
          vectorStoreFile: uploaded.vectorStoreFile,
        });
      }
    }

    await writeManifest(manifestPath, manifest);

    if (forceLocalRebuild || changedFiles.length > 0) {
      await localVectorStore.initialize(
        forceLocalRebuild
          ? { force: true }
          : { files: changedFiles }
      );
      clearFileSearchCache();
    }

    return NextResponse.json({
      changedFiles,
      unchangedFiles,
      ingestion,
      vectorStoreId,
      uploadedFiles,
    });
  } catch (error) {
    console.error("Error running scraper ingestion:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
