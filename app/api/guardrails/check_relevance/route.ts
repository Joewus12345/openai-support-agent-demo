import OpenAI from "openai";

export async function POST(request: Request) {
  try {
    const { message } = await request.json();
    const openai = new OpenAI();
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content:
            "Decide if the user message is about industrial electrical automation services or product sales. Reply in JSON with keys isRelevant (boolean) and reasoning (string).",
        },
        { role: "user", content: message },
      ],
      temperature: 0,
    });
    const content = completion.choices[0].message.content || "";
    const data = JSON.parse(content);
    return new Response(JSON.stringify(data), { status: 200 });
  } catch (error) {
    console.error("Error checking relevance:", error);
    return new Response("Error", { status: 500 });
  }
}
