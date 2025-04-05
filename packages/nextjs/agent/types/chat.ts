export enum ChatMessageSender {
  USER = "USER",
  AI = "AI_AGENT",
}

export interface ChatSession {
  ownerAddress: string;
  title: string;
}

export interface ChatMessage {
  content: string;
  sender: ChatMessageSender;
  transactionData?: string[];
}

export interface ConversationHistory {
  content: string;
  sender: ChatMessageSender;
}
