import { OUTSTANDING_PROJECTS } from "@/config/demoData";

export async function GET() {
  try {
    return new Response(JSON.stringify(OUTSTANDING_PROJECTS), { status: 200 });
  } catch (error) {
    console.error("Error retrieving outstanding projects:", error);
    return new Response("Error retrieving outstanding projects", { status: 500 });
  }
}
