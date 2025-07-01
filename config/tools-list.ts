// List of tools available to the agent
// No need to include the top-level wrapper object as it is added in lib/tools/tools.ts

export const toolsList = [
  {
    name: "schedule_service_visit",
    parameters: {
      equipment_id: {
        type: "string",
        description: "ID of the equipment that requires service",
      },
      preferred_date: {
        type: "string",
        description: "Preferred date for the visit",
      },
      issue_description: {
        type: "string",
        description: "Description of the issue",
      },
    },
  },
  {
    name: "request_product_manual",
    parameters: {
      product_id: {
        type: "string",
        description: "Product ID to retrieve the manual for",
      },
    },
  },
  {
    name: "submit_warranty_claim",
    parameters: {
      product_id: {
        type: "string",
        description: "Product ID for the warranty claim",
      },
      purchase_date: {
        type: "string",
        description: "Date of purchase",
      },
      issue: {
        type: "string",
        description: "Description of the problem",
      },
    },
  },
];

// Tools that will need to be confirmed by the human representative before execution
export const agentTools = [
  "schedule_service_visit",
  "submit_warranty_claim",
];
