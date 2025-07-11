import { toolsList } from "../../config/tools-list";
import { VECTOR_STORE_ID } from "@/config/constants";

export const tools = [
  {
    type: "file_search",
    vector_store_ids: [VECTOR_STORE_ID],
  },
  // Mapping toolsList into the expected tool definition format
  ...toolsList.map((tool) => {
    const required = (tool as any).required ?? Object.keys(tool.parameters);
    const toolDef: {
      type: string;
      name: string;
      parameters: any;
      strict: boolean;
      description?: string;
    } = {
      type: "function",
      name: tool.name,
      parameters: {
        type: "object",
        properties: { ...tool.parameters },
        required,
        additionalProperties: false,
      },
      strict: required.length === Object.keys(tool.parameters).length,
    };
    if ((tool as any).description) {
      toolDef.description = (tool as any).description;
    }
    return toolDef;
  }),
];
