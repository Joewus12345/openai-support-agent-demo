export type ResponseMessage = {
  role: string;
  content: { type: "input_text"; text: string }[];
};

export function toResponseMessage(role: string, text: string): ResponseMessage {
  return {
    role,
    content: [{ type: "input_text", text }],
  };
}
