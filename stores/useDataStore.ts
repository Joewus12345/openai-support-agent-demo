import { CUSTOMER_DETAILS, DEFAULT_ARTICLES } from "@/config/demoData";
import { create } from "zustand";

interface CustomerDetails {
  name: string;
  id: string;
  orderNb: number;
  signupDate: string;
  email: string;
  phone: string;
  address: string;
}

export interface FAQExtract {
  title: string;
  content: string;
  type: "knowledge_base" | "faq";
  link: string;
  score: number;
}

interface OrderContextItem {
  type: "order";
  orderID: number;
  orderDate: string;
  refunded: boolean;
  refund_amount?: number;
  refund_state?: "pending" | "approved" | "sent" | "rejected";
  total_amount: number;
  currency: string;
}

interface TicketContextItem {
  type: "ticket";
  ticketID: number;
  ticketDate: string;
  description: string;
  status: "new" | "open" | "resolved" | "closed";
}

type ContextItem = OrderContextItem | TicketContextItem;

interface DataState {
  customerDetails: CustomerDetails;
  FAQExtracts?: FAQExtract[] | null;
  relevantArticlesLoading: boolean;
  additionalContext?: ContextItem[] | null;
  setCustomerDetails: (details: CustomerDetails) => void;
  setFAQExtracts: (searchResults: any[]) => void;
  setAdditionalContext: (context: ContextItem[]) => void;
  setRelevantArticlesLoading: (loading: boolean) => void;
  addContextItem: (item: ContextItem) => void;
}

const getFileUrl = (type: string, filename: string) => {
  if (type === "knowledge_base") {
    return `/kb?section=${filename}`;
  } else if (type === "faq") {
    return `/faq?section=${filename}`;
  } else {
    return `/kb?section=${filename}`;
  }
};

const useDataStore = create<DataState>((set) => ({
  customerDetails: CUSTOMER_DETAILS,
  FAQExtracts: DEFAULT_ARTICLES,
  relevantArticlesLoading: false,
  additionalContext: null,
  setCustomerDetails: (details) => set({ customerDetails: details }),
  setFAQExtracts: (searchResults) => {
    console.log("searchResults", searchResults);
    const articles = searchResults.map((result) => {
      const [firstLine, ...rest] = result.text.split("\n");
      const title = firstLine.replaceAll("#", ""); // Remove markdown header syntax
      const content = rest.join("\n");
      const type = result.attributes.type ?? "knowledge_base";
      const link = getFileUrl(type, result.attributes.filename ?? "");
      return {
        title,
        content,
        type,
        link,
        score: result.score,
      };
    });
    // Sorting by relevance score and keeping only results with score > 0.5
    const sortedArticles = articles.sort((a, b) => b.score - a.score);
    set({
      FAQExtracts: sortedArticles.filter((a) => a.score > 0.5),
    });
  },
  setAdditionalContext: (context) => set({ additionalContext: context }),
  addContextItem: (item) =>
    set((state) => ({
      additionalContext: [...(state.additionalContext || []), item],
    })),
  setRelevantArticlesLoading: (loading) =>
    set({ relevantArticlesLoading: loading }),
}));

export default useDataStore;
