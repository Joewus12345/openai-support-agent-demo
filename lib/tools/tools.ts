import { toolsList } from "../../config/tools-list";
import { VECTOR_STORE_ID } from "@/config/constants";

/**
 * Tool definitions used by the assistant. The OpenAI provider expects the
 * builtin `file_search` tool referencing the remote vector store, while the
 * Ollama provider only needs the function tools defined in `toolsList`.
 */

/** Build a tool definition compatible with the OpenAI provider. */
const buildOpenAITool = (tool: any) => {
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
};

/** Build a tool definition compatible with the Ollama provider. */
const buildOllamaTool = (tool: any) => {
  const required = (tool as any).required ?? Object.keys(tool.parameters);
  const functionObj: { name: string; description?: string; parameters: any } = {
    name: tool.name,
    parameters: {
      type: "object",
      properties: { ...tool.parameters },
      required,
      additionalProperties: false,
    },
  };
  if ((tool as any).description) {
    functionObj.description = (tool as any).description;
  }
  const toolDef: { type: string; function: typeof functionObj; strict?: boolean } = {
    type: "function",
    function: functionObj,
  };
  if (required.length === Object.keys(tool.parameters).length) {
    toolDef.strict = true;
  }
  return toolDef;
};

const openAITools = toolsList.map(buildOpenAITool);

// Tools for the OpenAI provider (includes built-in file search)
export const tools = [
  {
    type: "file_search",
    vector_store_ids: [VECTOR_STORE_ID],
  },
  ...openAITools,
];

const ollamaFunctionTools = toolsList.map(buildOllamaTool);

// Tools for the Ollama provider (function tools only)
export const ollamaTools = [...ollamaFunctionTools];