import { FAQExtract } from "@/stores/useDataStore";
import { Action } from "@/stores/useConversationStore";

export const AGENT_NAME = "Blossom";

export const CUSTOMER_DETAILS = {
  name: "Janet Deer",
  id: "cus_28X44",
  orderNb: 8,
  signupDate: "2023-11-28",
};

export const DEFAULT_ACTION: Action = {
  name: "create_ticket",
  parameters: {
    user_id: CUSTOMER_DETAILS.id,
    type: "other",
    details: "Need more help with the request",
  },
};

export const DEFAULT_ARTICLES: FAQExtract[] = [
  {
    title: "Interactions guidelines",
    content: `Tone, Empathy, and Professionalism:
      As a representative, you are the voice of our industrial automation brand. Always:
      - Be polite, patient, and empathetic.
      - Assume the customer's intent is positive, even if they express frustration.
      - Acknowledge and validate their concerns before providing solutions.
      `,
    link: "/kb?section=interactions_guidelines",
    type: "knowledge_base",
    score: 0.9,
  },
  {
    title: "Customer support chat",
    content: `If you have any questions or need any help, you can contact us through the customer support chat.
    An automation specialist will assist you with setup issues or troubleshooting.
    Please note that our agents are available from Monday to Saturday, 9am to 6pm.
    `,
    link: "/faq?section=help_chat",
    type: "faq",
    score: 0.8,
  },
];

export const KB_FOLDERS = ["knowledge_base", "faq"];

const getDate = (daysAgo: number) => {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().split("T")[0];
};

export const USER_INFO = {
  name: "Janet Deer",
  email: "janet.deer@gmail.com",
  phone: "+1234567890",
  address: "123 Main St, Anytown, USA",
  order_history: [
    "ORD1001",
    "ORD1002",
    "ORD1003",
    "ORD1004",
    "ORD1005",
    "ORD1006",
    "ORD1007",
  ],
};

export const DEMO_ORDERS = [
  {
    id: "ORD1001",
    date: getDate(1),
    status: "pending",
    items: [
      { product_id: "P103", name: "Safety Relay", quantity: 1, price: 149.99 },
    ],
  },
  {
    id: "ORD1002",
    date: getDate(8),
    status: "completed",
    items: [
      {
        product_id: "P101",
        name: "Industrial PLC",
        quantity: 1,
        price: 1299.99,
      },
      {
        product_id: "P102",
        name: "HMI Panel",
        quantity: 1,
        price: 799.99,
      },
    ],
  },
  {
    id: "ORD1003",
    date: getDate(24),
    status: "shipped",
    tracking_number: "TRK123456789",
    items: [
      {
        product_id: "P104",
        name: "Servo Motor",
        quantity: 2,
        price: 499.99,
      },
    ],
  },
  {
    id: "ORD1004",
    date: getDate(28),
    status: "cancelled",
    cancellation_reason: "Customer requested cancellation before processing",
  },
  {
    id: "ORD1005",
    date: getDate(44),
    status: "refunded",
    refund_status: "processing",
    refund_amount: 699.99,
    items: [
      { product_id: "P105", name: "VFD Drive", quantity: 1, price: 699.99 },
    ],
  },
  {
    id: "ORD1006",
    date: getDate(96),
    status: "delivered",
    return_initiated: true,
    items: [
      {
        product_id: "P106",
        name: "Power Supply Unit",
        quantity: 1,
        price: 249.99,
      },
    ],
  },
  {
    id: "ORD1007",
    date: getDate(108),
    status: "completed",
    complaint: "Order delivered with damaged product",
    items: [
      {
        product_id: "P107",
        name: "Industrial Sensor",
        quantity: 1,
        price: 199.99,
      },
    ],
  },
];

export const OUTSTANDING_PROJECTS = [
  {
    id: "PROJ001",
    description: "Install new conveyor system",
    due_date: "2024-06-30",
  },
  {
    id: "PROJ002",
    description: "Upgrade control software",
    due_date: "2024-07-15",
  },
];

export const SPECIAL_OFFERS = [
  {
    id: "OFF001",
    title: "10% off PLC maintenance",
    details: "Valid until 2024-07-31",
  },
  {
    id: "OFF002",
    title: "Free shipping on orders over $500",
    details: "Valid this month",
  },
];
