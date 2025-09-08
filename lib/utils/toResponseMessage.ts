export type ResponseMessage = {
  role: string;
  content: { type: "input_text" | "output_text"; text: string }[];
};

export function toResponseMessage(role: string, text: string): ResponseMessage {
  return {
    role,
    content: [
      { type: role === "assistant" ? "output_text" : "input_text", text },
    ],
  };
}
