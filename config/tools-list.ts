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
  {
    name: "get_order",
    parameters: {
      order_id: {
        type: "string",
        description: "Order ID to retrieve",
      },
    },
  },
  {
    name: "cancel_order",
    parameters: {
      order_id: {
        type: "string",
        description: "Order ID to cancel",
      },
    },
  },
  {
    name: "create_return",
    parameters: {
      order_id: {
        type: "string",
        description: "Order ID for the return",
      },
      product_ids: {
        type: "array",
        description: "List of product IDs to return",
      },
    },
  },
  {
    name: "create_refund",
    parameters: {
      order_id: {
        type: "string",
        description: "Order ID for the refund",
      },
      amount: {
        type: "number",
        description: "Refund amount",
      },
      reason: {
        type: "string",
        description: "Reason for the refund",
      },
    },
  },
  {
    name: "create_complaint",
    parameters: {
      user_id: {
        type: "string",
        description: "ID of the complaining user",
      },
      type: {
        type: "string",
        description: "Complaint category",
      },
      details: {
        type: "string",
        description: "Complaint details",
      },
      order_id: {
        type: "string",
        description: "Related order ID if any",
      },
    },
  },
  {
    name: "get_outstanding_projects",
    parameters: {},
  },
  {
    name: "get_special_offers",
    parameters: {},
  },
];

// Tools that will need to be confirmed by the human representative before execution
export const agentTools = [
  "schedule_service_visit",
  "submit_warranty_claim",
  "cancel_order",
  "create_return",
  "create_refund",
  "create_complaint",
];
