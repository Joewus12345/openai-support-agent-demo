import { NextResponse } from "next/server";
import { localVectorStore } from "@/lib/localVectorStore";

export async function POST() {
  try {
    await localVectorStore.initialize();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error initializing local vector store:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
