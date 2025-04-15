import { agentTools } from "@/config/tools-list";
import { functionsMap } from "../../config/functions";

export type ToolName = keyof typeof functionsMap;

export const handleTool = async (
  toolName: ToolName,
  parameters: any,
  mode = "suggestion"
) => {
  console.log("Handle tool", toolName, parameters);
  // These tools will be suggested as a "recommended action" to the human agent
  if (agentTools.includes(toolName)) {
    if (mode === "suggestion") {
      console.log("Suggesting action", toolName);
      return {
        response: `Tool ${toolName} has been suggested as a next step for the human agent. Wait for the assistant response confirming the action.`,
      };
    } else {
      console.log("Executing tool", toolName);
      const result = await functionsMap[toolName](parameters);
      console.log("Tool result", result);
      return {
        result,
        response: `Tool ${toolName} has been executed`,
      };
    }
  }
  // These tools will be automatically executed
  else {
    if (functionsMap[toolName]) {
      return await functionsMap[toolName](parameters);
    } else {
      throw new Error(`Unknown tool: ${toolName}`);
    }
  }
};
