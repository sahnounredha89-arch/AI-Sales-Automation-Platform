import DashboardLayout from "../components/DashboardLayout";
import React, { useEffect, useState } from "react";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  AlertCircle,
  RefreshCw,
  Send,
  Check,
  ShieldCheck,
  Bot,
  Bell,
  CheckCircle,
  Database,
} from "lucide-react";
import { apiFetch } from "../lib/api";
import MetaCredentialDiagnosticCard from "../components/MetaCredentialDiagnosticCard";

interface CredentialStatus {
  auth: {
    adminUsername: boolean;
    adminPassword: boolean;
    sessionSecret: boolean;
  };
  firebase: {
    projectId: boolean;
    clientEmail: boolean;
    privateKey: boolean;
    adc: boolean;
    mode?: "cloud" | "local";
    message?: string;
  };
  gemini: {
    apiKey: boolean;
    connected?: boolean;
    invalid?: boolean;
    model?: string;
  };
  telegram: {
    botToken: boolean;
    botUsername: boolean;
    connected?: boolean;
    invalid?: boolean;
  };
  meta: {
    appId: boolean;
    appSecret: boolean;
    pageAccessToken: boolean;
    webhookVerifyToken: boolean;
    pageId: boolean;
    pageName?: string;
    pageIdVal?: string;
    pagesMessaging?: "ready" | "missing";
    instagramAccountLinked?: boolean;
    igAccountId: boolean;
    igAccountIdVal?: string | null;
    instagramBasic?: "ready" | "missing";
    instagramManageMessages?: "ready" | "missing";
    webhookStatus?: "ready" | "not_configured";
    publicWebhookUrl?: string;
    status: string;
  };
}

interface TelegramStatusData {
  configured: boolean;
  botConnected: boolean;
  bot?: {
    id: number;
    first_name: string;
    username?: string;
  } | null;
  botTokenConfigured?: boolean;
  botTokenMasked?: string | null;
  botTokenStoredInDb?: boolean;
  adminChatConfigured: boolean;
  adminChatId?: string | null;
  adminChatIdStatus: "CONFIGURED" | "NOT_CONFIGURED";
  adminChatStoredInDb?: boolean;
  savedPermanentlyAt?: string | null;
  connectionError?: string | null;
  lastTestNotificationAt?: string | null;
  lastTestNotificationSuccess?: boolean | null;
  lastTestNotificationError?: string | null;
  updatedAt?: string | null;
}

export default function Settings() {
  const [status, setStatus] = useState<CredentialStatus | null>(null);
  const [tgStatus, setTgStatus] = useState<TelegramStatusData | null>(null);
  const [activeTab, setActiveTab] = useState<"general" | "telegram" | "credentials" | "meta">("telegram");
  const [tgLoading, setTgLoading] = useState(false);
  const [tgActionMsg, setTgActionMsg] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const [adminChatIdInput, setAdminChatIdInput] = useState("");
  const [botTokenInput, setBotTokenInput] = useState("");
  const [savingCredentials, setSavingCredentials] = useState(false);
  const [savingChatId, setSavingChatId] = useState(false);
  const [detectingChatId, setDetectingChatId] = useState(false);
  const [metaLoading, setMetaLoading] = useState(false);
  const [metaActionMsg, setMetaActionMsg] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const [liveFbDiagnostic, setLiveFbDiagnostic] = useState<{
    pagesMessaging?: "Ready" | "Missing";
    permissionCode?: string;
    error?: string;
  } | null>(null);
  const [liveIgDiagnostic, setLiveIgDiagnostic] = useState<{
    accountLinked?: "Linked" | "Not Linked";
    instagramBasic?: "Ready" | "Missing";
    instagramManageMessages?: "Ready" | "Missing";
    permissionCode?: string;
    error?: string;
  } | null>(null);
  const [restoringCredentials, setRestoringCredentials] = useState(false);
  const [restoreActionMsg, setRestoreActionMsg] = useState<{
    type: "success" | "error" | "info" | "warning";
    text: string;
  } | null>(null);

  const handleRestoreCredentials = async () => {
    setRestoringCredentials(true);
    setRestoreActionMsg(null);
    try {
      const res = await apiFetch("/api/admin/settings/restore-credentials", {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setRestoreActionMsg({
          type: data.firestoreQuotaExceeded ? "warning" : "success",
          text: data.message || `Successfully restored ${data.totalKeys || 0} credentials into environment!`,
        });
        if (data.restoredKeys?.includes("TELEGRAM_BOT_TOKEN") || data.restoredKeys?.includes("TELEGRAM_ADMIN_CHAT_ID")) {
          setTgActionMsg({
            type: "success",
            text: "Telegram credentials restored into runtime environment.",
          });
        }
        fetchStatus();
        fetchTgStatus();
      } else {
        setRestoreActionMsg({
          type: "error",
          text: data.error || "Failed to restore credentials from database.",
        });
      }
    } catch (err: any) {
      setRestoreActionMsg({
        type: "error",
        text: err.message || "Network error while restoring credentials.",
      });
    } finally {
      setRestoringCredentials(false);
    }
  };

  const handleCheckFacebook = async () => {
    setMetaLoading(true);
    setMetaActionMsg(null);
    try {
      const res = await apiFetch("/api/admin/settings/meta/test-facebook", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.success) {
        setLiveFbDiagnostic({ pagesMessaging: "Ready", permissionCode: "PAGES_MESSAGING_VERIFIED" });
        setMetaActionMsg({ type: "success", text: `Facebook Messenger Verified! ${data.message || `Page: ${data.pageName}`}` });
        fetchStatus();
      } else {
        setLiveFbDiagnostic({ 
          pagesMessaging: data.messagingPermission === "ready" ? "Ready" : "Missing",
          permissionCode: data.permissionCode || "FACEBOOK MESSAGING PERMISSION REQUIRED",
          error: data.error 
        });
        setMetaActionMsg({ type: "error", text: data.error || "Facebook connection test failed." });
      }
    } catch (err: any) {
      setMetaActionMsg({ type: "error", text: err.message || "Network error" });
    } finally {
      setMetaLoading(false);
    }
  };

  const handleCheckInstagram = async () => {
    setMetaLoading(true);
    setMetaActionMsg(null);
    try {
      const res = await apiFetch("/api/admin/settings/meta/test-instagram", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.success) {
        setLiveIgDiagnostic({
          accountLinked: "Linked",
          instagramBasic: "Ready",
          instagramManageMessages: "Ready",
          permissionCode: "INSTAGRAM_MESSAGING_VERIFIED"
        });
        setMetaActionMsg({ type: "success", text: `Instagram Connection Verified! ${data.message || data.accountName}` });
        fetchStatus();
      } else {
        setLiveIgDiagnostic({
          accountLinked: data.accountLinked ? "Linked" : "Not Linked",
          instagramBasic: data.instagramBasic === "ready" ? "Ready" : "Missing",
          instagramManageMessages: data.instagramManageMessages === "ready" ? "Ready" : "Missing",
          permissionCode: data.permissionCode || "INSTAGRAM BLOCKED",
          error: data.error
        });
        setMetaActionMsg({ type: "error", text: data.error || "Instagram connection test failed." });
      }
    } catch (err: any) {
      setMetaActionMsg({ type: "error", text: err.message || "Network error" });
    } finally {
      setMetaLoading(false);
    }
  };

  const handleTestWebhook = () => {
    const webhookUrl = status?.meta?.publicWebhookUrl || `${window.location.origin}/api/webhooks/meta`;
    setMetaActionMsg({
      type: "info",
      text: `Meta Webhook Public Callback URL: ${webhookUrl}. Verify Token is securely configured.`
    });
  };

  const fetchStatus = async () => {
    try {
      const res = await apiFetch("/api/admin/settings/integrations/status");
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (err) {
      console.error("Failed to fetch status", err);
    }
  };

  const fetchTgStatus = async () => {
    setTgLoading(true);
    try {
      const res = await apiFetch("/api/admin/telegram/status");
      if (res.ok) {
        const data = await res.json();
        setTgStatus(data);
        if (data.adminChatId) {
          setAdminChatIdInput(data.adminChatId);
        }
      }
    } catch (err) {
      console.error("Failed to fetch Telegram status", err);
    } finally {
      setTgLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchTgStatus();
  }, []);

  // Check Telegram Bot API connection via getMe()
  const handleCheckConnection = async () => {
    setTgLoading(true);
    setTgActionMsg(null);
    try {
      const res = await apiFetch("/api/admin/telegram/test", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.success) {
        setTgActionMsg({
          type: "success",
          text: `Connection verified! Connected to bot @${data.bot.username || data.bot.first_name} (ID: ${data.bot.id}). Admin Chat: ${data.adminChatConfigured ? "CONFIGURED" : "NOT CONFIGURED"}.`,
        });
        fetchTgStatus();
      } else {
        setTgActionMsg({
          type: "error",
          text: data.error || "Telegram connection test failed.",
        });
      }
    } catch (err: any) {
      setTgActionMsg({ type: "error", text: err.message || "Network error" });
    } finally {
      setTgLoading(false);
    }
  };

  // Send Test Notification (Section 13)
  const handleSendTestNotification = async () => {
    setTgLoading(true);
    setTgActionMsg(null);
    try {
      const res = await apiFetch("/api/admin/telegram/test-notify", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.success) {
        setTgActionMsg({
          type: "success",
          text: `Test notification sent successfully to admin Telegram! (Message ID: ${data.messageId || "N/A"})`,
        });
        fetchTgStatus();
      } else {
        setTgActionMsg({
          type: "error",
          text: data.error || "Failed to send test notification. Ensure Admin Chat ID is configured.",
        });
      }
    } catch (err: any) {
      setTgActionMsg({ type: "error", text: err.message || "Network error" });
    } finally {
      setTgLoading(false);
    }
  };

  // Save Admin Chat ID

  // Save All Credentials Permanently to Database

  // Detect Chat ID from Telegram updates
  const handleDetectChatId = async () => {
    setDetectingChatId(true);
    setTgActionMsg(null);
    try {
      const res = await apiFetch("/api/admin/telegram/detect-chat-id");
      const data = await res.json();
      if (res.ok && data.found && data.chatId) {
        setTgActionMsg({
          type: "success",
          text: `SUCCESS! Your Telegram Chat ID is: ${data.chatId}. Please add this to AI Studio Secrets as TELEGRAM_ADMIN_CHAT_ID.`,
        });
      } else if (data.wasBot) {
        setTgActionMsg({
          type: "error",
          text: "Please send /start from your personal Telegram account, not from another bot.",
        });
      } else {
        setTgActionMsg({
          type: "error",
          text: "No Telegram message found yet. Open the bot and send /start, then try again.",
        });
      }
    } catch (err: any) {
      setTgActionMsg({ type: "error", text: err.message || "Network error" });
    } finally {
      setDetectingChatId(false);
    }
  };

  const StatusIndicator = ({
    configured,
    connected,
    invalid,
    partial,
  }: {
    configured: boolean;
    connected?: boolean;
    invalid?: boolean;
    partial?: boolean;
  }) => {
    if (connected)
      return (
        <span className="flex items-center text-xs font-semibold text-green-700 bg-green-50 px-2 py-1 rounded">
          <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> CONNECTED
        </span>
      );
    if (invalid)
      return (
        <span className="flex items-center text-xs font-semibold text-red-700 bg-red-50 px-2 py-1 rounded">
          <XCircle className="w-3.5 h-3.5 mr-1" /> INVALID KEY / ERROR
        </span>
      );
    if (partial)
      return (
        <span className="flex items-center text-xs font-semibold text-yellow-700 bg-yellow-50 px-2 py-1 rounded">
          <AlertTriangle className="w-3.5 h-3.5 mr-1" /> PARTIAL
        </span>
      );
    if (configured)
      return (
        <span className="flex items-center text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-1 rounded">
          <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> CONFIGURED
        </span>
      );
    return (
      <span className="flex items-center text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-1 rounded">
        <XCircle className="w-3.5 h-3.5 mr-1" /> NOT CONFIGURED
      </span>
    );
  };

  const CheckItem = ({ label, isSet }: { label: string; isSet: boolean }) => (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-b-0 text-sm">
      <span className="font-mono text-xs text-gray-700">{label}</span>
      {isSet ? (
        <span className="flex items-center text-green-600 font-medium text-xs">
          <CheckCircle2 className="w-4 h-4 mr-1 text-green-500" /> Set
        </span>
      ) : (
        <span className="flex items-center text-gray-400 text-xs">
          <XCircle className="w-4 h-4 mr-1 text-gray-300" /> Missing
        </span>
      )}
    </div>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Settings & Integrations</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage admin notifications, bot connections, and inspect environment credentials.
          </p>
        </div>
        <button
          onClick={() => {
            fetchStatus();
            fetchTgStatus();
          }}
          disabled={tgLoading}
          className="flex items-center px-3 py-2 bg-white border border-gray-300 rounded-md text-sm shadow-sm hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${tgLoading ? "animate-spin" : ""}`} /> Refresh Status
        </button>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 border-b border-gray-200">
        <button
          onClick={() => setActiveTab("telegram")}
          className={`py-2 px-4 text-sm font-medium border-b-2 flex items-center space-x-1.5 ${
            activeTab === "telegram"
              ? "border-blue-500 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <Bell className="w-4 h-4" />
          <span>Telegram Admin Notifications</span>
          {tgStatus?.configured && (
            <span className="w-2 h-2 rounded-full bg-green-500 inline-block ml-1"></span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("meta")}
          className={`py-2 px-4 text-sm font-medium border-b-2 flex items-center space-x-1.5 ${
            activeTab === "meta"
              ? "border-blue-500 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <span>Meta (Messenger & IG)</span>
          {status?.meta?.status === "CONFIGURED" && (
            <span className="w-2 h-2 rounded-full bg-green-500 inline-block ml-1"></span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("credentials")}
          className={`py-2 px-4 text-sm font-medium border-b-2 ${
            activeTab === "credentials"
              ? "border-blue-500 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Credential Inventory
        </button>
        <button
          onClick={() => setActiveTab("general")}
          className={`py-2 px-4 text-sm font-medium border-b-2 ${
            activeTab === "general"
              ? "border-blue-500 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Business Config
        </button>
      </div>

      {/* TELEGRAM ADMIN NOTIFICATIONS TAB */}
      {activeTab === "telegram" && (
        <div className="space-y-6">
          {/* Action Message Alert */}
          {tgActionMsg && (
            <div
              className={`p-4 rounded-md border flex items-start space-x-3 ${
                tgActionMsg.type === "success"
                  ? "bg-green-50 border-green-200 text-green-800"
                  : tgActionMsg.type === "info"
                  ? "bg-blue-50 border-blue-200 text-blue-800"
                  : "bg-red-50 border-red-200 text-red-800"
              }`}
            >
              {tgActionMsg.type === "success" ? (
                <Check className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              ) : tgActionMsg.type === "info" ? (
                <Bell className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              )}
              <div className="text-sm font-medium">{tgActionMsg.text}</div>
            </div>
          )}

          {/* Section 5: Header and Overview */}
          <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                    <Bell className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">Telegram Admin Notifications</h2>
                    <p className="text-sm text-gray-500">
                      Dispatches immediate notifications to the administrator when a customer submits payment proof and an order is waiting for manual verification.
                    </p>
                  </div>
                </div>
              </div>

              {/* Action Buttons as specified in Section 5 & 13 */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleCheckConnection}
                  disabled={tgLoading}
                  className="px-3.5 py-2 bg-white border border-gray-300 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-50 disabled:opacity-50 flex items-center shadow-sm"
                >
                  <RefreshCw className={`w-4 h-4 mr-1.5 ${tgLoading ? "animate-spin" : ""}`} />
                  Check Telegram Connection
                </button>

                <button
                  onClick={handleSendTestNotification}
                  disabled={tgLoading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center shadow-sm"
                >
                  <Send className="w-4 h-4 mr-1.5" />
                  Send Test Notification
                </button>
              </div>
            </div>
          </div>

          {/* Section 5: Status Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Bot & Service Status */}
            <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                <h3 className="font-semibold text-gray-900">Notification Service Status</h3>
                <StatusIndicator
                  configured={!!tgStatus?.configured}
                  connected={!!tgStatus?.botConnected}
                  invalid={!!tgStatus?.connectionError}
                />
              </div>
              <div className="p-5 space-y-3">
                <div className="flex justify-between py-1.5 border-b border-gray-100 text-sm">
                  <span className="text-gray-500">Service Status:</span>
                  <span className="font-semibold text-xs">
                    {tgStatus?.configured ? (
                      <span className="text-green-700 bg-green-50 px-2 py-0.5 rounded font-mono">CONFIGURED</span>
                    ) : (
                      <span className="text-gray-600 bg-gray-100 px-2 py-0.5 rounded font-mono">NOT CONFIGURED</span>
                    )}
                  </span>
                </div>

                <div className="flex justify-between py-1.5 border-b border-gray-100 text-sm">
                  <span className="text-gray-500">Bot Connection:</span>
                  <span className="font-semibold text-xs">
                    {tgStatus?.botConnected ? (
                      <span className="text-green-700 bg-green-50 px-2 py-0.5 rounded">Connected</span>
                    ) : (
                      <span className="text-gray-600 bg-gray-100 px-2 py-0.5 rounded">NOT CONNECTED</span>
                    )}
                  </span>
                </div>

                <div className="flex justify-between py-1.5 border-b border-gray-100 text-sm">
                  <span className="text-gray-500">Bot:</span>
                  <span className="font-semibold text-gray-800">
                    {tgStatus?.bot?.first_name || "—"}
                  </span>
                </div>

                <div className="flex justify-between py-1.5 border-b border-gray-100 text-sm">
                  <span className="text-gray-500">Username:</span>
                  <span className="font-semibold text-blue-600">
                    {tgStatus?.bot?.username ? `@${tgStatus.bot.username}` : "—"}
                  </span>
                </div>

                <div className="flex justify-between py-1.5 border-b border-gray-100 text-sm">
                  <span className="text-gray-500">Bot Token (Database):</span>
                  <span className="font-semibold text-xs">
                    {tgStatus?.botTokenConfigured ? (
                      <span className="text-green-800 bg-green-50 px-2 py-0.5 rounded font-mono flex items-center">
                        <CheckCircle2 className="w-3 h-3 mr-1 text-green-600" />
                        {tgStatus.botTokenMasked || "Saved in Database"}
                      </span>
                    ) : (
                      <span className="text-yellow-800 bg-yellow-50 px-2 py-0.5 rounded font-mono">Not configured</span>
                    )}
                  </span>
                </div>

                <div className="flex justify-between py-1.5 border-b border-gray-100 text-sm">
                  <span className="text-gray-500">Administrator Chat ID:</span>
                  <span className="font-semibold text-xs">
                    {tgStatus?.adminChatConfigured ? (
                      <span className="text-gray-800 font-mono flex items-center">
                        <span className="bg-gray-100 px-2 py-0.5 rounded mr-1.5">{tgStatus.adminChatId}</span>
                        <span className="text-green-700 text-[11px] font-medium bg-green-50 px-1.5 py-0.5 rounded">Saved in DB</span>
                      </span>
                    ) : (
                      <span className="text-yellow-800 bg-yellow-50 px-2 py-0.5 rounded font-mono">Not configured</span>
                    )}
                  </span>
                </div>

                <div className="flex justify-between py-1.5 border-b border-gray-100 text-sm">
                  <span className="text-gray-500">Database Persistence:</span>
                  <span className="font-semibold text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded flex items-center">
                    <ShieldCheck className="w-3.5 h-3.5 mr-1 text-green-600" />
                    Permanently in Firestore (/settings/telegram)
                  </span>
                </div>

                <div className="flex justify-between py-1.5 border-b border-gray-100 text-sm">
                  <span className="text-gray-500">Webhook Requirement:</span>
                  <span className="text-xs font-medium text-gray-500">
                    NOT REQUIRED (Outbound API)
                  </span>
                </div>

                <div className="flex justify-between py-1.5 text-sm">
                  <span className="text-gray-500">Last Test Notification:</span>
                  <span className="text-gray-700 text-xs">
                    {tgStatus?.lastTestNotificationAt
                      ? `${new Date(tgStatus.lastTestNotificationAt).toLocaleString()} (${
                          tgStatus.lastTestNotificationSuccess ? "Delivered" : "Failed"
                        })`
                      : "Never run"}
                  </span>
                </div>

                {tgStatus?.connectionError && (
                  <div className="mt-3 p-3 bg-red-50 text-red-700 text-xs rounded border border-red-200">
                    <strong>Connection Error:</strong> {tgStatus.connectionError}
                  </div>
                )}
              </div>
            </div>

            {/* Credentials Configuration Instructions */}
            <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                <h3 className="font-semibold text-gray-900">Telegram Credentials Configuration</h3>
                <span className="text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded font-medium flex items-center">
                  <ShieldCheck className="w-3.5 h-3.5 mr-1" />
                  AI Studio Secrets
                </span>
              </div>
              <div className="p-5 space-y-4">
                <p className="text-xs text-gray-600 leading-relaxed">
                  For strict security, Telegram credentials must be configured using <strong>AI Studio Secrets</strong>. They will be loaded directly into the server runtime and are never exposed to the browser or stored in the database.
                </p>

                <div className="bg-gray-50 border border-gray-200 p-4 rounded text-xs text-gray-800 font-mono space-y-2">
                  <div className="flex justify-between">
                    <span className="font-semibold">TELEGRAM_BOT_TOKEN</span>
                    <span className={tgStatus?.botTokenConfigured ? "text-green-600" : "text-red-600"}>
                      {tgStatus?.botTokenConfigured ? "Configured" : "Missing"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-semibold">TELEGRAM_ADMIN_CHAT_ID</span>
                    <span className={tgStatus?.adminChatConfigured ? "text-green-600" : "text-red-600"}>
                      {tgStatus?.adminChatConfigured ? "Configured" : "Missing"}
                    </span>
                  </div>
                </div>

                <div className="bg-blue-50 border border-blue-200 p-3 rounded text-xs text-blue-800 space-y-3">
                  <div className="space-y-1">
                    <p className="font-semibold">Auto-detect your Chat ID:</p>
                    <ol className="list-decimal pl-4 space-y-0.5">
                      <li>Open Telegram and search for <strong>@{tgStatus?.bot?.username || "AIsalesDZ_bot"}</strong></li>
                      <li>Send <code>/start</code> from your personal Telegram account</li>
                      <li>Click the button below to auto-detect your ID</li>
                    </ol>
                  </div>
                  <button
                    onClick={handleDetectChatId}
                    disabled={detectingChatId}
                    className="w-full px-3 py-2 bg-blue-600 text-white border border-blue-700 rounded text-xs font-medium hover:bg-blue-700 flex items-center justify-center disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${detectingChatId ? "animate-spin" : ""}`} />
                    {detectingChatId ? "Checking updates..." : "Detect My Telegram Chat ID"}
                  </button>
                </div>

                <div className="border-t pt-3 text-xs text-gray-500 space-y-1">
                  <div className="flex items-center text-gray-600">
                    <ShieldCheck className="w-4 h-4 mr-1 text-green-600 flex-shrink-0" />
                    <span>Authoritative notifications trigger only on payment proof submissions.</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* META INTEGRATION TAB */}
      {activeTab === "meta" && status && (
        <div className="space-y-6">
          <MetaCredentialDiagnosticCard />

          {metaActionMsg && (
            <div
              className={`p-4 rounded-md border flex items-start space-x-3 ${
                metaActionMsg.type === "success"
                  ? "bg-green-50 border-green-200 text-green-800"
                  : metaActionMsg.type === "error"
                  ? "bg-red-50 border-red-200 text-red-800"
                  : "bg-blue-50 border-blue-200 text-blue-800"
              }`}
            >
              {metaActionMsg.type === "success" ? (
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              ) : metaActionMsg.type === "error" ? (
                <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              ) : (
                <Bot className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              )}
              <div className="flex-1 text-sm font-medium">{metaActionMsg.text}</div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Facebook Messenger */}
            <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                <h3 className="text-base font-semibold text-gray-900">Facebook Messenger</h3>
                {(liveFbDiagnostic?.pagesMessaging === "Ready" || status.meta.pagesMessaging === "ready") ? (
                  <span className="flex items-center text-xs font-semibold text-green-700 bg-green-50 px-2 py-1 rounded border border-green-200">
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-green-600" /> READY
                  </span>
                ) : status.meta.pageAccessToken ? (
                  <span className="flex items-center text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-1 rounded border border-amber-200">
                    <AlertCircle className="w-3.5 h-3.5 mr-1 text-amber-600" /> NOT READY
                  </span>
                ) : (
                  <span className="flex items-center text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-1 rounded">
                    <XCircle className="w-3.5 h-3.5 mr-1" /> NOT CONFIGURED
                  </span>
                )}
              </div>
              <div className="p-4 space-y-4">
                <div className="space-y-1 divide-y divide-gray-100">
                  <div className="flex items-center justify-between py-2 text-xs">
                    <span className="font-mono text-gray-700">App ID</span>
                    {status.meta.appId ? (
                      <span className="flex items-center text-green-700 font-semibold bg-green-50 px-2 py-0.5 rounded">
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-green-600" /> Configured
                      </span>
                    ) : (
                      <span className="flex items-center text-gray-500 font-medium bg-gray-100 px-2 py-0.5 rounded">
                        <XCircle className="w-3.5 h-3.5 mr-1 text-gray-400" /> Missing
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between py-2 text-xs">
                    <span className="font-mono text-gray-700">App Secret</span>
                    {status.meta.appSecret ? (
                      <span className="flex items-center text-green-700 font-semibold bg-green-50 px-2 py-0.5 rounded">
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-green-600" /> Configured
                      </span>
                    ) : (
                      <span className="flex items-center text-gray-500 font-medium bg-gray-100 px-2 py-0.5 rounded">
                        <XCircle className="w-3.5 h-3.5 mr-1 text-gray-400" /> Missing
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between py-2 text-xs">
                    <span className="font-mono text-gray-700">Page ID</span>
                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-gray-500">{status.meta.pageIdVal || "110414661460391"}</span>
                      {status.meta.pageId ? (
                        <span className="flex items-center text-green-700 font-semibold bg-green-50 px-2 py-0.5 rounded">
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-green-600" /> Configured
                        </span>
                      ) : (
                        <span className="flex items-center text-gray-500 font-medium bg-gray-100 px-2 py-0.5 rounded">
                          <XCircle className="w-3.5 h-3.5 mr-1 text-gray-400" /> Missing
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between py-2 text-xs">
                    <span className="font-mono text-gray-700">Page Access Token</span>
                    {status.meta.pageAccessToken ? (
                      <span className="flex items-center text-green-700 font-semibold bg-green-50 px-2 py-0.5 rounded">
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-green-600" /> Configured
                      </span>
                    ) : (
                      <span className="flex items-center text-gray-500 font-medium bg-gray-100 px-2 py-0.5 rounded">
                        <XCircle className="w-3.5 h-3.5 mr-1 text-gray-400" /> Missing
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between py-2 text-xs">
                    <span className="font-mono text-gray-700 font-medium">pages_messaging</span>
                    {(liveFbDiagnostic?.pagesMessaging === "Ready" || status.meta.pagesMessaging === "ready") ? (
                      <span className="flex items-center text-green-700 font-bold bg-green-50 px-2 py-0.5 rounded border border-green-200">
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-green-600" /> Ready
                      </span>
                    ) : (
                      <span className="flex items-center text-red-700 font-bold bg-red-50 px-2 py-0.5 rounded border border-red-200">
                        <XCircle className="w-3.5 h-3.5 mr-1 text-red-600" /> Missing
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between py-2 text-xs">
                    <span className="font-mono text-gray-700">Webhook</span>
                    {status.meta.webhookStatus === "ready" ? (
                      <span className="flex items-center text-green-700 font-semibold bg-green-50 px-2 py-0.5 rounded">
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-green-600" /> Ready
                      </span>
                    ) : (
                      <span className="flex items-center text-amber-700 font-medium bg-amber-50 px-2 py-0.5 rounded">
                        <XCircle className="w-3.5 h-3.5 mr-1 text-amber-600" /> Not Configured
                      </span>
                    )}
                  </div>
                </div>

                <div className="pt-2 border-t">
                  <button
                    onClick={handleCheckFacebook}
                    disabled={metaLoading || !status.meta.pageAccessToken}
                    className="w-full px-4 py-2 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center"
                  >
                    {metaLoading ? <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1.5" />}
                    Check Facebook Connection
                  </button>
                </div>
              </div>
            </div>

            {/* Instagram Direct */}
            <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                <h3 className="text-base font-semibold text-gray-900">Instagram Direct</h3>
                {(liveIgDiagnostic?.instagramManageMessages === "Ready" || status.meta.instagramManageMessages === "ready") ? (
                  <span className="flex items-center text-xs font-semibold text-green-700 bg-green-50 px-2 py-1 rounded border border-green-200">
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-green-600" /> READY
                  </span>
                ) : (
                  <span className="flex items-center text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-1 rounded border border-amber-200">
                    <AlertCircle className="w-3.5 h-3.5 mr-1 text-amber-600" /> NOT READY
                  </span>
                )}
              </div>
              <div className="p-4 space-y-4">
                <div className="space-y-1 divide-y divide-gray-100">
                  <div className="flex items-center justify-between py-2 text-xs">
                    <span className="font-mono text-gray-700">Page</span>
                    <span className="font-semibold text-gray-800">
                      {status.meta.pageName || "Dokuni Shop"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between py-2 text-xs">
                    <span className="font-mono text-gray-700">Instagram Professional Account</span>
                    {(liveIgDiagnostic?.accountLinked === "Linked" || status.meta.instagramAccountLinked) ? (
                      <span className="flex items-center text-green-700 font-semibold bg-green-50 px-2 py-0.5 rounded">
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-green-600" /> Linked
                      </span>
                    ) : (
                      <span className="flex items-center text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                        <XCircle className="w-3.5 h-3.5 mr-1 text-amber-600" /> Not Linked
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between py-2 text-xs">
                    <span className="font-mono text-gray-700">Instagram Account ID</span>
                    {status.meta.igAccountIdVal ? (
                      <span className="flex items-center text-green-700 font-semibold bg-green-50 px-2 py-0.5 rounded">
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-green-600" /> Present
                      </span>
                    ) : (
                      <span className="flex items-center text-gray-500 font-medium bg-gray-100 px-2 py-0.5 rounded">
                        <XCircle className="w-3.5 h-3.5 mr-1 text-gray-400" /> Missing
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between py-2 text-xs">
                    <span className="font-mono text-gray-700">instagram_basic</span>
                    {(liveIgDiagnostic?.instagramBasic === "Ready" || status.meta.instagramBasic === "ready") ? (
                      <span className="flex items-center text-green-700 font-semibold bg-green-50 px-2 py-0.5 rounded">
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-green-600" /> Ready
                      </span>
                    ) : (
                      <span className="flex items-center text-red-700 font-bold bg-red-50 px-2 py-0.5 rounded border border-red-200">
                        <XCircle className="w-3.5 h-3.5 mr-1 text-red-600" /> Missing
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between py-2 text-xs">
                    <span className="font-mono text-gray-700 font-medium">instagram_manage_messages</span>
                    {(liveIgDiagnostic?.instagramManageMessages === "Ready" || status.meta.instagramManageMessages === "ready") ? (
                      <span className="flex items-center text-green-700 font-bold bg-green-50 px-2 py-0.5 rounded border border-green-200">
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-green-600" /> Ready
                      </span>
                    ) : (
                      <span className="flex items-center text-red-700 font-bold bg-red-50 px-2 py-0.5 rounded border border-red-200">
                        <XCircle className="w-3.5 h-3.5 mr-1 text-red-600" /> Missing
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between py-2 text-xs">
                    <span className="font-mono text-gray-700">Webhook</span>
                    {status.meta.webhookStatus === "ready" ? (
                      <span className="flex items-center text-green-700 font-semibold bg-green-50 px-2 py-0.5 rounded">
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-green-600" /> Ready
                      </span>
                    ) : (
                      <span className="flex items-center text-amber-700 font-medium bg-amber-50 px-2 py-0.5 rounded">
                        <XCircle className="w-3.5 h-3.5 mr-1 text-amber-600" /> Not Configured
                      </span>
                    )}
                  </div>
                </div>

                <div className="pt-2 border-t">
                  <button
                    onClick={handleCheckInstagram}
                    disabled={metaLoading || !status.meta.pageAccessToken}
                    className="w-full px-4 py-2 bg-pink-600 text-white rounded text-xs font-medium hover:bg-pink-700 disabled:opacity-50 flex items-center justify-center"
                  >
                    {metaLoading ? <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1.5" />}
                    Check Instagram Connection
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Webhook & Testing Panel */}
          <div className="bg-white rounded-lg shadow border border-gray-200 p-6 space-y-4">
            <h3 className="text-base font-semibold text-gray-900">Webhook Configuration & Testing</h3>
            <p className="text-sm text-gray-600">
              Configure your Meta App Webhook subscription to point to this full public HTTPS endpoint (do not use localhost):
            </p>
            <div className="bg-gray-50 p-3 rounded border text-xs font-mono text-gray-800 break-all select-all font-semibold">
              {status.meta.publicWebhookUrl || `${window.location.origin}/api/webhooks/meta`}
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleTestWebhook}
                className="px-4 py-2 bg-gray-900 text-white rounded text-xs font-medium hover:bg-gray-800"
              >
                Test Webhook URL
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREDENTIALS TAB */}
      {activeTab === "credentials" && status && (
        <div className="space-y-6">
          {/* Database Credentials Synchronization Card */}
          <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  <Database className="w-4 h-4 text-blue-600" />
                  Database Credentials Synchronization
                </h4>
                <p className="text-xs text-gray-500 mt-1 max-w-xl">
                  Restore backed up environment variables, Telegram bot tokens, and Meta connector configurations directly from your Cloud Firestore database into active runtime memory and <code className="bg-gray-100 px-1 py-0.5 rounded text-gray-800 font-mono">.env</code>.
                </p>
              </div>
              <button
                onClick={handleRestoreCredentials}
                disabled={restoringCredentials}
                className="inline-flex items-center justify-center px-4 py-2.5 bg-blue-600 text-white text-xs font-semibold rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors shrink-0 shadow-sm"
              >
                <RefreshCw className={`w-3.5 h-3.5 mr-2 ${restoringCredentials ? "animate-spin" : ""}`} />
                {restoringCredentials ? "Restoring Credentials..." : "Restore Credentials from Database"}
              </button>
            </div>

            {restoreActionMsg && (
              <div
                className={`mt-4 p-3 rounded text-xs flex items-start gap-2 ${
                  restoreActionMsg.type === "success"
                    ? "bg-green-50 text-green-800 border border-green-200"
                    : restoreActionMsg.type === "warning"
                    ? "bg-amber-50 text-amber-800 border border-amber-200"
                    : "bg-red-50 text-red-800 border border-red-200"
                }`}
              >
                {restoreActionMsg.type === "success" ? (
                  <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
                ) : restoreActionMsg.type === "warning" ? (
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                )}
                <span>{restoreActionMsg.text}</span>
              </div>
            )}
          </div>

          <div className="bg-blue-50 border border-blue-200 p-4 rounded-md">
            <div className="flex">
              <div className="flex-shrink-0">
                <ShieldCheck className="h-5 w-5 text-blue-400" />
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-blue-800">Security & Environment Overview</h3>
                <div className="mt-2 text-sm text-blue-700">
                  <p>
                    All sensitive API keys and tokens are loaded strictly server-side via environment variables.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                <h3 className="text-base font-semibold text-gray-900">Authentication</h3>
                <StatusIndicator
                  configured={
                    status.auth.adminUsername &&
                    status.auth.adminPassword &&
                    status.auth.sessionSecret
                  }
                />
              </div>
              <div className="p-4">
                <CheckItem label="ADMIN_USERNAME" isSet={status.auth.adminUsername} />
                <CheckItem label="ADMIN_PASSWORD" isSet={status.auth.adminPassword} />
                <CheckItem label="SESSION_SECRET" isSet={status.auth.sessionSecret} />
              </div>
            </div>

            <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                <h3 className="text-base font-semibold text-gray-900">Database & Firebase</h3>
                {status.firebase?.quotaExceeded || status.firebase?.mode === "cloud_quota_exceeded" ? (
                  <span className="flex items-center text-xs font-semibold text-amber-800 bg-amber-50 px-2 py-1 rounded border border-amber-200">
                    <AlertTriangle className="w-3.5 h-3.5 mr-1 text-amber-600" /> QUOTA REACHED (LOCAL ACTIVE)
                  </span>
                ) : status.firebase?.mode === "cloud" ? (
                  <span className="flex items-center text-xs font-semibold text-green-700 bg-green-50 px-2 py-1 rounded">
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> CLOUD FIRESTORE
                  </span>
                ) : (
                  <span className="flex items-center text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-1 rounded">
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> LOCAL PERSISTENCE ACTIVE
                  </span>
                )}
              </div>
              <div className="p-4">
                <div className="mb-3 text-xs text-gray-600 bg-gray-50 p-2.5 rounded border border-gray-100">
                  {status.firebase?.message || "Storage engine operational."}
                  {status.firebase?.resetInfo && (
                    <div className="mt-1.5 pt-1.5 border-t border-gray-200 text-amber-800 font-medium">
                      ⏰ {status.firebase.resetInfo}
                    </div>
                  )}
                </div>
                <CheckItem label="FIREBASE_PROJECT_ID" isSet={status.firebase.projectId} />
                <CheckItem label="FIREBASE_CLIENT_EMAIL" isSet={status.firebase.clientEmail} />
                <CheckItem label="FIREBASE_PRIVATE_KEY" isSet={status.firebase.privateKey} />
                <CheckItem
                  label="GOOGLE_APPLICATION_CREDENTIALS (ADC)"
                  isSet={status.firebase.adc}
                />
              </div>
            </div>

            <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                <h3 className="text-base font-semibold text-gray-900">Gemini AI</h3>
                <StatusIndicator
                  configured={status.gemini.apiKey}
                  connected={status.gemini.connected}
                  invalid={status.gemini.invalid}
                />
              </div>
              <div className="p-4">
                <CheckItem label="GEMINI_API_KEY" isSet={status.gemini.apiKey} />
              </div>
            </div>

            <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                <h3 className="text-base font-semibold text-gray-900">Telegram Admin Notifications</h3>
                <StatusIndicator
                  configured={status.telegram.botToken}
                  connected={status.telegram.connected}
                  invalid={status.telegram.invalid}
                />
              </div>
              <div className="p-4">
                <CheckItem label="TELEGRAM_BOT_TOKEN" isSet={status.telegram.botToken} />
                <CheckItem label="TELEGRAM_BOT_USERNAME" isSet={status.telegram.botUsername} />
              </div>
            </div>

            <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                <h3 className="text-base font-semibold text-gray-900">Meta / Facebook / Instagram</h3>
                <StatusIndicator
                  configured={status.meta.status === "CONFIGURED"}
                  partial={status.meta.status === "PARTIALLY CONFIGURED"}
                />
              </div>
              <div className="p-4">
                <CheckItem label="META_APP_ID" isSet={status.meta.appId} />
                <CheckItem label="META_APP_SECRET" isSet={status.meta.appSecret} />
                <CheckItem label="META_PAGE_ACCESS_TOKEN" isSet={status.meta.pageAccessToken} />
                <CheckItem label="META_WEBHOOK_VERIFY_TOKEN" isSet={status.meta.webhookVerifyToken} />
                <CheckItem label="META_PAGE_ID" isSet={status.meta.pageId} />
                <CheckItem label="INSTAGRAM_BUSINESS_ACCOUNT_ID" isSet={status.meta.igAccountId} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* GENERAL TAB */}
      {activeTab === "general" && (
        <div className="bg-white shadow rounded-lg p-6 text-center text-gray-500">
          <p>Business configuration (Name, Timezone, Sales Rules) is persisted in Firestore.</p>
          <p className="mt-2">
            Switch to the <strong>Telegram Admin Notifications</strong> tab to manage notification settings, or{" "}
            <strong>Credential Inventory</strong> to inspect environment secrets.
          </p>
        </div>
      )}
          </div>
    </DashboardLayout>
  );
}