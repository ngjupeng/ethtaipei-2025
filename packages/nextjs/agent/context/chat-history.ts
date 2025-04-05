export enum ChatMessageSender {
  USER = 'USER',
  AGENT = 'AGENT',
}

export interface ChatMessage {
  sender: ChatMessageSender;
  message: string;
}

export class ChatHistoryService {
  private history: ChatMessage[] = [];
  private maxHistoryLength: number;

  constructor(maxHistoryLength: number = 10) {
    this.maxHistoryLength = maxHistoryLength;
  }

  add(sender: ChatMessageSender, message: string) {
    this.history.push({ sender, message });

    if (this.history.length > this.maxHistoryLength) {
      this.history = this.history.slice(-this.maxHistoryLength);
    }
  }

  getHistory(): ChatMessage[] {
    return this.history;
  }

  clear() {
    this.history = [];
  }
}
