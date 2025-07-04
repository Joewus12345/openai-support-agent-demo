// List of tools available to the agent
// No need to include the top-level wrapper object as it is added in lib/tools/tools.ts
// More information on function calling: https://platform.openai.com/docs/guides/function-calling

export const toolsList = [
  {
    name: "get_order",
    parameters: {
      order_id: {
        type: "string",
        description: "Order ID to get details for",
      },
    },
  },
  {
    name: "get_order_history",
    parameters: {
      user_id: {
        type: "string",
        description: "User ID to get order history for",
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
    name: "reset_password",
    parameters: {
      user_id: {
        type: "string",
        description: "User ID to send password reset email to",
      },
    },
  },
  {
    name: "send_replacement",
    parameters: {
      product_id: {
        type: "string",
        description: "Product ID to send replacement for",
      },
      order_id: {
        type: "string",
        description: "Order ID to send replacement for",
      },
    },
  },
  {
    name: "create_refund",
    parameters: {
      order_id: {
        type: "string",
        description: "Order ID to create refund for",
      },
      amount: {
        type: "number",
        description: "Amount to refund",
      },
      reason: {
        type: "string",
        description: "Reason for refund",
      },
    },
  },
  {
    name: "issue_voucher",
    parameters: {
      user_id: {
        type: "string",
        description: "User ID to issue voucher for",
      },
      amount: {
        type: "number",
        description: "Amount to issue voucher for",
      },
      reason: {
        type: "string",
        description: "Reason for issuing voucher",
      },
    },
  },
  {
    name: "create_return",
    parameters: {
      order_id: {
        type: "string",
        description: "Order ID to create return for",
      },
      product_ids: {
        type: "array",
        description: "Product IDs to create return for",
        items: {
          type: "string",
        },
      },
    },
  },
  {
    name: "create_complaint",
    parameters: {
      user_id: {
        type: "string",
        description: "User ID to create complaint for",
      },
      type: {
        type: "string",
        description: "Type of complaint",
        enum: ["product_quality", "order_delay", "delivery_issues", "other"],
      },
      details: {
        type: "string",
        description: "Details of the complaint",
      },
      order_id: {
        type: "string",
        description:
          "Order ID linked to the complaint, N/A if not linked to an order",
      },
    },
  },
  {
    name: "create_ticket",
    parameters: {
      user_id: {
        type: "string",
        description: "User ID to create ticket for",
      },
      type: {
        type: "string",
        description: "Type of ticket",
        enum: ["bug_reported", "damaged_product", "other"],
      },
      details: {
        type: "string",
        description: "Details of the ticket",
      },
      order_id: {
        type: "string",
        description:
          "Order ID linked to the ticket, N/A if not linked to an order",
      },
    },
  },
  {
    name: "update_info",
    parameters: {
      user_id: {
        type: "string",
        description: "User ID to update information for",
      },
      info: {
        type: "object",
        description: "Information to update",
        properties: {
          field: {
            type: "string",
            description: "Field to update",
            enum: ["email", "phone", "address", "name"],
          },
          value: {
            type: "string",
            description: "Value to update",
          },
        },
        additionalProperties: false,
        required: ["field", "value"],
      },
    },
  },
  {
    name: "get_products",
    parameters: {
      query: {
        type: "string",
        description: "Product name or partial name",
      },
    },
  },
  {
    name: "get_about_us",
    parameters: {
      query: {
        type: "string",
        description: "Search term for the about page",
      },
    },
    required: [],
  },
  // add more tools as needed
];

// Tools that will need to be confirmed by the human representative before execution
// Ex: "get_order" and "create_ticket" are low-risk so they can be automatically executed
export const agentTools = [
  "cancel_order",
  "reset_password",
  "send_replacement",
  "create_refund",
  "issue_voucher",
  "create_return",
  "create_complaint",
  "update_info",
];
