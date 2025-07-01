import { SPECIAL_OFFERS } from "@/config/demoData";

export async function GET() {
  try {
    return new Response(JSON.stringify(SPECIAL_OFFERS), { status: 200 });
  } catch (error) {
    console.error("Error retrieving special offers:", error);
    return new Response("Error retrieving special offers", { status: 500 });
  }
}
