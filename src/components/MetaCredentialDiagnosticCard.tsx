import React, { useState, useEffect } from "react";
import {
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  KeyRound,
  ExternalLink,
  Layers,
  Copy,
  Check,
  HelpCircle,
  Clock,
  Fingerprint,
  Info,
  Server,
  Lock,
} from "lucide-react";
import { apiFetch } from "../lib/api";

export interface CredentialHealthReport {
  isConfigured: boolean;
  status: "TOKEN_VALID" | "TOKEN_EXPIRED" | "TOKEN_INVALID" | "TOKEN_APP_MISMATCH" | "TOKEN_PERMISSION_ERROR" | "TOKEN_NOT_CONFIGURED" | "META_API_UNAVAILABLE";
  statusMessage: string;
  tokenSource: string;
  tokenFingerprint: string;
  tokenPrefix: string;
  tokenLength: number;
  expectedPageId: string;
  verifiedPageId: string | null;
  pageIdMatches: boolean;
  pageName: string | null;
  expectedAppId: string;
  verifiedAppId: string | null;
  appIdMatches: boolean;
  hasPagesMessaging: boolean;
  grantedPermissions: string[];
  expiresAt: string | null;
  lastValidatedAt: string;
  errorSubcode?: number;
  sources?: Array<{
    source: string;
    present: boolean;
    fingerprint: string;
    prefix: string;
    length: number;
    matchesAuthoritative: boolean;
  }>;
}

interface Props {
  onTokenReplaced?: () => void;
}

export default function MetaCredentialDiagnosticCard({ onTokenReplaced }: Props) {
  const [health, setHealth] = useState<CredentialHealthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedHash, setCopiedHash] = useState(false);

  // Modal and drawer states
  const [showReplaceModal, setShowReplaceModal] = useState(false);
  const [newTokenInput, setNewTokenInput] = useState("");
  const [replacePageId, setReplacePageId] = useState("110414661460391");
  const [replacePageName, setReplacePageName] = useState("Dokuni Shop");
  const [replacing, setReplacing] = useState(false);
  const [replaceError, setReplaceError] = useState<string | null>(null);
  const [replaceSuccess, setReplaceSuccess] = useState<string | null>(null);

  const [showConsistency, setShowConsistency] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  const fetchHealth = async (force: boolean = false) => {
    if (force) setValidating(true);
    else setLoading(true);
    setError(null);

    try {
      const endpoint = force
        ? "/api/admin/connectors/meta/validate-now"
        : "/api/admin/connectors/meta/credential-health";
      const method = force ? "POST" : "GET";
      const res = await apiFetch(endpoint, { method });
      const data = await res.json();
      if (res.ok) {
        setHealth(data);
      } else {
        setError(data.error || "Failed to load Meta credential health.");
      }
    } catch (err: any) {
      setError(err.message || "Network error loading credential health.");
    } finally {
      setLoading(false);
      setValidating(false);
    }
  };

  useEffect(() => {
    fetchHealth(false);
  }, []);

  const handleCopyFingerprint = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  const handleSafeReplacement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTokenInput.trim()) {
      setReplaceError("Please provide a new candidate Meta token.");
      return;
    }

    setReplacing(true);
    setReplaceError(null);
    setReplaceSuccess(null);

    try {
      const res = await apiFetch("/api/admin/connectors/meta/replace-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newToken: newTokenInput.trim(),
          pageId: replacePageId.trim() || undefined,
          pageName: replacePageName.trim() || undefined,
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
        setReplaceSuccess(data.message || "Token validated and safely activated!");
        setNewTokenInput("");
        fetchHealth(true);
        if (onTokenReplaced) onTokenReplaced();
        setTimeout(() => {
          setShowReplaceModal(false);
          setReplaceSuccess(null);
        }, 2000);
      } else {
        setReplaceError(data.message || data.error || "Meta validation rejected this token.");
      }
    } catch (err: any) {
      setReplaceError(err.message || "Failed to contact verification server.");
    } finally {
      setReplacing(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "TOKEN_VALID":
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <CheckCircle2 className="w-3.5 h-3.5 mr-1.5 text-emerald-600" />
            TOKEN VALID & ACTIVE
          </span>
        );
      case "TOKEN_EXPIRED":
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300">
            <Clock className="w-3.5 h-3.5 mr-1.5 text-rose-600" />
            SESSION EXPIRED (Meta Code 190)
          </span>
        );
      case "TOKEN_APP_MISMATCH":
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
            <AlertTriangle className="w-3.5 h-3.5 mr-1.5 text-amber-600" />
            APP MISMATCH
          </span>
        );
      case "TOKEN_PERMISSION_ERROR":
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
            <AlertTriangle className="w-3.5 h-3.5 mr-1.5 text-amber-600" />
            PERMISSION MISSING (pages_messaging)
          </span>
        );
      case "TOKEN_NOT_CONFIGURED":
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-700 border border-gray-300">
            <Info className="w-3.5 h-3.5 mr-1.5 text-gray-500" />
            NOT CONFIGURED
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300">
            <XCircle className="w-3.5 h-3.5 mr-1.5 text-rose-600" />
            {status}
          </span>
        );
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Header Bar */}
      <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-slate-50 to-indigo-50/30 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-indigo-600 text-white rounded-lg shadow-sm">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-base font-bold text-gray-900">
                Authoritative Meta Credential Diagnostics
              </h2>
              <span className="text-[10px] font-mono uppercase bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded">
                Hardened Single Source
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Persistent verification engine with zero credential erasure and continuous token health checks.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {health && getStatusBadge(health.status)}

          <button
            onClick={() => fetchHealth(true)}
            disabled={validating || loading}
            title="Force run live validation against Meta Graph API"
            className="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-xs font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${validating ? "animate-spin text-indigo-600" : ""}`} />
            {validating ? "Validating..." : "Re-Validate with Meta"}
          </button>

          <button
            onClick={() => {
              setShowReplaceModal(true);
              setReplaceError(null);
              setReplaceSuccess(null);
            }}
            className="inline-flex items-center px-3 py-1.5 border border-transparent shadow-sm text-xs font-semibold rounded-lg text-white bg-indigo-600 hover:bg-indigo-700"
          >
            <KeyRound className="w-3.5 h-3.5 mr-1.5" />
            Replace Token Safely
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-6 space-y-6">
        {error && (
          <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs flex items-center space-x-2">
            <XCircle className="w-4 h-4 flex-shrink-0 text-rose-500" />
            <span>{error}</span>
          </div>
        )}

        {loading && !health ? (
          <div className="py-8 flex flex-col items-center justify-center text-gray-400 space-y-2">
            <RefreshCw className="w-6 h-6 animate-spin text-indigo-600" />
            <span className="text-xs">Querying authoritative credential architecture...</span>
          </div>
        ) : health ? (
          <>
            {/* Status Alert Banner */}
            {health.status === "TOKEN_EXPIRED" && (
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-2">
                    <Clock className="w-5 h-5 text-rose-600 flex-shrink-0" />
                    <div>
                      <h4 className="text-sm font-bold text-rose-900">
                        Meta Graph API Diagnostic: Token Session Expired (Code 190, Subcode {health.errorSubcode || 463})
                      </h4>
                      <p className="text-xs text-rose-700 mt-0.5">
                        {health.statusMessage}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowGuide(!showGuide)}
                    className="text-xs text-rose-700 font-semibold underline hover:text-rose-900 flex items-center space-x-1"
                  >
                    <span>{showGuide ? "Hide Solution" : "How to Fix"}</span>
                    <HelpCircle className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Root Cause Explanation */}
                <div className="text-xs text-rose-800 bg-white/70 p-3 rounded border border-rose-200 leading-relaxed">
                  <strong>Why Meta Explorer showed the same string:</strong> Short-lived User Tokens expire after 1–2 hours even if the string preview looks identical. Meta requires a permanent or 60-day Page Access Token for production server webhooks. 
                  <br />
                  <span className="text-slate-600">
                    <strong>Protection Active:</strong> This application has <em>never</em> deleted your credential. The token is safely preserved in persistent storage and waiting for a refreshed token string.
                  </span>
                </div>

                {showGuide && (
                  <div className="bg-white p-4 rounded-lg border border-rose-200 text-xs space-y-2 text-slate-700">
                    <div className="font-bold text-slate-900 text-sm flex items-center space-x-1.5">
                      <KeyRound className="w-4 h-4 text-indigo-600" />
                      <span>Step-by-Step Fix: Generate a Never-Expiring Page Token</span>
                    </div>
                    <ol className="list-decimal list-inside space-y-1.5 pl-1 leading-relaxed">
                      <li>
                        Open{" "}
                        <a
                          href="https://developers.facebook.com/tools/explorer/"
                          target="_blank"
                          rel="noreferrer"
                          className="text-indigo-600 underline font-medium inline-flex items-center"
                        >
                          Meta Graph API Explorer <ExternalLink className="w-3 h-3 ml-0.5" />
                        </a>.
                      </li>
                      <li>
                        Ensure <strong>Meta App</strong> is set to <code>{health.expectedAppId} (Dokuni Shop)</code>.
                      </li>
                      <li>
                        Under <strong>User or Page</strong>, select <strong>Dokuni Shop (Page)</strong> (NOT your personal user account).
                      </li>
                      <li>
                        Under <strong>Permissions</strong>, confirm <code>pages_messaging</code> and <code>pages_show_list</code> are added.
                      </li>
                      <li>
                        Click <strong>Generate Access Token</strong> and copy the resulting string.
                      </li>
                      <li>
                        Click <strong>Replace Token Safely</strong> above. The server will validate the new token against Meta before activating it.
                      </li>
                    </ol>
                  </div>
                )}
              </div>
            )}

            {/* Diagnostic Matrix Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Card 1: Authoritative Source */}
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-500 font-semibold uppercase tracking-wider">
                  <span>Authoritative Source</span>
                  <Server className="w-4 h-4 text-slate-400" />
                </div>
                <div className="text-sm font-bold text-slate-900 capitalize">
                  {health.tokenSource ? health.tokenSource.replace(/_/g, " ") : "Unknown"}
                </div>
                <div className="text-[11px] text-slate-500 leading-tight">
                  Single authoritative runtime reader across all webhooks & outbound messaging.
                </div>
              </div>

              {/* Card 2: Safe Token Metadata */}
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-500 font-semibold uppercase tracking-wider">
                  <span>SHA-256 Fingerprint</span>
                  <Fingerprint className="w-4 h-4 text-indigo-500" />
                </div>
                <div className="flex items-center justify-between bg-white px-2 py-1 rounded border border-slate-200">
                  <span className="font-mono text-xs text-slate-800">
                    {health.tokenFingerprint
                      ? `${health.tokenFingerprint.substring(0, 8)}...${health.tokenFingerprint.slice(-8)}`
                      : "No Token"}
                  </span>
                  {health.tokenFingerprint && (
                    <button
                      onClick={() => handleCopyFingerprint(health.tokenFingerprint)}
                      className="text-slate-400 hover:text-indigo-600"
                      title="Copy full 64-char fingerprint"
                    >
                      {copiedHash ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>
                <div className="flex justify-between text-[11px] text-slate-500">
                  <span>Prefix: <code className="font-mono text-slate-700">{health.tokenPrefix || "None"}</code></span>
                  <span>Length: <strong className="text-slate-700">{health.tokenLength} chars</strong></span>
                </div>
              </div>

              {/* Card 3: Target Page Verification */}
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-500 font-semibold uppercase tracking-wider">
                  <span>Facebook Page Target</span>
                  {health.pageIdMatches ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                  )}
                </div>
                <div className="text-sm font-bold text-slate-900 truncate">
                  {health.pageName || "Dokuni Shop"}
                </div>
                <div className="text-[11px] text-slate-500 space-y-0.5">
                  <div className="flex justify-between">
                    <span>Expected:</span>
                    <span className="font-mono text-slate-700">{health.expectedPageId}</span>
                  </div>
                  {health.verifiedPageId && (
                    <div className="flex justify-between">
                      <span>Token Page:</span>
                      <span className="font-mono text-slate-700">{health.verifiedPageId}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Card 4: Permissions & Verification Date */}
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-500 font-semibold uppercase tracking-wider">
                  <span>Messaging Permission</span>
                  {health.hasPagesMessaging ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-500" />
                  )}
                </div>
                <div className="flex items-center space-x-1.5">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                      health.hasPagesMessaging
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-rose-100 text-rose-800"
                    }`}
                  >
                    pages_messaging: {health.hasPagesMessaging ? "GRANTED" : "MISSING"}
                  </span>
                </div>
                <div className="text-[11px] text-slate-500">
                  Last Validated:{" "}
                  <span className="text-slate-700 font-medium">
                    {health.lastValidatedAt
                      ? new Date(health.lastValidatedAt).toLocaleTimeString()
                      : "Never"}
                  </span>
                </div>
              </div>
            </div>

            {/* Bottom Actions & Consistency Checker */}
            <div className="pt-2 flex flex-wrap items-center justify-between gap-3 text-xs border-t border-slate-100">
              <button
                onClick={() => setShowConsistency(!showConsistency)}
                className="inline-flex items-center text-slate-600 hover:text-indigo-600 font-medium"
              >
                <Layers className="w-4 h-4 mr-1.5 text-slate-400" />
                <span>
                  {showConsistency ? "Hide Multi-Source Consistency" : "View Multi-Source Consistency (Firestore, Backup, .env)"}
                </span>
              </button>

              <div className="flex items-center space-x-2 text-slate-500 text-[11px]">
                <ShieldCheck className="w-4 h-4 text-indigo-500" />
                <span>Zero-Erasure Guarantee active. Tokens are never purged upon validation error.</span>
              </div>
            </div>

            {/* Multi-Source Consistency Breakdown */}
            {showConsistency && health.sources && (
              <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <h5 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Storage Consistency Matrix
                  </h5>
                  <span className="text-[11px] text-slate-500">
                    All sources must share identical SHA-256 fingerprints
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-200/60 text-slate-700 font-semibold">
                      <tr>
                        <th className="p-2 rounded-l">Storage Source</th>
                        <th className="p-2">Configured</th>
                        <th className="p-2">SHA-256 Fingerprint</th>
                        <th className="p-2">Prefix</th>
                        <th className="p-2 rounded-r">Length</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-slate-700 font-mono">
                      {health.sources.map((s, idx) => (
                        <tr key={idx} className="hover:bg-white/60">
                          <td className="p-2 font-sans font-medium text-slate-900">{s.source}</td>
                          <td className="p-2 font-sans">
                            {s.present ? (
                              <span className="text-emerald-700 font-semibold flex items-center">
                                <Check className="w-3 h-3 mr-1" /> Present
                              </span>
                            ) : (
                              <span className="text-slate-400">Empty</span>
                            )}
                          </td>
                          <td className="p-2 text-slate-600">
                            {s.fingerprint ? `${s.fingerprint.substring(0, 16)}...${s.fingerprint.slice(-8)}` : "—"}
                          </td>
                          <td className="p-2">{s.prefix || "—"}</td>
                          <td className="p-2 font-sans">{s.length ? `${s.length} chars` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        ) : null}
      </div>

      {/* Two-Step Safe Token Replacement Modal */}
      {showReplaceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl border border-gray-200 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-gray-200 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <KeyRound className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-bold text-gray-900">
                  Safe Meta Token Replacement
                </h3>
              </div>
              <button
                onClick={() => setShowReplaceModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSafeReplacement} className="p-6 space-y-4">
              <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg text-xs text-indigo-900 leading-relaxed">
                <strong>Two-Step Safety Verification:</strong> Candidate tokens are verified live against Meta Graph API <em>before</em> saving. If the token is expired or lacks permissions, the replacement is rejected and your active system remains untouched.
              </div>

              {replaceError && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-start space-x-2">
                  <XCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                  <div className="leading-relaxed">
                    <strong>Meta Rejection:</strong> {replaceError}
                  </div>
                </div>
              )}

              {replaceSuccess && (
                <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <span>{replaceSuccess}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  New Meta Page Access Token <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={4}
                  value={newTokenInput}
                  onChange={(e) => setNewTokenInput(e.target.value)}
                  placeholder="Paste candidate Page Access Token (starts with EAA...)"
                  className="w-full text-xs font-mono p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                    Target Page ID
                  </label>
                  <input
                    type="text"
                    value={replacePageId}
                    onChange={(e) => setReplacePageId(e.target.value)}
                    placeholder="110414661460391"
                    className="w-full text-xs p-2.5 border border-gray-300 rounded-lg font-mono focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                    Target Page Name
                  </label>
                  <input
                    type="text"
                    value={replacePageName}
                    onChange={(e) => setReplacePageName(e.target.value)}
                    placeholder="Dokuni Shop"
                    className="w-full text-xs p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-gray-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowReplaceModal(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={replacing || !newTokenInput.trim()}
                  className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center space-x-1.5"
                >
                  {replacing ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Validating Candidate with Meta...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Validate & Activate Token</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
