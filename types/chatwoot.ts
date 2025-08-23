interface Account {
  id?: number;
  account_id?: number;
  [key: string]: any;
}

export interface Conversation {
  id: number;
  account?: Account;
  [key: string]: any;
}

export interface Message {
  id?: number;
  content: string;
  message_type?: string;
  type?: string;
  conversation?: Conversation;
  account?: Account;
  [key: string]: any;
}

export interface ChatwootEvent {
  message?: Message;
  conversation?: Conversation;
  account?: Account;
  [key: string]: any;
}

