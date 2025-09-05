interface Account {
  id?: number;
  account_id?: number;
  [key: string]: any;
}

export interface Conversation {
  id: number;
  status?: string;
  inbox_id?: number;
  account?: Account;
  [key: string]: any;
}

export interface Message {
  id?: number;
  content: string;
  message_type?: number | string;
  type?: string;
  conversation?: Conversation;
  conversation_id?: number;
  account?: Account;
  account_id?: number;
  inbox_id?: number;
  [key: string]: any;
}

export interface BasePayload {
  event: "message_created" | "conversation_updated" | "conversation_status_changed";
  type?: string;
  account?: Account;
  account_id?: number;
  conversation?: Conversation;
  conversation_id?: number;
  inbox_id?: number;
  id?: number;
  meta?: { assignee?: { account_id?: number } } & Record<string, any>;
  messages?: Message[];
  message?: Message;
}

export interface MessageCreatedPayload extends BasePayload {
  event: "message_created";
  message: Message;
}

export interface ConversationUpdatedPayload extends BasePayload {
  event: "conversation_updated";
  changed_attributes?: Record<string, any>[];
}

export interface ConversationStatusChangedPayload extends BasePayload {
  event: "conversation_status_changed";
  status?: string;
  previous_status?: string;
}

export type ChatwootEvent =
  | MessageCreatedPayload
  | ConversationUpdatedPayload
  | ConversationStatusChangedPayload;

export type ChatwootWebhookPayload =
  | ChatwootEvent
  | { event: ChatwootEvent["event"]; data: ChatwootEvent };

