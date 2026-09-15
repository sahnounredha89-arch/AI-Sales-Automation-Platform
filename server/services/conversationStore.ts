import fs from "fs";
import path from "path";

export interface StoredMessage {
  id: string;
  conversationId: string;
  direction: "inbound" | "outbound" | "incoming";
  sender: string;
  type: string;
  text: string;
  platformMessageId?: string | null;
  timestamp: string;
  mediaUrl?: string | null;
  channel?: string;
  source?: string;
  origin?: string;
  isTest?: boolean;
  metaSent?: boolean;
  metaError?: string;
  modelUsed?: string;
}

export interface StoredConversation {
  id: string;
  customerId: string;
  customerName: string;
  customerUsername?: string;
  customerPhone?: string;
  platform: "messenger" | "instagram" | "telegram" | "simulator";
  platformUserId: string;
  platformConversationId?: string;
  status: "active" | "archived" | "closed";
  aiEnabled: boolean;
  humanHandoff: boolean;
  unreadCount: number;
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
  snippet: string;
  channel?: string;
  source?: string;
  origin?: string;
  isTest?: boolean;
}

const CACHE_FILE = path.join(process.cwd(), ".conversations_cache.json");

// In-memory tables
const conversationsMap = new Map<string, StoredConversation>();
const messagesMap = new Map<string, StoredMessage[]>();

// Initialize from cache file if exists
function loadCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const raw = fs.readFileSync(CACHE_FILE, "utf-8");
      const data = JSON.parse(raw);
      if (data.conversations && Array.isArray(data.conversations)) {
        for (const c of data.conversations) {
          conversationsMap.set(c.id, c);
        }
      }
      if (data.messages && typeof data.messages === "object") {
        for (const [convId, msgs] of Object.entries(data.messages)) {
          if (Array.isArray(msgs)) {
            messagesMap.set(convId, msgs as StoredMessage[]);
          }
        }
      }
      console.log(`[ConversationStore] Loaded ${conversationsMap.size} conversations and messages from local cache.`);
    }
  } catch (err) {
    console.warn("[ConversationStore] Could not load local cache:", err);
  }
}

function persistCache() {
  try {
    const data = {
      conversations: Array.from(conversationsMap.values()),
      messages: Object.fromEntries(messagesMap.entries()),
      savedAt: new Date().toISOString(),
    };
    fs.writeFileSync(CACHE_FILE + ".tmp", JSON.stringify(data, null, 2), "utf-8");
    fs.renameSync(CACHE_FILE + ".tmp", CACHE_FILE);
  } catch (err) {
    // Non-blocking
  }
}

// Initial load
loadCache();

export const conversationStore = {
  upsertConversation(conv: Partial<StoredConversation> & { id: string }) {
    const existing = conversationsMap.get(conv.id) || {
      id: conv.id,
      customerId: `cust_${conv.id}`,
      customerName: "Customer",
      platform: "messenger",
      platformUserId: conv.id,
      status: "active",
      aiEnabled: true,
      humanHandoff: false,
      unreadCount: 0,
      lastMessageAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      snippet: "",
    };
    const merged: StoredConversation = {
      ...existing,
      ...conv,
      updatedAt: new Date().toISOString(),
    };
    conversationsMap.set(conv.id, merged);
    persistCache();
    return merged;
  },

  getConversation(id: string): StoredConversation | undefined {
    return conversationsMap.get(id);
  },

  findConversationByPlatformUser(platform: string, platformUserId: string): StoredConversation | undefined {
    for (const conv of conversationsMap.values()) {
      if (conv.platform === platform && conv.platformUserId === platformUserId) {
        return conv;
      }
    }
    return undefined;
  },

  getAllConversations(): StoredConversation[] {
    return Array.from(conversationsMap.values()).sort((a, b) => {
      const timeA = new Date(a.lastMessageAt || a.updatedAt || 0).getTime();
      const timeB = new Date(b.lastMessageAt || b.updatedAt || 0).getTime();
      return timeB - timeA;
    });
  },

  addMessage(convId: string, msg: Omit<StoredMessage, "id"> & { id?: string }): StoredMessage {
    const id = msg.id || `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const fullMsg: StoredMessage = {
      ...msg,
      id,
      conversationId: convId,
      timestamp: msg.timestamp || new Date().toISOString(),
    };

    const list = messagesMap.get(convId) || [];
    // Deduplicate by platformMessageId or id
    const existingIdx = list.findIndex(
      (m) => (m.platformMessageId && m.platformMessageId === fullMsg.platformMessageId) || m.id === id
    );

    if (existingIdx >= 0) {
      list[existingIdx] = { ...list[existingIdx], ...fullMsg };
    } else {
      list.push(fullMsg);
    }

    messagesMap.set(convId, list);

    // Update parent conversation snippet & time
    const conv = conversationsMap.get(convId);
    if (conv) {
      conv.lastMessageAt = fullMsg.timestamp;
      conv.updatedAt = fullMsg.timestamp;
      if (fullMsg.text) {
        conv.snippet = fullMsg.text.slice(0, 120);
      }
      if (fullMsg.direction === "inbound") {
        conv.unreadCount = (conv.unreadCount || 0) + 1;
      }
      conversationsMap.set(convId, conv);
    }

    persistCache();
    return fullMsg;
  },

  getMessages(convId: string, limit = 100): StoredMessage[] {
    const list = messagesMap.get(convId) || [];
    return [...list]
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .slice(-limit);
  },

  updateConversation(convId: string, updates: Partial<StoredConversation>) {
    const conv = conversationsMap.get(convId);
    if (!conv) return null;
    const updated = { ...conv, ...updates, updatedAt: new Date().toISOString() };
    conversationsMap.set(convId, updated);
    persistCache();
    return updated;
  },
};
