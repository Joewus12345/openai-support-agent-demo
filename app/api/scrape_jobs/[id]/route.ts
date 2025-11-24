import { serializeJob } from "../helpers";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await serializeJob(id);
  if (!job) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(JSON.stringify(job), { status: 200 });
}
