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
  relevantArticlesError: string | null;
  relevantArticlesLoading: boolean;
  additionalContext?: ContextItem[] | null;
  ticketId: string | null;
  emailRefused: boolean;
  setCustomerDetails: (details: CustomerDetails) => void;
  setFAQExtracts: (searchResults: any[], provider?: string) => void;
  setRelevantArticlesError: (error: string | null) => void;
  setAdditionalContext: (context: ContextItem[]) => void;
  setRelevantArticlesLoading: (loading: boolean) => void;
  addContextItem: (item: ContextItem) => void;
  setTicketId: (id: string | null) => void;
  setEmailRefused: (refused: boolean) => void;
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
  relevantArticlesError: null,
  relevantArticlesLoading: false,
  additionalContext: null,
  ticketId: null,
  emailRefused: false,
  setCustomerDetails: (details) => set({ customerDetails: details }),
  setFAQExtracts: (searchResults, provider?: string) => {
    console.log("searchResults", searchResults);
    const articles = searchResults.map((result: any) => {
      const text = typeof result === "string" ? result : result.text;
      const attrs =
        typeof result === "string" ? { type: "knowledge_base" } : result.attributes ?? {};
      const score = typeof result === "string" ? 1 : result.score;

      const [firstLine, ...rest] = text.split("\n");
      const title = firstLine.replaceAll("#", ""); // Remove markdown header syntax
      const content = rest.join("\n");
      const type = attrs.type ?? "knowledge_base";
      const link = getFileUrl(type, attrs.filename ?? "");
      return {
        title,
        content,
        type,
        link,
        score,
      };
    });
    // Sorting by relevance score and keeping only results with score > 0.5
    const sortedArticles = articles.sort((a, b) => b.score - a.score);
    const threshold = provider && provider.includes("ollama") ? 0.3 : 0.5;
    set({
      FAQExtracts: sortedArticles.filter((a) => a.score > threshold),
      relevantArticlesError: null,
    });
  },
  setRelevantArticlesError: (error) => set({ relevantArticlesError: error }),
  setAdditionalContext: (context) => set({ additionalContext: context }),
  addContextItem: (item) =>
    set((state) => ({
      additionalContext: [...(state.additionalContext || []), item],
    })),
  setRelevantArticlesLoading: (loading) =>
    set({ relevantArticlesLoading: loading }),
  setTicketId: (id) => set({ ticketId: id }),
  setEmailRefused: (refused) => set({ emailRefused: refused }),
}));

export default useDataStore;
