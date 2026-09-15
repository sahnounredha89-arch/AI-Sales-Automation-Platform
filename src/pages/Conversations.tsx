import React, { useEffect, useState, useRef, useLayoutEffect } from "react";
import DashboardLayout from "../components/DashboardLayout";
import { 
  MessageSquare, 
  Send, 
  Bot, 
  User, 
  ToggleLeft, 
  ToggleRight, 
  Loader2, 
  RefreshCw, 
  Search, 
  Sparkles, 
  Shield, 
  AlertCircle, 
  CheckCircle2, AlertTriangle, 
  ExternalLink, 
  Camera, 
  MessageCircle, 
  Info, 
  X,
  Phone,
  Volume2,
  ArrowDown,
  History,
  ArrowLeft
} from "lucide-react";
import { apiFetch } from "../lib/api";
import { collection, query, where, orderBy, onSnapshot, updateDoc, doc, limit } from "firebase/firestore";
import { db } from "../lib/firebase";
import { normalizeTimestampToMillis, compareMessages } from "../lib/messageUtils";

interface ConversationItem {
  channel?: string;
  source?: string;
  origin?: string;
  isTest?: boolean;
  id: string;
  customerId: string;
  customerName?: string;
  customerUsername?: string;
  customerPhone?: string;
  platform: "messenger" | "instagram" | "telegram" | string;
  platformConversationId?: string;
  platformUserId?: string;
  status: string;
  aiEnabled: boolean;
  humanHandoff: boolean;
  snippet?: string;
  productId?: string;
  createdAt?: string;
  updatedAt: string;
  lastMessageAt?: string;
  unreadCount?: number;
}

interface MessageItem {
  id: string;
  direction: "inbound" | "incoming" | "outbound" | "outgoing";
  sender?: string;
  type?: "text" | "image" | "voice" | string;
  text?: string;
  mediaUrl?: string;
  timestamp: string;
  platformMessageId?: string;
  channel?: string;
  source?: string;
  origin?: string;
  isTest?: boolean;
}

export default function Conversations() {
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [selectedConv, setSelectedConv] = useState<ConversationItem | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<{ type: "success" | "warning" | "info"; text: string } | null>(null);
  
  // Action loaders
  const [syncingMeta, setSyncingMeta] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);

  // Filters & Search - Default to all channels (Messenger + Instagram)
  const [searchQuery, setSearchQuery] = useState("");
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Message composer
  const [replyText, setReplyText] = useState("");

  // Messages and pagination (fetch latest 30 real Messenger messages)
  const [messageLimit, setMessageLimit] = useState<number>(30);
  const [hasMoreOlder, setHasMoreOlder] = useState<boolean>(false);
  const [loadingOlder, setLoadingOlder] = useState<boolean>(false);
  const [showNewMessageBadge, setShowNewMessageBadge] = useState<boolean>(false);
  const [isUserNearBottom, setIsUserNearBottom] = useState<boolean>(true);

  // Dedicated message container & scrolling refs
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isInitialConversationLoadRef = useRef<boolean>(true);
  const shouldScrollToBottomRef = useRef<boolean>(false);
  const isPrependingOlderRef = useRef<boolean>(false);
  const prevScrollHeightRef = useRef<number>(0);
  const prevScrollTopRef = useRef<number>(0);
  const lastKnownNewestMessageIdRef = useRef<string | null>(null);

  // Meta permissions modal/banner
  const [showPermGuide, setShowPermGuide] = useState(false);

  // AI Simulation Modal state
  const [showSimulatorModal, setShowSimulatorModal] = useState(false);
  const [simCustomerName, setSimCustomerName] = useState("Customer");
  const [simPlatform, setSimPlatform] = useState<"messenger" | "instagram">("instagram");
  const [simMessageText, setSimMessageText] = useState("");
  const [simulating, setSimulating] = useState(false);
  const [replyingUnreplied, setReplyingUnreplied] = useState(false);

  const handleReplyAllUnreplied = async () => {
    if (replyingUnreplied) return;
    setReplyingUnreplied(true);
    setActionNotice(null);
    try {
      const targetPlatform = platformFilter === "instagram" ? "instagram" : (platformFilter === "messenger" ? "messenger" : "all");
      const res = await apiFetch("/api/admin/conversations/reply-unreplied", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: targetPlatform })
      });
      const data = await res.json();
      if (res.ok) {
        if (data.repliedCount > 0) {
          setActionNotice({
            type: "success",
            text: `Processed ${data.unrepliedFound} pending message(s) and replied to ${data.repliedCount} customer(s) with AI!`
          });
        } else {
          setActionNotice({
            type: "info",
            text: "All customer messages are already replied to. No pending unreplied messages."
          });
        }
        fetchConversations(selectedConv?.id);
      } else {
        setActionNotice({ type: "warning", text: data.error || "Failed to process unreplied messages." });
      }
    } catch (err: any) {
      setActionNotice({ type: "warning", text: "Network error triggering AI replies." });
    } finally {
      setReplyingUnreplied(false);
      setTimeout(() => setActionNotice(null), 8000);
    }
  };

  const handleSimulateMessage = async (customText?: string) => {
    const textToSend = (customText || simMessageText).trim();
    if (!textToSend || simulating) return;
    setSimulating(true);
    try {
      const res = await apiFetch("/api/admin/conversations/simulate-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: selectedConv ? selectedConv.platform : simPlatform,
          platformUserId: selectedConv?.platformUserId || selectedConv?.platformConversationId || selectedConv?.customerId || undefined,
          name: selectedConv?.customerName || simCustomerName,
          text: textToSend,
        })
      });
      if (res.ok) {
        const simData = await res.json().catch(() => ({}));
        setSimMessageText("");
        setShowSimulatorModal(false);
        setActionNotice({
          type: "success",
          text: simData.reply ? `AI Replied: "${simData.reply}"` : `Test message sent! AI Sales Agent responded.`
        });
        fetchConversations(selectedConv?.id);
        if (selectedConv) {
          selectConversation(selectedConv);
        }
      } else {
        const err = await res.json().catch(() => ({}));
        setActionNotice({ type: "warning", text: err.error || "Simulation failed." });
      }
    } catch (e: any) {
      setActionNotice({ type: "warning", text: "Network error simulating message." });
    } finally {
      setSimulating(false);
    }
  };


  const [liveStatus, setLiveStatus] = useState<"Connecting" | "Connected" | "Disconnected">("Connecting");
  const [lastUpdate, setLastUpdate] = useState<string>("");
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setLiveStatus("Connecting");
    setError(null);
    
    // Safety timeout in case Firestore hangs or is completely unreachable
    const timeoutId = setTimeout(() => {
      if (isMounted) {
        apiFetch("/api/admin/conversations")
          .then(r => r.json())
          .then(data => {
            if (Array.isArray(data) && data.length > 0) {
              setConversations(data);
              setLiveStatus("Connected");
              setError(null);
            }
          })
          .catch(() => {})
          .finally(() => {
            if (isMounted) setLoading(false);
          });
      }
    }, 3500);
    
    // Subscribe to conversations using real-time listener
    const q = query(
      collection(db, "conversations"),
      orderBy("lastMessageAt", "desc"),
      limit(300)
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!isMounted) return;
      clearTimeout(timeoutId);
      
      setLiveStatus("Connected");
      setError(null);
      setLastUpdate(new Date().toLocaleTimeString());
      
      const list: ConversationItem[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ConversationItem[];
      
      // PRODUCTION INBOX HARD FILTER:
      const filteredList = list.filter(c => {
         if (c.platform === "simulator" || c.isTest === true || c.origin === "test" || c.channel === "simulator") return false;
         if (c.id?.startsWith("conv_test") || c.customerName?.toLowerCase().includes("test 100 messages")) return false;
         return true;
      });

      setConversations(filteredList);
      setLoading(false);
    }, (err) => {
      if (!isMounted) return;
      clearTimeout(timeoutId);
      console.warn("Firestore notice, falling back to API:", err);
      apiFetch("/api/admin/conversations")
        .then(r => r.json())
        .then(data => {
          if (Array.isArray(data)) {
            setConversations(data);
            setLiveStatus("Connected");
            setError(null);
          } else {
            setLiveStatus("Disconnected");
            setError(err.message || "Failed to load conversations");
          }
        })
        .catch(() => {
          setLiveStatus("Disconnected");
          setError(err.message || "Failed to load conversations");
        })
        .finally(() => setLoading(false));
    });
    
    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
      unsubscribe();
    };
  }, [refreshTrigger]);

  // Real-time listener for messages (latest 30 real Messenger messages)
  useEffect(() => {
    let isMounted = true;
    if (!selectedConv?.id) {
      setMessages([]);
      setLoadingMessages(false);
      return;
    }
    
    setLoadingMessages(true);
    
    // Safety timeout
    const timeoutId = setTimeout(() => {
      if (isMounted && loadingMessages) {
        setLoadingMessages(false);
      }
    }, 8000);
    
    const q = query(
      collection(db, "conversations", selectedConv.id, "messages"),
      orderBy("timestamp", "desc"),
      limit(messageLimit)
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!isMounted) return;
      clearTimeout(timeoutId);
      
      const rawDocs: MessageItem[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as MessageItem[];
      
      // Strict filter: exclude simulators and test messages
      const realMessages = rawDocs.filter(m => {
        if (m.isTest === true || m.origin === "test" || m.channel === "simulator") return false;
        return true;
      });

      // Deduplicate on stable message ID (id or platformMessageId)
      const deduplicatedMap = new Map<string, MessageItem>();
      for (const msg of realMessages) {
        const key = msg.id || msg.platformMessageId;
        if (key && !deduplicatedMap.has(key)) {
          deduplicatedMap.set(key, msg);
        }
      }
      const deduplicated = Array.from(deduplicatedMap.values());

      // If fetched count matches limit, more older messages may exist in history
      setHasMoreOlder(rawDocs.length >= messageLimit);

      // Strict chronological sort: oldest of the 30 at index 0, newest message at the bottom
      deduplicated.sort(compareMessages);

      // Check whether user is currently near the bottom of the container
      const container = messagesContainerRef.current;
      const nearBottom = container
        ? (container.scrollHeight - container.scrollTop - container.clientHeight <= 140)
        : true;

      const newestMsg = deduplicated[deduplicated.length - 1];
      const newestMsgId = newestMsg ? (newestMsg.id || newestMsg.platformMessageId || null) : null;
      const isNewArrival = lastKnownNewestMessageIdRef.current !== null &&
        newestMsgId !== null &&
        newestMsgId !== lastKnownNewestMessageIdRef.current;

      if (isInitialConversationLoadRef.current) {
        shouldScrollToBottomRef.current = true;
        setShowNewMessageBadge(false);
      } else if (isNewArrival) {
        if (nearBottom) {
          // If already at or near bottom, auto scroll smoothly to latest
          shouldScrollToBottomRef.current = true;
          setShowNewMessageBadge(false);
        } else {
          // If user scrolled up reading older messages, DO NOT force them down
          shouldScrollToBottomRef.current = false;
          setShowNewMessageBadge(true);
        }
      }

      lastKnownNewestMessageIdRef.current = newestMsgId;
      setMessages(deduplicated);
      setLoadingMessages(false);
      setLoadingOlder(false);
      
      // Clear unread count when viewing
      if (selectedConv && selectedConv.unreadCount && selectedConv.unreadCount > 0) {
        updateDoc(doc(db, "conversations", selectedConv.id), { unreadCount: 0 }).catch(() => {});
      }
    }, (error) => {
      if (!isMounted) return;
      clearTimeout(timeoutId);
      console.warn("Firestore messages notice, falling back to API:", error);
      apiFetch(`/api/admin/conversations/${selectedConv.id}/messages?limit=${messageLimit}`)
        .then(r => r.json())
        .then(data => {
          if (Array.isArray(data)) {
            setMessages(data);
          }
        })
        .catch(() => {})
        .finally(() => {
          if (isMounted) {
            setLoadingMessages(false);
            setLoadingOlder(false);
          }
        });
    });
    
    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
      unsubscribe();
    };
  }, [selectedConv?.id, messageLimit]);

  // Post-render scroll management to ensure messages have rendered in DOM before scrolling
  useLayoutEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    if (isPrependingOlderRef.current) {
      // Preserve scroll reading position when older messages were prepended
      const prevH = prevScrollHeightRef.current;
      const prevT = prevScrollTopRef.current;
      const newH = container.scrollHeight;
      container.scrollTop = newH - prevH + prevT;
      isPrependingOlderRef.current = false;
      return;
    }

    if (shouldScrollToBottomRef.current) {
      shouldScrollToBottomRef.current = false;
      if (isInitialConversationLoadRef.current) {
        // Immediate positioning for initial load
        container.scrollTop = container.scrollHeight - container.clientHeight;
        isInitialConversationLoadRef.current = false;
        // Secondary pass on next animation frame for late font/media sizing
        requestAnimationFrame(() => {
          if (container) {
            container.scrollTop = container.scrollHeight - container.clientHeight;
          }
        });
      } else {
        // Smooth scrolling for subsequent incoming/sent messages while near bottom
        container.scrollTo({
          top: container.scrollHeight - container.clientHeight,
          behavior: "smooth"
        });
      }
    }
  }, [messages]);

  // Handle scroll events in the messages container
  const handleMessagesScroll = () => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    const nearBottom = distanceFromBottom <= 140;
    setIsUserNearBottom(nearBottom);
    if (nearBottom) {
      setShowNewMessageBadge(false);
    }
  };

  // Scroll to latest message when clicking "New messages ↓"
  const handleScrollToLatest = () => {
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTo({
        top: container.scrollHeight - container.clientHeight,
        behavior: "smooth"
      });
    }
    setShowNewMessageBadge(false);
  };

  // Load older historical messages beyond the initial 30
  const handleLoadOlderMessages = () => {
    const container = messagesContainerRef.current;
    if (!container || loadingOlder) return;

    prevScrollHeightRef.current = container.scrollHeight;
    prevScrollTopRef.current = container.scrollTop;
    isPrependingOlderRef.current = true;
    setLoadingOlder(true);

    setMessageLimit(prev => prev + 30);
  };

  const formatMessageTime = (ts: any) => {
    const millis = normalizeTimestampToMillis(ts);
    if (!millis) return "";
    try {
      return new Date(millis).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return "";
    }
  };

  const selectConversation = (conv: ConversationItem) => {
    if (selectedConv?.id === conv.id) return;
    isInitialConversationLoadRef.current = true;
    shouldScrollToBottomRef.current = true;
    lastKnownNewestMessageIdRef.current = null;
    setMessageLimit(30);
    setHasMoreOlder(false);
    setShowNewMessageBadge(false);
    setSelectedConv(conv);
    if (conv.unreadCount && conv.unreadCount > 0) {
      updateDoc(doc(db, "conversations", conv.id), { unreadCount: 0 }).catch(() => {});
    }
  };

  const fetchConversations = async (preserveSelectedId?: string) => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/admin/conversations");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setConversations(data);
          if (preserveSelectedId) {
            const found = data.find(c => c.id === preserveSelectedId);
            if (found) setSelectedConv(found);
          }
          setLiveStatus("Connected");
          setError(null);
        }
      }
    } catch (e) {
      console.warn("fetchConversations notice:", e);
    } finally {
      setLoading(false);
    }
    setRefreshTrigger(prev => prev + 1);
  };
  const handleToggleHandoff = async () => {
    if (!selectedConv) return;
    const newHandoff = !selectedConv.humanHandoff;
    try {
      const res = await apiFetch(`/api/admin/conversations/${selectedConv.id}/handoff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ humanHandoff: newHandoff })
      });
      if (res.ok) {
        const data = await res.json();
        const updated = { 
          ...selectedConv, 
          humanHandoff: data.humanHandoff, 
          aiEnabled: data.aiEnabled 
        };
        setSelectedConv(updated);
        setConversations(prev => prev.map(c => c.id === selectedConv.id ? updated : c));
        setActionNotice({
          type: "info",
          text: newHandoff 
            ? "Human Handoff enabled. AI Sales Agent is now silent for this conversation." 
            : "AI Sales Agent restored. Gemini will automatically reply to new customer messages."
        });
        setTimeout(() => setActionNotice(null), 4000);
      }
    } catch (e: any) {
      console.error(e);
      setError("Failed to update handoff status");
    }
  };

  /**
   * Triggers live sync with Meta Graph API
   */
  const handleSyncLiveMeta = async () => {
    setSyncingMeta(true);
    setActionNotice(null);
    try {
      const res = await apiFetch("/api/admin/conversations/sync-meta", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        if (data.error && data.syncedCount > 0) {
          setActionNotice({
            type: "warning",
            text: `Synced ${data.syncedCount} conversations, but with errors: ${data.error}`
          });
          fetchConversations();
        } else if (data.syncedCount > 0) {
          setActionNotice({
            type: "success",
            text: `Meta Graph API synced ${data.syncedCount} live conversations (${data.platforms?.messenger || 0} Messenger, ${data.platforms?.instagram || 0} Instagram)!`
          });
          fetchConversations();
        } else if (data.permissionRequired) {
          setActionNotice({
            type: "warning",
            text: `Meta API notice: ${data.permissionDetails || "Missing 'pages_messaging' permission in Meta App"}.`
          });
          setShowPermGuide(true);
        } else if (data.error) {
          setActionNotice({
            type: "warning",
            text: `Meta Graph API sync encountered an error: ${data.error}`
          });
          fetchConversations();
        } else {
          setActionNotice({
            type: "info",
            text: "Meta Graph API checked: 0 new messages found on your Page. Loaded current active conversations."
          });
          fetchConversations();
        }
      } else {
        setActionNotice({ type: "warning", text: data.error || "Meta Graph API sync request failed." });
      }
    } catch (err: any) {
      console.error("Sync error:", err);
      setActionNotice({ type: "warning", text: "Network error connecting to Meta Graph API." });
    } finally {
      setSyncingMeta(false);
      setTimeout(() => setActionNotice(null), 7000);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !selectedConv || sendingMessage) return;

    const currentText = replyText.trim();
    setReplyText("");
    setSendingMessage(true);

    // Optimistic message
    const optimisticMsg: MessageItem = {
      id: `temp_${Date.now()}`,
      direction: "outbound",
      sender: "Admin",
      type: "text",
      text: currentText,
      timestamp: new Date().toISOString(),
      source: "messenger",
      channel: "messenger",
      origin: "production",
      isTest: false
    };
    shouldScrollToBottomRef.current = true;
    setShowNewMessageBadge(false);
    setMessages(prev => [...prev, optimisticMsg]);

    try {
      const res = await apiFetch(`/api/admin/conversations/${selectedConv.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: currentText })
      });

      if (res.ok) {
        const savedMsg = await res.json();
        setMessages(prev => prev.map(m => m.id === optimisticMsg.id ? savedMsg : m));
        if (savedMsg.platformError) {
          setActionNotice({
            type: "warning",
            text: `Message saved in dashboard, but delivery to ${selectedConv.platform} failed: ${savedMsg.platformError}`
          });
        }
        // Update snippet in conversation list
        setConversations(prev => prev.map(c => 
          c.id === selectedConv.id 
            ? { ...c, snippet: currentText, updatedAt: new Date().toISOString() } 
            : c
        ));
      } else {
        const err = await res.json().catch(() => ({}));
        setActionNotice({ type: "warning", text: err.error || "Failed to send message." });
      }
    } catch (e: any) {
      console.error("Error sending admin message:", e);
      setActionNotice({ type: "warning", text: "Failed to send message." });
    } finally {
      setSendingMessage(false);
    }
  };

  // Filtered conversation list
  const filteredConversations = conversations
    .filter(conv => {
      // Platform filter
      if (platformFilter !== "all" && conv.platform !== platformFilter) return false;
      
      // Status filter
      if (statusFilter === "human" && !conv.humanHandoff) return false;
      if (statusFilter === "ai" && conv.humanHandoff) return false;
      if (statusFilter === "pending" && !(conv.unreadCount && conv.unreadCount > 0)) return false;

      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const name = (conv.customerName || "").toLowerCase();
        const username = (conv.customerUsername || "").toLowerCase();
        const phone = (conv.customerPhone || "").toLowerCase();
        const snippet = (conv.snippet || "").toLowerCase();
        const custId = (conv.customerId || "").toLowerCase();
        return name.includes(query) || username.includes(query) || phone.includes(query) || snippet.includes(query) || custId.includes(query);
      }

      return true;
    })
    .sort((a, b) => {
      const aUnread = (a.unreadCount || 0) > 0 ? 1 : 0;
      const bUnread = (b.unreadCount || 0) > 0 ? 1 : 0;
      if (aUnread !== bUnread) {
        return bUnread - aUnread;
      }
      const timeA = new Date(a.lastMessageAt || a.updatedAt || 0).getTime();
      const timeB = new Date(b.lastMessageAt || b.updatedAt || 0).getTime();
      return timeB - timeA;
    });

  // Platform counters
  const messengerCount = conversations.filter(c => c.platform === "messenger").length;
  const instagramCount = conversations.filter(c => c.platform === "instagram").length;
  const allCount = conversations.length;
  const telegramCount = conversations.filter(c => c.platform === "telegram").length;

  const renderPlatformBadge = (platform: string, compact = false, isTest = false) => {
    if (isTest || platform === "simulator") {
      return (
        <span className={`inline-flex items-center gap-1 rounded font-medium ${
          compact ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-0.5 text-xs"
        } bg-orange-50 text-orange-700 border border-orange-200`}>
          <Sparkles className="w-3 h-3 text-orange-600" />
          TEST / SIMULATOR
        </span>
      );
    }
    switch (platform) {
      case "messenger":
        return (
          <span className={`inline-flex items-center gap-1 rounded font-medium ${
            compact ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-0.5 text-xs"
          } bg-blue-50 text-blue-700 border border-blue-200`}>
            <MessageCircle className="w-3 h-3 text-blue-600" />
            Messenger
          </span>
        );
      case "instagram":
        return (
          <span className={`inline-flex items-center gap-1 rounded font-medium ${
            compact ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-0.5 text-xs"
          } bg-pink-50 text-pink-700 border border-pink-200`}>
            <Camera className="w-3 h-3 text-pink-600" />
            Instagram
          </span>
        );
      case "telegram":
        return (
          <span className={`inline-flex items-center gap-1 rounded font-medium ${
            compact ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-0.5 text-xs"
          } bg-sky-50 text-sky-700 border border-sky-200`}>
            <Send className="w-3 h-3 text-sky-600" />
            Telegram
          </span>
        );
      default:
        return (
          <span className={`inline-flex items-center gap-1 rounded font-medium ${
            compact ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-0.5 text-xs"
          } bg-gray-100 text-gray-700 border border-gray-200`}>
            Web/Sim
          </span>
        );
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        {/* Header with Title and Action Buttons */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900 tracking-tight">Active Conversations & Inbox</h1>
              <span className="bg-emerald-100 text-emerald-800 text-xs px-2 py-0.5 rounded-full font-semibold">
                Live Multi-Channel
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Omnichannel customer sales across Facebook Messenger, Instagram Direct, Telegram, and Web.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Test AI Reply Simulation */}
            <button
              onClick={() => setShowSimulatorModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:from-purple-700 hover:to-indigo-700 shadow-sm transition cursor-pointer"
              title="Simulate customer message to test AI auto-replies directly in inbox"
            >
              <Bot className="w-3.5 h-3.5" />
              Test AI Reply
            </button>

            {/* Sync Live Meta API */}
            <button
              onClick={handleSyncLiveMeta}
              disabled={syncingMeta}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 shadow-sm transition disabled:opacity-60 cursor-pointer"
              title="Query Meta Graph API for real customer messages on your connected Page"
            >
              {syncingMeta ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              Sync Meta (IG & Messenger)
            </button>

            {/* Reply to Unreplied Messages */}
            <button
              onClick={handleReplyAllUnreplied}
              disabled={replyingUnreplied}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm transition disabled:opacity-60 cursor-pointer"
              title="Trigger AI to reply to all customer messages that haven't received a response yet"
            >
              {replyingUnreplied ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              Reply to Unreplied
            </button>

            {/* Refresh Inbox */}
            <button
              onClick={() => fetchConversations(selectedConv?.id)}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 shadow-sm transition disabled:opacity-60 cursor-pointer"
              title="Refresh conversation list"
            >
              {loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-500" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5 text-gray-500" />
              )}
              Refresh
            </button>
          </div>
        </div>

        {/* Action Notice Alert */}
        {actionNotice && (
          <div className={`p-3 rounded-lg border text-xs flex items-start justify-between gap-2 ${
            actionNotice.type === "success" 
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : actionNotice.type === "warning"
              ? "bg-amber-50 border-amber-200 text-amber-800"
              : "bg-blue-50 border-blue-200 text-blue-800"
          }`}>
            <div className="flex items-center gap-2">
              {actionNotice.type === "success" && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
              {actionNotice.type === "warning" && <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />}
              {actionNotice.type === "info" && <Info className="w-4 h-4 text-blue-600 shrink-0" />}
              <span>{actionNotice.text}</span>
            </div>
            <button onClick={() => setActionNotice(null)} className="text-gray-400 hover:text-gray-600">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Meta Permissions Helper Banner */}
        {showPermGuide && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-xs text-indigo-900">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2 font-semibold mb-1">
                <Shield className="w-4 h-4 text-indigo-600" />
                <span>Meta Developer Scopes Configuration Notice</span>
              </div>
              <button onClick={() => setShowPermGuide(false)} className="text-indigo-400 hover:text-indigo-600">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-indigo-700 leading-relaxed">
              Your Page Access Token connects to Facebook & Instagram. To receive live customer events via webhook and Graph API, ensure your Meta App in <strong>developers.facebook.com</strong> has granted permissions:
              <code className="bg-white/80 px-1 py-0.5 rounded mx-1 text-indigo-900 font-mono text-[11px]">pages_messaging</code>, 
              <code className="bg-white/80 px-1 py-0.5 rounded mx-1 text-indigo-900 font-mono text-[11px]">instagram_manage_messages</code>, and 
              <code className="bg-white/80 px-1 py-0.5 rounded mx-1 text-indigo-900 font-mono text-[11px]">pages_manage_metadata</code>.
            </p>
            <div className="mt-2 flex items-center gap-3">
              <a href="/connectors" className="font-semibold text-indigo-800 underline hover:text-indigo-950 flex items-center gap-1">
                View Webhook URL & Connector Settings <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        )}

        {/* Main 2-Column Split: Conversation List & Chat View */}
        <div className="flex flex-col lg:flex-row h-[calc(100vh-210px)] min-h-[550px] bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          
          {/* Left Column: Search, Filter Tabs & Conversation List */}
          <div className={`w-full lg:w-80 xl:w-96 border-r border-gray-200 flex-col bg-gray-50/50 ${selectedConv ? 'hidden lg:flex' : 'flex'}`}>
            
            {/* Search Input */}
            <div className="p-3 border-b border-gray-200 bg-white">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search customer, handle, message..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition"
                />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery("")} 
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Platform Pills */}
              <div className="flex items-center gap-1.5 mt-2.5 overflow-x-auto pb-0.5 scrollbar-none text-[11px]">
                <button
                  onClick={() => {
                    setPlatformFilter("all");
                    if (conversations.length > 0) selectConversation(conversations[0]);
                  }}
                  className={`px-2.5 py-1 rounded-full shrink-0 transition cursor-pointer ${
                    platformFilter === "all" 
                      ? "bg-gray-900 text-white shadow-xs font-semibold" 
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200 font-medium"
                  }`}
                >
                  All ({allCount})
                </button>
                <button
                  onClick={() => {
                    setPlatformFilter("instagram");
                    const ig = conversations.filter(c => c.platform === "instagram");
                    if (ig.length > 0) selectConversation(ig[0]);
                  }}
                  className={`px-2.5 py-1 rounded-full shrink-0 flex items-center gap-1.5 transition cursor-pointer ${
                    platformFilter === "instagram" 
                      ? "bg-pink-600 text-white shadow-xs font-semibold" 
                      : "bg-pink-50 text-pink-700 hover:bg-pink-100 font-medium"
                  }`}
                >
                  <Camera className="w-3 h-3" />
                  Instagram ({instagramCount})
                </button>
                <button
                  onClick={() => {
                    setPlatformFilter("messenger");
                    const m = conversations.filter(c => c.platform === "messenger");
                    if (m.length > 0) selectConversation(m[0]);
                  }}
                  className={`px-2.5 py-1 rounded-full shrink-0 flex items-center gap-1.5 transition cursor-pointer ${
                    platformFilter === "messenger" 
                      ? "bg-blue-600 text-white shadow-xs font-semibold" 
                      : "bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium"
                  }`}
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  Messenger ({messengerCount})
                </button>
                {telegramCount > 0 && (
                  <button
                    onClick={() => {
                      setPlatformFilter("telegram");
                      const tg = conversations.filter(c => c.platform === "telegram");
                      if (tg.length > 0) selectConversation(tg[0]);
                    }}
                    className={`px-2.5 py-1 rounded-full font-medium shrink-0 flex items-center gap-1.5 transition cursor-pointer ${
                      platformFilter === "telegram" 
                        ? "bg-sky-600 text-white shadow-xs font-semibold" 
                        : "bg-sky-50 text-sky-700 hover:bg-sky-100"
                    }`}
                  >
                    <Send className="w-3 h-3" />
                    Telegram ({telegramCount})
                  </button>
                )}
              </div>

              {/* Status Filter Toggle */}
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100 text-[11px] text-gray-500">
                <span className="font-medium">Filter status:</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setStatusFilter("all")}
                    className={`px-1.5 py-0.5 rounded cursor-pointer ${statusFilter === "all" ? "font-semibold text-gray-900 underline" : "text-gray-500 hover:text-gray-700"}`}
                  >
                    All
                  </button>
                  <span>•</span>
                  <button
                    onClick={() => setStatusFilter("ai")}
                    className={`px-1.5 py-0.5 rounded cursor-pointer ${statusFilter === "ai" ? "font-semibold text-emerald-700 underline" : "text-gray-500 hover:text-emerald-700"}`}
                  >
                    AI Active
                  </button>
                  <span>•</span>
                  <button
                    onClick={() => setStatusFilter("human")}
                    className={`px-1.5 py-0.5 rounded cursor-pointer ${statusFilter === "human" ? "font-semibold text-amber-700 underline" : "text-gray-500 hover:text-amber-700"}`}
                  >
                    Human Handoff
                  </button>
                </div>
              </div>
            </div>

            {/* Scrollable Conversation List */}
            <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
              {loading ? (
                <div className="p-8 text-center text-gray-400 text-xs flex flex-col items-center">
                  <Loader2 className="w-5 h-5 animate-spin mb-2 text-blue-600" />
                  Loading conversations...
                </div>
              ) : error ? (
                <div className="p-8 text-center text-red-500 text-xs flex flex-col items-center">
                  <AlertTriangle className="w-6 h-6 mb-2 text-red-500" />
                  <p className="font-semibold">Unable to load conversations.</p>
                  <p className="mt-1">{error}</p>
                  <button 
                    onClick={() => window.location.reload()} 
                    className="mt-3 px-4 py-2 bg-red-100 hover:bg-red-200 text-red-800 rounded-md transition cursor-pointer font-medium"
                  >
                    Retry
                  </button>
                </div>
              ) : filteredConversations.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-xs flex flex-col items-center justify-center">
                  <MessageSquare className="w-8 h-8 mb-2 text-gray-300" />
                  <p className="font-semibold text-gray-700">No conversations yet</p>
                  <p className="text-[11px] text-gray-500 mt-1 max-w-[200px] leading-relaxed">
                    Live customer messages received via Instagram & Messenger will automatically appear here.
                  </p>
                  <button
                    onClick={handleSyncLiveMeta}
                    disabled={syncingMeta}
                    className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 cursor-pointer shadow-sm disabled:opacity-60"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${syncingMeta ? "animate-spin" : ""}`} />
                    Sync Meta (IG & Messenger)
                  </button>
                </div>
              ) : (
                filteredConversations.map((conv) => {
                  const isSelected = selectedConv?.id === conv.id;
                  const displayName = conv.customerName || conv.customerId;
                  return (
                    <div
                      key={conv.id}
                      onClick={() => selectConversation(conv)}
                      className={`p-3 cursor-pointer transition flex flex-col gap-1 text-left ${
                        isSelected 
                          ? "bg-blue-50/80 border-l-4 border-blue-600" 
                          : "hover:bg-white bg-transparent border-l-4 border-transparent"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="font-semibold text-xs text-gray-900 truncate">
                            {displayName}
                          </span>
                          {conv.customerUsername && (
                            <span className="text-[10px] text-gray-400 truncate">
                              @{conv.customerUsername}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-gray-400 shrink-0">
                          {conv.updatedAt ? new Date(conv.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ""}
                        </span>
                      </div>

                      {/* Message snippet preview */}
                      <p className="text-xs text-gray-600 line-clamp-2 leading-relaxed" dir="auto">
                        {conv.snippet || "No messages yet"}
                      </p>

                      {/* Footer tags: Platform & AI/Human state */}
                      <div className="flex items-center justify-between gap-1 mt-1 pt-1">
                        <div>
                          {renderPlatformBadge(conv.platform, true, conv.isTest)}
                        </div>
                        <div>
                          {conv.humanHandoff ? (
                            <span className="text-[10px] bg-amber-50 text-amber-800 border border-amber-200 px-1.5 py-0.5 rounded font-medium flex items-center gap-0.5">
                              <User className="w-2.5 h-2.5" />
                              Human
                            </span>
                          ) : (
                            <span className="text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-200 px-1.5 py-0.5 rounded font-medium flex items-center gap-0.5">
                              <Sparkles className="w-2.5 h-2.5 text-emerald-600" />
                              AI Agent
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column: Active Conversation Chat Pane */}
          <div className={`flex-1 flex-col bg-white overflow-hidden min-h-0 ${!selectedConv ? 'hidden lg:flex' : 'flex'}`}>
            {selectedConv ? (
              <>
                {/* Chat Top Header */}
                <div className="shrink-0 p-3.5 border-b border-gray-200 bg-gray-50 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {/* Mobile Back Button */}
                    <button
                      onClick={() => setSelectedConv(null)}
                      className="lg:hidden p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-200 rounded-md transition cursor-pointer"
                    >
                      <ArrowLeft className="w-5 h-5" />
                    </button>
            <div className="flex items-center gap-2 text-xs font-medium px-2 py-1 bg-white border border-gray-200 rounded-md shadow-sm">
              LIVE SYNC: {liveStatus === "Connected" ? "🟢" : liveStatus === "Connecting" ? "🟡" : "🔴"} {liveStatus}
              <span className="text-gray-400 ml-1">| Update: {lastUpdate || "--:--"}</span>
            </div>
                    <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-bold text-sm flex items-center justify-center shadow-sm">
                      {(selectedConv.customerName || selectedConv.customerId).charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="font-bold text-sm text-gray-900">
                          {selectedConv.customerName || selectedConv.customerId}
                        </h2>
                        {renderPlatformBadge(selectedConv.platform, false, selectedConv.isTest)}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                        {selectedConv.customerUsername && <span>@{selectedConv.customerUsername}</span>}
                        {selectedConv.customerPhone && (
                          <span className="flex items-center gap-0.5">
                            <Phone className="w-2.5 h-2.5 text-gray-400" />
                            {selectedConv.customerPhone}
                          </span>
                        )}
                        <span>•</span>
                        <span className="font-mono text-[10px] text-gray-400">ID: {selectedConv.id.slice(0, 14)}...</span>
                      </div>
                    </div>
                  </div>

                  {/* Human Handoff Switcher */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleToggleHandoff}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition shadow-sm cursor-pointer ${
                        selectedConv.humanHandoff
                          ? "bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100"
                          : "bg-emerald-50 border-emerald-300 text-emerald-900 hover:bg-emerald-100"
                      }`}
                      title={selectedConv.humanHandoff ? "Click to let AI Sales Agent respond" : "Click to take over conversation manually"}
                    >
                      {selectedConv.humanHandoff ? (
                        <>
                          <User className="w-3.5 h-3.5 text-amber-700" />
                          <span>Human Handoff Active</span>
                          <ToggleRight className="w-4 h-4 text-amber-700" />
                        </>
                      ) : (
                        <>
                          <Bot className="w-3.5 h-3.5 text-emerald-700" />
                          <span>AI Sales Agent Active</span>
                          <ToggleLeft className="w-4 h-4 text-emerald-700" />
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Messages Feed Area with Floating Scroll-to-Bottom Indicator */}
                <div className="flex-1 relative min-h-0 flex flex-col bg-slate-50/50">
                  <div
                    ref={messagesContainerRef}
                    onScroll={handleMessagesScroll}
                    className="flex-1 overflow-y-auto overscroll-contain min-h-0 p-4 space-y-3.5"
                    style={{ WebkitOverflowScrolling: "touch" }}
                  >
                    {/* Load Older Messages Pagination */}
                    {hasMoreOlder && messages.length >= 30 && (
                      <div className="flex justify-center pb-2">
                        <button
                          id="btn-load-older-messages"
                          onClick={handleLoadOlderMessages}
                          disabled={loadingOlder}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white hover:bg-gray-100 hover:text-gray-900 border border-gray-200 rounded-full shadow-xs transition cursor-pointer disabled:opacity-50"
                        >
                          {loadingOlder ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                              <span>Loading older messages...</span>
                            </>
                          ) : (
                            <>
                              <History className="w-3.5 h-3.5 text-gray-500" />
                              <span>Load older messages</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}

                    {loadingMessages ? (
                      <div className="flex items-center justify-center h-full text-gray-400 text-xs">
                        <Loader2 className="w-5 h-5 animate-spin mr-2 text-blue-600" />
                        Loading latest real messages...
                      </div>
                    ) : messages.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-gray-400 text-xs">
                        <MessageSquare className="w-8 h-8 text-gray-300 mb-1" />
                        <p>No messages recorded yet in this conversation.</p>
                      </div>
                    ) : (
                      messages.map((msg, idx) => {
                        const isOutbound = msg.direction === "outbound" || msg.direction === "outgoing";
                        const isAdmin = isOutbound && (msg.sender === "Admin" || msg.sender?.toLowerCase().includes("admin"));
                        const stableKey = msg.id || msg.platformMessageId || `msg-${normalizeTimestampToMillis(msg.timestamp)}-${idx}`;
                        
                        return (
                          <div
                            key={stableKey}
                            id={`msg-${stableKey}`}
                            className={`flex flex-col ${isOutbound ? "items-end" : "items-start"}`}
                          >
                            {/* Sender badge */}
                            <div className="flex items-center gap-1 mb-1 text-[11px] text-gray-400 px-1">
                              {isOutbound ? (
                                isAdmin ? (
                                  <span className="font-semibold text-indigo-700 flex items-center gap-1">
                                    <Shield className="w-2.5 h-2.5" />
                                    Admin Rep
                                  </span>
                                ) : (
                                  <span className="font-semibold text-blue-700 flex items-center gap-1">
                                    <Sparkles className="w-2.5 h-2.5 text-blue-600" />
                                    AI Sales Agent (Gemini)
                                  </span>
                                )
                              ) : (
                                <span className="font-medium text-gray-600 flex items-center gap-1">
                                  <User className="w-2.5 h-2.5 text-gray-400" />
                                  {selectedConv.customerName || "Customer"}
                                </span>
                              )}
                              <span>•</span>
                              <span>{formatMessageTime(msg.timestamp)}</span>
                            </div>

                            {/* Message bubble */}
                            <div
                              dir="auto"
                              className={`max-w-[82%] sm:max-w-[70%] rounded-2xl p-3 text-xs leading-relaxed shadow-sm whitespace-pre-wrap ${
                                isOutbound
                                  ? isAdmin
                                    ? "bg-indigo-600 text-white rounded-tr-xs"
                                    : "bg-blue-600 text-white rounded-tr-xs"
                                  : "bg-white text-gray-900 border border-gray-200 rounded-tl-xs"
                              }`}
                            >
                              {/* Media audio preview if voice note */}
                              {(msg.type === "voice" || msg.mediaUrl?.includes(".ogg") || msg.mediaUrl?.includes(".opus") || msg.mediaUrl?.includes("audio") || msg.mediaUrl?.includes("voice_message")) && msg.mediaUrl ? (
                                <div className={`mb-2 p-2.5 rounded-lg border ${
                                  isOutbound ? "bg-white/15 border-white/25 text-white" : "bg-gray-50 border-gray-200 text-gray-800"
                                }`}>
                                  <div className="flex items-center gap-1.5 mb-1.5 text-[11px] font-semibold">
                                    <Volume2 className="w-3.5 h-3.5 shrink-0" />
                                    <span>Voice Note (Audio Message)</span>
                                  </div>
                                  <audio controls src={msg.mediaUrl} className="w-full h-8 max-w-[260px]" preload="metadata" />
                                </div>
                              ) : msg.mediaUrl ? (
                                <div className="mb-2 overflow-hidden rounded-lg border border-white/20 bg-black/5">
                                  <img
                                    src={msg.mediaUrl}
                                    alt="Attachment"
                                    className="max-h-60 w-auto object-cover rounded cursor-pointer hover:opacity-95"
                                    referrerPolicy="no-referrer"
                                    onClick={() => window.open(msg.mediaUrl, "_blank")}
                                  />
                                </div>
                              ) : null}

                              {msg.text || (msg.type === "voice" ? "Voice message (audio note)" : "")}
                            </div>
                          </div>
                        );
                      })
                    )}
                    <div ref={messagesEndRef} className="h-0 w-0 shrink-0" />
                  </div>

                  {/* Floating 'New messages ↓' Button */}
                  {showNewMessageBadge && (
                    <button
                      id="btn-scroll-to-latest"
                      onClick={handleScrollToLatest}
                      className="absolute bottom-4 right-4 z-20 inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg text-xs font-semibold transition-all cursor-pointer animate-bounce"
                      title="Scroll to latest message"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                      <span>New messages ↓</span>
                    </button>
                  )}
                </div>

                {/* Composer Bottom Bar */}
                <div className="shrink-0 p-3 border-t border-gray-200 bg-white">
                  {/* Quick Simulator Test Chips */}
                  <div className="mb-2 flex items-center gap-1.5 overflow-x-auto text-[11px] text-gray-500 pb-1 scrollbar-none">
                    <span className="shrink-0 font-medium text-gray-600 flex items-center gap-1">
                      <Bot className="w-3 h-3 text-purple-600" /> Test Customer Prompt:
                    </span>
                    <button
                      type="button"
                      disabled={simulating}
                      onClick={() => handleSimulateMessage("Salam khoya, wach kayen 3andkom?")}
                      className="px-2 py-0.5 bg-purple-50 hover:bg-purple-100 hover:text-purple-800 text-purple-700 rounded text-xs border border-purple-200 transition shrink-0 cursor-pointer disabled:opacity-50"
                    >
                      "Salam wach kayen?"
                    </button>
                    <button
                      type="button"
                      disabled={simulating}
                      onClick={() => handleSimulateMessage("Ch7al prix ta3 Gemini Pro?")}
                      className="px-2 py-0.5 bg-purple-50 hover:bg-purple-100 hover:text-purple-800 text-purple-700 rounded text-xs border border-purple-200 transition shrink-0 cursor-pointer disabled:opacity-50"
                    >
                      "Ch7al prix Gemini Pro?"
                    </button>
                    <button
                      type="button"
                      disabled={simulating}
                      onClick={() => handleSimulateMessage("Daccord khoya hab nkhales b BaridiMob")}
                      className="px-2 py-0.5 bg-purple-50 hover:bg-purple-100 hover:text-purple-800 text-purple-700 rounded text-xs border border-purple-200 transition shrink-0 cursor-pointer disabled:opacity-50"
                    >
                      "Hab nkhales b BaridiMob"
                    </button>
                    {simulating && <Loader2 className="w-3.5 h-3.5 text-purple-600 animate-spin shrink-0" />}
                  </div>

                  {!selectedConv.humanHandoff && (
                    <div className="mb-2 px-2.5 py-1 bg-amber-50 border border-amber-200 rounded-md text-[11px] text-amber-800 flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-amber-600 shrink-0" />
                        AI is currently handling sales. Sending a message will automatically notify the customer as Admin.
                      </span>
                      <button
                        onClick={handleToggleHandoff}
                        className="underline font-semibold hover:text-amber-950 cursor-pointer"
                      >
                        Switch to Human
                      </button>
                    </div>
                  )}

                  <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder={`Reply to ${selectedConv.customerName || "customer"} on ${selectedConv.platform.toUpperCase()}...`}
                      className="flex-1 px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <button
                      type="submit"
                      disabled={!replyText.trim() || sendingMessage}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm flex items-center gap-1.5 transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      {sendingMessage ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Send className="w-3.5 h-3.5" />
                      )}
                      Send
                    </button>
                  </form>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-gray-400">
                <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                  <MessageSquare className="w-7 h-7 text-gray-400" />
                </div>
                <h3 className="font-semibold text-gray-700 text-sm">Select a Conversation</h3>
                <p className="text-xs text-gray-500 max-w-xs mt-1 leading-relaxed">
                  Choose a live customer conversation from the list to view the full chat history and reply directly via Meta Messenger.
                </p>
                <button
                  onClick={() => setShowSimulatorModal(true)}
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-xs font-semibold rounded-lg shadow hover:from-purple-700 hover:to-indigo-700 transition cursor-pointer"
                >
                  <Bot className="w-4 h-4" />
                  Test AI Sales Agent
                </button>
              </div>
            )}
          </div>
        </div>

        {/* AI Reply Simulator Modal */}
        {showSimulatorModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
                    <Bot className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 text-sm">Test AI Sales Agent</h3>
                    <p className="text-xs text-gray-500">Send an inbound message to verify instant replies</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowSimulatorModal(false)}
                  className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 cursor-pointer transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Customer Name</label>
                  <input
                    type="text"
                    value={simCustomerName}
                    onChange={(e) => setSimCustomerName(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none"
                    placeholder="e.g. Mohamed"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Platform</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setSimPlatform("messenger")}
                      className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium border transition cursor-pointer flex items-center justify-center gap-1.5 ${
                        simPlatform === "messenger"
                          ? "bg-blue-50 border-blue-500 text-blue-700 font-semibold"
                          : "border-gray-200 text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      <MessageCircle className="w-3.5 h-3.5 text-blue-600" />
                      Messenger
                    </button>
                    <button
                      type="button"
                      onClick={() => setSimPlatform("instagram")}
                      className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium border transition cursor-pointer flex items-center justify-center gap-1.5 ${
                        simPlatform === "instagram"
                          ? "bg-pink-50 border-pink-500 text-pink-700 font-semibold"
                          : "border-gray-200 text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      <Camera className="w-3.5 h-3.5 text-pink-600" />
                      Instagram
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Customer Question (Darija / Arabic / French)</label>
                  <textarea
                    rows={3}
                    value={simMessageText}
                    onChange={(e) => setSimMessageText(e.target.value)}
                    placeholder="e.g. Salam khoya, ch7al prix ta3 Gemini Pro?"
                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  />
                </div>

                <div>
                  <span className="block text-[11px] font-medium text-gray-500 mb-1.5">Quick Prompts:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      "Salam, wach kayen 3andkom?",
                      "Ch7al prix ta3 Gemini Pro?",
                      "Kayen CapCut Pro?",
                      "Daccord khoya hab nkhales b BaridiMob",
                      "3tini numero ta3 compte BaridiMob"
                    ].map((prompt, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setSimMessageText(prompt)}
                        className="text-[11px] px-2 py-1 bg-gray-100 hover:bg-purple-50 hover:text-purple-700 hover:border-purple-200 border border-gray-200 rounded-md text-gray-700 transition cursor-pointer"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowSimulatorModal(false)}
                    className="px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg text-xs font-medium transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={!simMessageText.trim() || simulating}
                    onClick={() => handleSimulateMessage()}
                    className="px-5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg text-xs font-semibold shadow hover:from-purple-700 hover:to-indigo-700 flex items-center gap-1.5 transition disabled:opacity-50 cursor-pointer"
                  >
                    {simulating ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        AI Generating Reply...
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        Send & Trigger AI
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
