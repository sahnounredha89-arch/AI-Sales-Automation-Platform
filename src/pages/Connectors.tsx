import DashboardLayout from "../components/DashboardLayout";
import React, { useState, useEffect } from "react";
import { 
  MessageCircle, 
  Camera as Instagram, 
  Send, 
  Bot, 
  RefreshCw, 
  XCircle, 
  CheckCircle2, 
  AlertCircle, 
  Copy, 
  ExternalLink, 
  ShieldCheck, 
  Key, 
  Settings2, 
  Loader2,
  Check
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import MetaCredentialDiagnosticCard from "../components/MetaCredentialDiagnosticCard";
import LastMetaMessageDiagnostic from "../components/LastMetaMessageDiagnostic";

interface Connector {
  id: string;
  type: string;
  platform: string;
  name: string;
  pageId?: string;
  pageName?: string;
  igAccountId?: string;
  igUsername?: string;
  status: string;
  connectedAt?: string;
  tokenMasked?: string | null;
}

export default function Connectors() {
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Direct connection modal state
  const [activeModal, setActiveModal] = useState<"messenger" | "instagram" | null>(null);
  const [modalTab, setModalTab] = useState<"direct" | "oauth">("direct");
  const [accessTokenInput, setAccessTokenInput] = useState("");
  const [pageIdInput, setPageIdInput] = useState("");
  const [igAccountIdInput, setIgAccountIdInput] = useState("");
  const [appIdInput, setAppIdInput] = useState("");
  
  const [connecting, setConnecting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Testing status & granular diagnostics
  const [testingType, setTestingType] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    [key: string]: {
      success: boolean;
      msg: string;
      authStatus?: "connected" | "failed";
      pageName?: string;
      pageId?: string;
      messagingPermission?: "ready" | "missing" | "not_verified";
      messagingStatus?: "ready" | "not_ready";
      accountLinked?: boolean;
      accountName?: string;
      permissionCode?: string;
    };
  }>({});

  // Webhook info
  const [verifyToken, setVerifyToken] = useState("ai_sales_meta_verify_token");
  const [publicWebhookUrl, setPublicWebhookUrl] = useState<string>("");
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);

  // Meta Pages for OAuth selection
  const [metaPages, setMetaPages] = useState<any[]>([]);
  const [showPageSelector, setShowPageSelector] = useState(false);

  const location = useLocation();
  const navigate = useNavigate();

  const webhookUrl = publicWebhookUrl || (typeof window !== "undefined" 
    ? `${window.location.origin}/api/webhooks/meta`
    : "/api/webhooks/meta");

  const fetchConnectors = async () => {
    try {
      const res = await apiFetch("/api/admin/connectors");
      if (res.ok) {
        const data = await res.json();
        setConnectors(Array.isArray(data) ? data : []);
      } else {
        const errData = await res.json().catch(() => ({}));
        setError(errData.error || "Failed to load connectors.");
      }
    } catch (err: any) {
      setError(err.message || "Failed to connect to server.");
    } finally {
      setLoading(false);
    }
  };

  const fetchMetaConfig = async () => {
    try {
      const res = await apiFetch("/api/admin/connectors/meta/config");
      if (res.ok) {
        const data = await res.json();
        if (data.verifyToken) setVerifyToken(data.verifyToken);
        if (data.appId) setAppIdInput(data.appId);
        if (data.webhookUrl) setPublicWebhookUrl(data.webhookUrl);
      }
    } catch (e) {}
  };

  useEffect(() => {
    fetchConnectors();
    fetchMetaConfig();

    const params = new URLSearchParams(location.search);
    if (params.get("meta_auth") === "success") {
      setSuccessMsg("Meta OAuth authorization was successful! Choose a Page to finish setup.");
      fetchMetaPages();
      navigate("/connectors", { replace: true });
    } else if (params.get("meta_auth") === "error") {
      setError("Meta OAuth authorization failed or was canceled.");
      navigate("/connectors", { replace: true });
    } else if (params.get("meta_auth") === "state_mismatch") {
      setError("OAuth state security mismatch. Please try connecting again.");
      navigate("/connectors", { replace: true });
    }
  }, [location, navigate]);

  const fetchMetaPages = async () => {
    try {
      const res = await apiFetch("/api/admin/connectors/meta/pages");
      const data = await res.json();
      if (res.ok && Array.isArray(data)) {
        setMetaPages(data);
        setShowPageSelector(true);
      } else {
        setError(data.error || "Failed to fetch Meta pages from account.");
      }
    } catch (err) {
      setError("Failed to fetch Meta pages.");
    }
  };

  const openConnectModal = (type: "messenger" | "instagram") => {
    setActiveModal(type);
    setModalTab("direct");
    setAccessTokenInput("");
    setPageIdInput("");
    setIgAccountIdInput("");
    setModalError(null);
  };

  const handleDirectConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessTokenInput.trim()) {
      setModalError("Please enter your Meta Page Access Token.");
      return;
    }

    setConnecting(true);
    setModalError(null);

    try {
      const res = await apiFetch("/api/admin/connectors/meta/direct-connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: activeModal,
          accessToken: accessTokenInput.trim(),
          pageId: pageIdInput.trim() || undefined,
          igAccountId: igAccountIdInput.trim() || undefined,
        }),
      });

      let data;
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        data = await res.json();
      } else {
        const text = await res.text();
        throw new Error(`Server returned non-JSON response (HTTP ${res.status}): ${text.substring(0, 100)}...`);
      }

      if (res.ok && data.success) {
        setSuccessMsg(data.message || `Connected ${activeModal === "instagram" ? "Instagram Direct" : "Facebook Page"} successfully!`);
        setActiveModal(null);
        fetchConnectors();
      } else {
        setModalError(data.error || "Failed to verify and connect token.");
      }
    } catch (err: any) {
      setModalError(err.message || "Network error while connecting.");
    } finally {
      setConnecting(false);
    }
  };

  const handleStartOAuth = async () => {
    setConnecting(true);
    setModalError(null);
    try {
      // If user provided App ID / Secret in the form, save them first
      if (appIdInput.trim()) {
        await apiFetch("/api/admin/connectors/meta/config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            appId: appIdInput.trim(),
            
          }),
        });
      }

      const res = await apiFetch("/api/admin/connectors/meta/oauth/start", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
      } else {
        setModalError(data.error || "Failed to start Meta OAuth flow.");
      }
    } catch (err: any) {
      setModalError(err.message || "Error starting Meta OAuth.");
    } finally {
      setConnecting(false);
    }
  };

  const handleSelectPage = async (page: any, type: "messenger" | "instagram") => {
    try {
      const res = await apiFetch("/api/admin/connectors/meta/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          name: type === "messenger" ? page.name : (page.instagram_business_account?.username || page.name),
          pageId: page.id,
          pageName: page.name,
          igAccountId: page.instagram_business_account?.id,
          igUsername: page.instagram_business_account?.username,
          accessToken: page.access_token,
        }),
      });
      if (res.ok) {
        setShowPageSelector(false);
        setSuccessMsg(`Successfully linked ${type === "instagram" ? "Instagram account" : "Facebook page"}!`);
        fetchConnectors();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to connect page.");
      }
    } catch (err) {
      setError("Error connecting page.");
    }
  };

  const handleDisconnect = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to disconnect ${name}? Incoming messages will no longer be received.`)) return;
    try {
      const res = await apiFetch("/api/admin/connectors/meta/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        setSuccessMsg(`Disconnected ${name}.`);
        fetchConnectors();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to disconnect.");
      }
    } catch (err: any) {
      setError(err.message || "Error disconnecting.");
    }
  };

  const handleTestConnection = async (type: "messenger" | "instagram") => {
    setTestingType(type);
    try {
      const res = await apiFetch(`/api/admin/connectors/meta/test/${type}`, { method: "POST" });
      const data = await res.json();
      setTestResult(prev => ({
        ...prev,
        [type]: { 
          success: !!data.success, 
          msg: data.message || data.error || (data.success ? "Verified successfully." : "Connection test failed."),
          authStatus: data.authStatus || (data.success ? "connected" : "failed"),
          pageName: data.pageName,
          pageId: data.pageId,
          messagingPermission: data.messagingPermission || (data.success ? "ready" : "missing"),
          messagingStatus: data.messagingStatus || (data.success ? "ready" : "not_ready"),
          accountLinked: data.accountLinked,
          accountName: data.accountName,
          permissionCode: data.permissionCode
        }
      }));
    } catch (err: any) {
      setTestResult(prev => ({
        ...prev,
        [type]: { 
          success: false, 
          msg: err.message || "Test failed.",
          messagingStatus: "not_ready"
        }
      }));
    } finally {
      setTestingType(null);
    }
  };

  const copyToClipboard = (text: string, type: "webhook" | "token") => {
    navigator.clipboard.writeText(text);
    if (type === "webhook") {
      setCopiedWebhook(true);
      setTimeout(() => setCopiedWebhook(false), 2000);
    } else {
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    }
  };

  const messengerConn = connectors.find(c => c.type === "messenger");
  const instagramConn = connectors.find(c => c.type === "instagram");

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Platform Connectors</h1>
          <p className="text-sm text-gray-500 mt-1">
            Connect Facebook Messenger, Instagram Direct, and Telegram for automated AI sales operations.
          </p>
        </div>
        <button 
          onClick={() => { setError(null); setSuccessMsg(null); fetchConnectors(); }} 
          className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 self-start"
        >
          <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Alerts */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-start justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-500" />
            <span className="text-sm">{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
            <XCircle className="w-5 h-5" />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-green-50 border border-green-200 text-green-700 rounded-lg flex items-start justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-green-500" />
            <span className="text-sm">{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-green-400 hover:text-green-600">
            <XCircle className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Authoritative Meta Credential Diagnostics & Hardened Persistence */}
      <LastMetaMessageDiagnostic />
      <MetaCredentialDiagnosticCard onTokenReplaced={fetchConnectors} />

      {/* Meta Webhook Details Card */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-5 h-5 text-blue-600" />
            <h2 className="text-base font-semibold text-gray-900">Meta Webhook Configuration</h2>
          </div>
          <span className="text-xs bg-blue-100 text-blue-800 font-medium px-2.5 py-0.5 rounded-full">
            Required for Messenger & Instagram
          </span>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-600">
            In your <strong>Meta App Dashboard</strong> under <strong>Webhooks</strong> &rarr; <strong>Messenger / Instagram</strong>, configure this Callback URL and Verify Token:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Callback URL
              </label>
              <div className="flex items-center bg-gray-50 border border-gray-300 rounded-md p-2 text-xs font-mono text-gray-800">
                <span className="truncate flex-1 select-all">{webhookUrl}</span>
                <button
                  onClick={() => copyToClipboard(webhookUrl, "webhook")}
                  className="ml-2 text-gray-500 hover:text-blue-600 flex items-center text-xs font-sans"
                  title="Copy URL"
                >
                  {copiedWebhook ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Verify Token
              </label>
              <div className="flex items-center bg-gray-50 border border-gray-300 rounded-md p-2 text-xs font-mono text-gray-800">
                <span className="truncate flex-1 select-all">{verifyToken}</span>
                <button
                  onClick={() => copyToClipboard(verifyToken, "token")}
                  className="ml-2 text-gray-500 hover:text-blue-600 flex items-center text-xs font-sans"
                  title="Copy Token"
                >
                  {copiedToken ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded p-3 text-xs text-blue-800 space-y-1">
            <p className="font-semibold">Webhook Subscription Fields required on Meta:</p>
            <p>Subscribe to: <code className="bg-blue-100 px-1 py-0.5 rounded">messages</code>, <code className="bg-blue-100 px-1 py-0.5 rounded">messaging_postbacks</code>, <code className="bg-blue-100 px-1 py-0.5 rounded">message_deliveries</code>, <code className="bg-blue-100 px-1 py-0.5 rounded">message_reads</code>.</p>
          </div>
        </div>
      </div>

      {/* Main Connectors Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Facebook Messenger Card */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col justify-between overflow-hidden">
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-blue-100 text-blue-600 rounded-lg">
                  <MessageCircle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Facebook Messenger</h3>
                  <p className="text-xs text-gray-500">Facebook Business Page</p>
                </div>
              </div>
              {messengerConn ? (
                (testResult.messenger?.messagingStatus || messengerConn.messagingStatus) === "ready" ? (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800 border border-green-200">
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-green-600" />
                    Messaging Ready
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                    <AlertCircle className="w-3.5 h-3.5 mr-1 text-amber-600" />
                    Credential Connected (Messaging Not Ready)
                  </span>
                )
              ) : (
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                  Not Connected
                </span>
              )}
            </div>

            <p className="text-sm text-gray-600 mb-4">
              Automates responses to customer inquiries on your Facebook Business Page with product info, payment guides, and proof collection.
            </p>

            {messengerConn ? (
              <div className="space-y-3">
                <div className="bg-gray-50 rounded-lg p-3.5 border border-gray-200 text-xs space-y-2">
                  <div className="flex justify-between items-center py-0.5">
                    
                    <span className="text-gray-500">Meta Authentication:</span>
                    {testResult.messenger?.authStatus === "failed" || messengerConn.status === "failed" ? (
                      <span className="inline-flex items-center font-semibold text-red-700 bg-red-50 px-2 py-0.5 rounded border border-red-100">
                        <XCircle className="w-3.5 h-3.5 mr-1 text-red-600" /> Token Expired
                      </span>
                    ) : (
                      <span className="inline-flex items-center font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded border border-green-100">
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-green-600" /> Connected
                      </span>
                    )}
                  </div>
                  <div className="flex justify-between items-center py-0.5">
                    <span className="text-gray-500">Page:</span>
                    <span className="font-semibold text-gray-800">{messengerConn.pageName || messengerConn.name || "Dokuni Shop"}</span>
                  </div>
                  {messengerConn.pageId && (
                    <div className="flex justify-between items-center py-0.5">
                      <span className="text-gray-500">Page ID:</span>
                      <span className="font-mono text-gray-700">{messengerConn.pageId}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center py-0.5">
                    <span className="text-gray-500">Messaging Permission:</span>
                    {(testResult.messenger?.messagingPermission || messengerConn.messagingPermission) === "ready" ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-800 border border-green-200">
                        <CheckCircle2 className="w-3 h-3 mr-1 text-green-600" /> Ready (pages_messaging)
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-800 border border-red-200">
                        <XCircle className="w-3 h-3 mr-1 text-red-600" /> Missing (pages_messaging)
                      </span>
                    )}
                  </div>
                  <div className="flex justify-between items-center py-0.5 border-t border-gray-200 pt-1.5">
                    <span className="text-gray-600 font-medium">Messaging Status:</span>
                    {(testResult.messenger?.messagingStatus || messengerConn.messagingStatus) === "ready" ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-green-100 text-green-800 border border-green-200">
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-green-600" /> Ready
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                        <AlertCircle className="w-3.5 h-3.5 mr-1 text-amber-600" /> Not Ready
                      </span>
                    )}
                  </div>
                </div>

                {/* Diagnostic Feedback */}
                {testResult.messenger && (
                  <div className={`p-3 rounded-lg text-xs border ${
                    testResult.messenger.success
                      ? "bg-green-50 text-green-800 border-green-200"
                      : "bg-amber-50 text-amber-900 border-amber-200"
                  }`}>
                    <div className="font-semibold flex items-center mb-1">
                      {testResult.messenger.success ? (
                        <CheckCircle2 className="w-4 h-4 mr-1 text-green-600 flex-shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 mr-1 text-amber-600 flex-shrink-0" />
                      )}
                      {testResult.messenger.permissionCode || (testResult.messenger.success ? "Ready" : "Meta Permission Required")}
                    </div>
                    <div className="text-gray-700 leading-relaxed break-words">
                      {testResult.messenger.msg}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-800">
                Click <strong>Connect Facebook Page</strong> below to connect instantly with your Page Access Token or via Facebook Login.
              </div>
            )}
          </div>

          <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex flex-wrap gap-2 justify-end shrink-0">
            {messengerConn ? (
              <>
                <button
                  onClick={() => handleTestConnection("messenger")}
                  disabled={testingType === "messenger"}
                  className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 rounded text-xs font-medium hover:bg-gray-50 disabled:opacity-50 flex items-center"
                >
                  <RefreshCw className={`w-3.5 h-3.5 mr-1 ${testingType === "messenger" ? "animate-spin" : ""}`} />
                  Test Live
                </button>
                <button
                  onClick={() => openConnectModal("messenger")}
                  className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded text-xs font-medium hover:bg-gray-200"
                >
                  Update Token
                </button>
                <button
                  onClick={() => handleDisconnect("messenger", "Facebook Messenger")}
                  className="px-3 py-1.5 bg-red-50 text-red-600 rounded text-xs font-medium hover:bg-red-100"
                >
                  Disconnect
                </button>
              </>
            ) : (
              <button
                onClick={() => openConnectModal("messenger")}
                className="w-full sm:w-auto px-4 py-2 bg-blue-600 text-white rounded text-xs font-semibold hover:bg-blue-700 shadow-sm flex items-center justify-center"
              >
                <MessageCircle className="w-4 h-4 mr-1.5" />
                Connect Facebook Page
              </button>
            )}
          </div>
        </div>

        {/* Instagram Direct Card */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col justify-between overflow-hidden">
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-pink-100 text-pink-600 rounded-lg">
                  <Instagram className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Instagram Direct</h3>
                  <p className="text-xs text-gray-500">Instagram Professional Account</p>
                </div>
              </div>
              {instagramConn ? (
                ((testResult.instagram?.messagingStatus || instagramConn.messagingStatus) === "ready" && (testResult.instagram?.accountLinked || instagramConn.accountLinked || instagramConn.igAccountId)) ? (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800 border border-green-200">
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-green-600" />
                    Instagram Messaging Ready
                  </span>
                ) : testResult.instagram?.accountLinked ? (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                    <AlertCircle className="w-3.5 h-3.5 mr-1 text-amber-600" />
                    Instagram Account Linked (Messaging Not Ready)
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                    <AlertCircle className="w-3.5 h-3.5 mr-1 text-amber-600" />
                    Credential Connected (Account Not Linked)
                  </span>
                )
              ) : (
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                  Not Connected
                </span>
              )}
            </div>

            <p className="text-sm text-gray-600 mb-4">
              Answers Direct Messages on your Instagram Professional account linked to your Facebook Business Page.
            </p>

            {instagramConn ? (
              <div className="space-y-3">
                <div className="bg-gray-50 rounded-lg p-3.5 border border-gray-200 text-xs space-y-2">
                  <div className="flex justify-between items-center py-0.5">
                    
                    <span className="text-gray-500">Meta Authentication:</span>
                    {testResult.instagram?.authStatus === "failed" || instagramConn.status === "failed" ? (
                      <span className="inline-flex items-center font-semibold text-red-700 bg-red-50 px-2 py-0.5 rounded border border-red-100">
                        <XCircle className="w-3.5 h-3.5 mr-1 text-red-600" /> Token Expired
                      </span>
                    ) : (
                      <span className="inline-flex items-center font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded border border-green-100">
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-green-600" /> Connected
                      </span>
                    )}
                  </div>
                  <div className="flex justify-between items-center py-0.5">
                    <span className="text-gray-500">Page:</span>
                    <span className="font-semibold text-gray-800">{instagramConn.pageName || "Dokuni Shop"}</span>
                  </div>
                  <div className="flex justify-between items-center py-0.5">
                    <span className="text-gray-500">Instagram Account:</span>
                    {testResult.instagram?.accountLinked || instagramConn.accountLinked || instagramConn.igAccountId ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-800 border border-green-200">
                        <CheckCircle2 className="w-3 h-3 mr-1 text-green-600" /> Linked
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                        <XCircle className="w-3 h-3 mr-1 text-amber-600" /> Not Linked
                      </span>
                    )}
                  </div>
                  <div className="flex justify-between items-center py-0.5">
                    <span className="text-gray-500">Messaging Permission:</span>
                    {(testResult.instagram?.messagingPermission || instagramConn.messagingPermission) === "ready" ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-800 border border-green-200">
                        <CheckCircle2 className="w-3 h-3 mr-1 text-green-600" /> Ready
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-gray-200 text-gray-700">
                        Not Verified
                      </span>
                    )}
                  </div>
                  <div className="flex justify-between items-center py-0.5 border-t border-gray-200 pt-1.5">
                    <span className="text-gray-600 font-medium">Messaging Status:</span>
                    {((testResult.instagram?.messagingStatus || instagramConn.messagingStatus) === "ready" && (testResult.instagram?.accountLinked || instagramConn.accountLinked || instagramConn.igAccountId)) ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-green-100 text-green-800 border border-green-200">
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-green-600" /> Ready
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                        <AlertCircle className="w-3.5 h-3.5 mr-1 text-amber-600" /> Not Ready
                      </span>
                    )}
                  </div>
                </div>

                {/* Diagnostic Feedback */}
                {testResult.instagram && (
                  <div className={`p-3 rounded-lg text-xs border ${
                    testResult.instagram.success
                      ? "bg-green-50 text-green-800 border-green-200"
                      : "bg-amber-50 text-amber-900 border-amber-200"
                  }`}>
                    <div className="font-semibold flex items-center mb-1">
                      {testResult.instagram.success ? (
                        <CheckCircle2 className="w-4 h-4 mr-1 text-green-600 flex-shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 mr-1 text-amber-600 flex-shrink-0" />
                      )}
                      {testResult.instagram.permissionCode || (testResult.instagram.success ? "Ready" : "Instagram Blocker")}
                    </div>
                    <div className="text-gray-700 leading-relaxed break-words">
                      {testResult.instagram.msg}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-pink-50 border border-pink-100 rounded-lg p-3 text-xs text-pink-800">
                Click <strong>Connect Instagram</strong> below to link your Instagram Professional account with its Page Access Token.
              </div>
            )}
          </div>

          <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex flex-wrap gap-2 justify-end shrink-0">
            {instagramConn ? (
              <>
                <button
                  onClick={() => handleTestConnection("instagram")}
                  disabled={testingType === "instagram"}
                  className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 rounded text-xs font-medium hover:bg-gray-50 disabled:opacity-50 flex items-center"
                >
                  <RefreshCw className={`w-3.5 h-3.5 mr-1 ${testingType === "instagram" ? "animate-spin" : ""}`} />
                  Test Live
                </button>
                <button
                  onClick={() => openConnectModal("instagram")}
                  className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded text-xs font-medium hover:bg-gray-200"
                >
                  Update Token
                </button>
                <button
                  onClick={() => handleDisconnect("instagram", "Instagram Direct")}
                  className="px-3 py-1.5 bg-red-50 text-red-600 rounded text-xs font-medium hover:bg-red-100"
                >
                  Disconnect
                </button>
              </>
            ) : (
              <button
                onClick={() => openConnectModal("instagram")}
                className="w-full sm:w-auto px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded text-xs font-semibold hover:opacity-90 shadow-sm flex items-center justify-center"
              >
                <Instagram className="w-4 h-4 mr-1.5" />
                Connect Instagram Direct
              </button>
            )}
          </div>
        </div>

        {/* Telegram Card */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col justify-between overflow-hidden">
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-blue-100 text-blue-500 rounded-lg">
                  <Send className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Telegram Admin Alerts</h3>
                  <p className="text-xs text-gray-500">Payment Verification Alerts</p>
                </div>
              </div>
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                Configured
              </span>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Delivers instant payment-proof receipts and verification actions directly to your personal Telegram account.
            </p>
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200 text-xs text-gray-600 space-y-1">
              <p>Bot: <strong className="text-gray-800">@AIsalesDZ_bot</strong></p>
              <p>Admin Chat ID: <code className="bg-gray-100 px-1 py-0.5 rounded">5468409668</code></p>
              <p className="text-green-700 font-medium">Stored permanently in Firestore database.</p>
            </div>
          </div>
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end">
            <a
              href="/settings"
              className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded text-xs font-medium hover:bg-gray-50"
            >
              Configure in Settings
            </a>
          </div>
        </div>

        {/* Gemini AI Card */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col justify-between overflow-hidden">
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-purple-100 text-purple-600 rounded-lg">
                  <Bot className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Gemini Flash Latest</h3>
                  <p className="text-xs text-gray-500">AI Sales Agent Engine</p>
                </div>
              </div>
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                Active
              </span>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Powers automated customer conversations in Algerian Darija, French, and English, qualifying leads and guiding payment.
            </p>
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200 text-xs text-gray-600 space-y-1">
              <p>Model: <strong className="text-gray-800">gemini-flash-latest</strong></p>
              <p>Voice Transcription: <span className="text-green-700 font-medium">Enabled</span></p>
              <p>Autonomous Payment Verification: <span className="text-red-600 font-medium">Disabled (Enforces Admin Verification)</span></p>
            </div>
          </div>
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end">
            <a
              href="/settings"
              className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded text-xs font-medium hover:bg-gray-50"
            >
              Configure in Settings
            </a>
          </div>
        </div>

      </div>

      {/* Connect Modal Dialog */}
      {activeModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-xl w-full max-h-[90vh] overflow-hidden flex flex-col border border-gray-200">
            {/* Modal Header */}
            <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <div className="flex items-center space-x-2.5">
                {activeModal === "instagram" ? (
                  <div className="p-2 bg-pink-100 text-pink-600 rounded-lg">
                    <Instagram className="w-5 h-5" />
                  </div>
                ) : (
                  <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                    <MessageCircle className="w-5 h-5" />
                  </div>
                )}
                <div>
                  <h3 className="font-bold text-gray-900 text-base">
                    {activeModal === "instagram" ? "Connect Instagram Direct" : "Connect Facebook Messenger"}
                  </h3>
                  <p className="text-xs text-gray-500">Choose connection method</p>
                </div>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-md"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="flex border-b border-gray-200 px-5 pt-2 bg-gray-50/50">
              <button
                onClick={() => setModalTab("direct")}
                className={`py-2 px-4 text-xs font-semibold border-b-2 transition-colors ${
                  modalTab === "direct"
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                Direct Page Access Token (Instant & Recommended)
              </button>
              <button
                onClick={() => setModalTab("oauth")}
                className={`py-2 px-4 text-xs font-semibold border-b-2 transition-colors ${
                  modalTab === "oauth"
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                Meta App OAuth Login
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-4">
              {modalError && (
                <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-start space-x-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-500 mt-0.5" />
                  <span>{modalError}</span>
                </div>
              )}

              {modalTab === "direct" ? (
                <form onSubmit={handleDirectConnect} className="space-y-4">
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                    <p className="font-semibold mb-1">How to obtain your Page Access Token:</p>
                    <ol className="list-decimal list-inside space-y-0.5 text-amber-700">
                      <li>Go to <strong>Meta Business Suite</strong> or <strong>Meta Graph API Explorer</strong>.</li>
                      <li>Select your Facebook Business Page.</li>
                      <li>Generate a <strong>Page Access Token</strong> with <code>pages_messaging</code>, <code>pages_manage_metadata</code> (for Webhooks), and <code>instagram_manage_messages</code> (for Instagram).</li>
                      {activeModal === "instagram" && (
                        <li>Ensure your Instagram account is linked to your Facebook Page in Business Suite.</li>
                      )}
                    </ol>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Meta Page Access Token <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      rows={3}
                      required
                      value={accessTokenInput}
                      onChange={(e) => setAccessTokenInput(e.target.value)}
                      placeholder="e.g. EAAGm0PX4ZC7... (Paste your full Page Access Token here)"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-xs font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                    <p className="text-[11px] text-gray-500 mt-1">
                      The system will verify this token directly with Meta Graph API and detect your Page name automatically.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Page ID <span className="text-gray-400">(Optional)</span>
                      </label>
                      <input
                        type="text"
                        value={pageIdInput}
                        onChange={(e) => setPageIdInput(e.target.value)}
                        placeholder="Auto-detected from token"
                        className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>

                    {activeModal === "instagram" && (
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Instagram Account ID <span className="text-gray-400">(Optional)</span>
                        </label>
                        <input
                          type="text"
                          value={igAccountIdInput}
                          onChange={(e) => setIgAccountIdInput(e.target.value)}
                          placeholder="Auto-detected if linked"
                          className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                      </div>
                    )}
                  </div>

                  <div className="pt-2 flex justify-end space-x-2">
                    <button
                      type="button"
                      onClick={() => setActiveModal(null)}
                      className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md text-xs font-medium hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={connecting}
                      className="px-5 py-2 bg-blue-600 text-white rounded-md text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center shadow-sm"
                    >
                      {connecting && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                      Verify & Connect Permanently
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-4">
                  <p className="text-xs text-gray-600">
                    If you have created a Meta App in developers.facebook.com, you can authenticate directly with Facebook Login.
                  </p>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Meta App ID (Non-Secret)
                      </label>
                      <input
                        type="text"
                        value={appIdInput}
                        onChange={(e) => setAppIdInput(e.target.value)}
                        placeholder="e.g. 1092837465241"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-xs font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>

                    <div className="bg-blue-50 border border-blue-200 p-3 rounded text-xs text-blue-800 space-y-1">
                      <p className="font-semibold flex items-center"><ShieldCheck className="w-3.5 h-3.5 mr-1" /> Meta App Secret Required</p>
                      <p>For security, the Meta App Secret must be configured in <strong>AI Studio Secrets</strong> as <code>META_APP_SECRET</code>. It will not be stored in the database.</p>
                    </div>
                  </div>

                  <div className="bg-gray-50 border border-gray-200 rounded p-3 text-xs text-gray-600 space-y-1">
                    <p className="font-semibold text-gray-800">Required OAuth Redirect URI on Meta App:</p>
                    <code className="text-[11px] block bg-white p-1 rounded border border-gray-200 text-gray-700 font-mono break-all select-all">
                      {window.location.origin}/api/admin/connectors/meta/oauth/callback
                    </code>
                  </div>

                  <div className="pt-2 flex justify-end space-x-2">
                    <button
                      type="button"
                      onClick={() => setActiveModal(null)}
                      className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md text-xs font-medium hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleStartOAuth}
                      disabled={connecting}
                      className="px-5 py-2 bg-blue-600 text-white rounded-md text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center shadow-sm"
                    >
                      {connecting && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                      Start Facebook OAuth
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* OAuth Page Selector Modal */}
      {showPageSelector && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col border border-gray-200">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h2 className="text-base font-semibold text-gray-900">Select Meta Account to Connect</h2>
              <button onClick={() => setShowPageSelector(false)} className="text-gray-400 hover:text-gray-600">
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto flex-1 space-y-6">
              {metaPages.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500 text-sm">No eligible Facebook Pages were found in your Meta account.</p>
                  <p className="text-xs text-gray-400 mt-1">Make sure your Facebook account has admin access to at least one Business Page.</p>
                </div>
              ) : (
                <>
                  <div>
                    <h3 className="font-semibold text-sm mb-3 text-gray-800">Facebook Pages (Messenger)</h3>
                    <div className="space-y-2.5">
                      {metaPages.map(page => (
                        <div key={page.id} className="border border-gray-200 rounded-lg p-3.5 flex justify-between items-center bg-gray-50/50 hover:bg-gray-50">
                          <div>
                            <div className="font-medium text-sm text-gray-900">{page.name}</div>
                            <div className="text-xs text-gray-500">Page ID: {page.id}</div>
                          </div>
                          <button 
                            onClick={() => handleSelectPage(page, "messenger")} 
                            className="px-3.5 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-md hover:bg-blue-700 shadow-xs"
                          >
                            Connect Messenger
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="pt-4 border-t border-gray-100">
                    <h3 className="font-semibold text-sm mb-3 text-gray-800">Instagram Professional Accounts</h3>
                    <div className="space-y-2.5">
                      {metaPages.filter(p => p.instagram_business_account).length === 0 ? (
                        <p className="text-xs text-gray-500 italic bg-gray-50 p-3 rounded border border-gray-200">
                          No linked Instagram Professional accounts found on these Facebook Pages. Link your Instagram account to your Facebook Page in Meta Business Suite to connect Instagram Direct.
                        </p>
                      ) : (
                        metaPages.filter(p => p.instagram_business_account).map(page => (
                          <div key={`ig-${page.id}`} className="border border-gray-200 rounded-lg p-3.5 flex justify-between items-center bg-gray-50/50 hover:bg-gray-50">
                            <div>
                              <div className="font-medium text-sm text-gray-900">@{page.instagram_business_account.username}</div>
                              <div className="text-xs text-gray-500">Via Facebook Page: {page.name}</div>
                            </div>
                            <button 
                              onClick={() => handleSelectPage(page, "instagram")} 
                              className="px-3.5 py-1.5 bg-pink-600 text-white text-xs font-semibold rounded-md hover:bg-pink-700 shadow-xs"
                            >
                              Connect Instagram
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

          </div>
    </DashboardLayout>
  );
}