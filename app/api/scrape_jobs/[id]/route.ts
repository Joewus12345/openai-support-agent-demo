import { serializeJob } from "../helpers";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const job = await serializeJob(params.id);
  if (!job) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(JSON.stringify(job), { status: 200 });
}
