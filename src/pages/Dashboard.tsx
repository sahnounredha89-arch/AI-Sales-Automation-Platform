import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import DashboardLayout from "../components/DashboardLayout";
import { apiFetch } from "../lib/api";
import {
  Database,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  ExternalLink,
  MessageCircle,
  User,
  Sparkles,
  Cpu,
  ShieldCheck,
  Zap,
  RefreshCw,
  Layers,
  Clock
} from "lucide-react";

export default function Dashboard() {
  const [metrics, setMetrics] = useState<any>({
    totalProducts: 0,
    activeProducts: 0,
    totalOrders: 0,
    pendingPayments: 0,
    waitingVerification: 0,
    paidOrders: 0,
    deliveredOrders: 0,
    revenueDZD: 0,
    revenueUSDT: 0,
    totalCustomers: 0,
    activeConversations: 0,
    humanHandoffConversations: 0,
    dbStatus: null,
    geminiQuota: null
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [refreshingConnection, setRefreshingConnection] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const [activeBotTasks, setActiveBotTasks] = useState<string[]>([]);

  
  useEffect(() => {
    const fetchBotStatus = () => {
      apiFetch("/api/admin/dashboard/bot-status")
        .then(res => res.json())
        .then(data => {
          if (data && data.activeBotTasks) {
            setActiveBotTasks(data.activeBotTasks);
          }
        })
        .catch(console.error);
    };
    
    // Initial fetch
    fetchBotStatus();
    
    // Poll every 2 seconds
    const interval = setInterval(fetchBotStatus, 2000);
    return () => clearInterval(interval);
  }, []);

  const fetchMetrics = (force = false) => {
    apiFetch(`/api/admin/dashboard/metrics${force ? "?force=true" : ""}`)
      .then(async res => {
        if (!res.ok) {
          if (res.status === 401) {
            window.location.href = '/login';
            return new Promise(() => {});
          }
          const contentType = res.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || "Failed to fetch data");
          } else {
            const text = await res.text();
            throw new Error(`Server error (HTTP ${res.status}): ${text.substring(0, 80)}`);
          }
        }
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          return res.json();
        } else {
          const text = await res.text();
          throw new Error(`Invalid response format from server`);
        }
      })
      .then(data => {
        setError(null);
        setMetrics(data);
      })
      .catch(err => {
        console.error(err);
        setError(err.message);
      })
      .finally(() => setLoading(false));
  };

  const handleRefreshDatabase = async () => {
    setRefreshingConnection(true);
    setRefreshMessage(null);
    try {
      const res = await apiFetch("/api/admin/database/refresh", {
        method: "POST",
      });
      const contentType = res.headers.get("content-type");
      let data: any = {};
      if (contentType && contentType.includes("application/json")) {
        data = await res.json();
      } else {
        const text = await res.text();
        throw new Error(`Server returned non-JSON response (HTTP ${res.status})`);
      }

      if (res.ok) {
        setRefreshMessage(data.message || "Database connection refreshed successfully.");
        fetchMetrics(true);
      } else {
        setRefreshMessage(data.error || "Failed to refresh database connection.");
      }
    } catch (err: any) {
      setRefreshMessage(err.message || "Failed to refresh database connection.");
    } finally {
      setRefreshingConnection(false);
      setTimeout(() => setRefreshMessage(null), 6000);
    }
  };

  useEffect(() => {
    fetchMetrics();
    // 60-second polling interval to respect Firestore daily read quotas
    const interval = setInterval(() => fetchMetrics(false), 60000);
    return () => clearInterval(interval);
  }, []);

  const handleResetCooldown = async (model?: string) => {
    setResetting(true);
    try {
      await apiFetch("/api/admin/dashboard/gemini-quota/reset-cooldown", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model }),
      });
      await fetchMetrics(true);
    } catch (e) {
      console.error(e);
    } finally {
      setResetting(false);
    }
  };

  const quota = metrics?.geminiQuota || {};
  const cooldowns = quota.cooldownStatus || {};
  const primaryModel = quota.primaryModel || "gemini-flash-latest";
  const primaryStatus = cooldowns[primaryModel] || { inCooldown: false, remainingSeconds: 0 };

  return (
    <DashboardLayout>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Real-time overview of products, sales orders, and customer conversations</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {metrics?.dbStatus && (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border shadow-xs bg-white">
              <Database className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-gray-600">Database:</span>
              {metrics.dbStatus.quotaExceeded || metrics.dbStatus.mode === "cloud_quota_exceeded" ? (
                <span className="inline-flex items-center text-amber-700 font-semibold" title={metrics.dbStatus.message}>
                  <AlertTriangle className="w-3.5 h-3.5 mr-1 text-amber-500" /> Cloud Firestore (Quota Reached — Local Store Active)
                </span>
              ) : metrics.dbStatus.mode === "cloud" ? (
                <span className="inline-flex items-center text-green-700 font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Cloud Firestore Connected
                </span>
              ) : (
                <span className="inline-flex items-center text-blue-700 font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Local Persistence Active
                </span>
              )}
            </div>
          )}
          <button
            onClick={handleRefreshDatabase}
            disabled={refreshingConnection}
            title="Refresh database connection and check quota status"
            className="p-1.5 rounded-full border bg-white hover:bg-gray-50 text-gray-600 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshingConnection ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {refreshMessage && (
        <div className="mb-6 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800 flex items-center justify-between">
          <span>{refreshMessage}</span>
          <button onClick={() => setRefreshMessage(null)} className="text-blue-600 hover:text-blue-900 text-xs font-semibold">Dismiss</button>
        </div>
      )}

      {/* GEMINI AI & QUOTA EFFICIENCY DASHBOARD */}
      <div className="mb-8 bg-white border border-gray-200 rounded-xl shadow-xs overflow-hidden">
        <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-white border-b border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 border border-indigo-100 rounded-lg text-indigo-600">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-gray-900">Gemini AI & Quota Efficiency</h2>
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
                  Primary: {primaryModel}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                Multi-tier fallback chain, sub-second duplicate rejection, and zero-quota deterministic replies
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {primaryStatus.inCooldown ? (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                  <Clock className="w-3.5 h-3.5 mr-1 animate-pulse" /> {primaryModel} in Cooldown ({primaryStatus.remainingSeconds}s)
                </span>
                <button
                  onClick={() => handleResetCooldown(primaryModel)}
                  disabled={resetting}
                  className="text-xs px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded font-medium disabled:opacity-50"
                >
                  Reset
                </button>
              </div>
            ) : (
              <span className="inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> {primaryModel} Active
              </span>
            )}
          </div>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-gray-50 border border-gray-100 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Gemini Calls (Today)</span>
                <Sparkles className="w-4 h-4 text-indigo-500" />
              </div>
              <p className="text-2xl font-bold text-gray-900 mt-1">{quota.totalRequests || 0}</p>
              <p className="text-xs text-gray-500 mt-1">
                Fallbacks: <span className="font-semibold text-gray-700">{quota.fallbackCount || 0}</span> | 429 Errors: <span className="font-semibold text-amber-600">{quota.quotaErrors || 0}</span>
              </p>
            </div>

            <div className="bg-gray-50 border border-gray-100 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Calls Saved Total</span>
                <Zap className="w-4 h-4 text-emerald-500" />
              </div>
              <p className="text-2xl font-bold text-emerald-600 mt-1">{quota.geminiCallsSavedTotal || 0}</p>
              <p className="text-xs text-gray-500 mt-1">
                Deterministic: <span className="font-semibold text-gray-700">{quota.deterministicCallsHandled || 0}</span> | Dups Blocked: <span className="font-semibold text-gray-700">{quota.duplicatesPrevented || 0}</span>
              </p>
            </div>

            <div className="bg-gray-50 border border-gray-100 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Tokens Consumed</span>
                <Layers className="w-4 h-4 text-blue-500" />
              </div>
              <p className="text-2xl font-bold text-gray-900 mt-1">{(quota.totalTokens || 0).toLocaleString()}</p>
              <p className="text-xs text-gray-500 mt-1">
                Avg In: <span className="font-semibold text-gray-700">{quota.avgInputTokens || 0}</span> | Avg Out: <span className="font-semibold text-gray-700">{quota.avgOutputTokens || 0}</span>
              </p>
            </div>

            <div className="bg-gray-50 border border-gray-100 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Duplicates Prevented</span>
                <ShieldCheck className="w-4 h-4 text-purple-500" />
              </div>
              <p className="text-2xl font-bold text-purple-700 mt-1">{quota.duplicatesPrevented || 0}</p>
              <p className="text-xs text-gray-500 mt-1">Atomic 1-Message/1-Reply Idempotency</p>
            </div>
          </div>

          {/* Model Chain Breakdown */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200">
              <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                Fallback Chain & Model Execution Statistics
              </h3>
            </div>
            <div className="divide-y divide-gray-200">
              {[
                { name: "gemini-flash-latest", tier: "Tier 1 (Primary Model)", desc: "Flagship Gemini Flash Latest - Fast, intelligent client replies" },
                { name: "gemini-3.8-flash", tier: "Tier 2 (High Speed Fallback)", desc: "Standard text model fallback" },
                { name: "gemini-3.1-flash-lite", tier: "Tier 3 (Safety Net)", desc: "Ultra-low latency resilient fallback" },
              ].map((m, idx) => {
                const stat = quota.byModel?.[m.name] || {
                  requests: 0,
                  inputTokens: 0,
                  outputTokens: 0,
                  quotaErrors: 0,
                };
                const status = cooldowns[m.name] || { inCooldown: false, remainingSeconds: 0 };
                return (
                  <div key={m.name} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-medium text-gray-900">{m.name}</span>
                        <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-700 font-medium">{m.tier}</span>
                        {status.inCooldown ? (
                          <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-medium">
                            Cooldown ({status.remainingSeconds}s)
                          </span>
                        ) : (
                          <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-800 font-medium">
                            Ready
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{m.desc}</p>
                    </div>
                    <div className="flex items-center gap-6 text-xs text-gray-600">
                      <div>
                        <span className="text-gray-400 block">Requests</span>
                        <span className="font-semibold text-gray-800">{stat.requests || 0}</span>
                      </div>
                      <div>
                        <span className="text-gray-400 block">Input Tokens</span>
                        <span className="font-semibold text-gray-800">{(stat.inputTokens || 0).toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-gray-400 block">Output Tokens</span>
                        <span className="font-semibold text-gray-800">{(stat.outputTokens || 0).toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-gray-400 block">429 Errors</span>
                        <span className={`font-semibold ${stat.quotaErrors > 0 ? "text-amber-600" : "text-gray-800"}`}>
                          {stat.quotaErrors || 0}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Informational Persistence Banner */}
      {(metrics?.dbStatus?.quotaExceeded || metrics?.dbStatus?.mode === "cloud_quota_exceeded") ? (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-lg p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="p-1.5 bg-amber-100 rounded-md text-amber-800 mt-0.5 shrink-0">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-amber-900">
                Cloud Firestore Daily Read Quota Reached — Local High-Availability Active
              </p>
              <p className="text-xs text-amber-800 mt-0.5 max-w-3xl leading-relaxed">
                Your Firebase project (<code className="bg-amber-100/80 px-1 py-0.5 rounded font-mono text-amber-950">{metrics.dbStatus.projectId || "ai-sales-automation-ada3a"}</code>) credentials are <strong>verified and operational</strong>. Google Cloud's free Spark plan daily read quota (50,000 reads/day) has been reached today. 
                The platform's resilient local storage engine is actively serving all catalog products, customer conversations, and order operations on disk with zero interruption.
              </p>
              <p className="text-xs text-amber-700 mt-1.5 font-medium flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Resets daily at 00:00 US Pacific Time (08:00 UTC). Or switch Firebase project to Blaze plan for pay-as-you-go reads.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
            <a
              href={`https://console.firebase.google.com/project/${metrics.dbStatus.projectId || "ai-sales-automation-ada3a"}/usage`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center text-xs font-medium text-amber-900 bg-white hover:bg-amber-50 px-3 py-1.5 rounded border border-amber-300 shadow-xs whitespace-nowrap"
            >
              Firebase Usage <ExternalLink className="w-3 h-3 ml-1" />
            </a>
          </div>
        </div>
      ) : metrics?.dbStatus?.mode === "local" ? (
        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="p-1 bg-blue-100 rounded text-blue-700 mt-0.5 shrink-0">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-medium text-blue-900">
                Operating with Resilient Local Persistence
              </p>
              <p className="text-xs text-blue-700 mt-0.5">
                All catalog products, payment methods, and customer orders are active and stored safely on disk. To sync directly with Cloud Firestore in production, add service credentials.
              </p>
            </div>
          </div>
          <Link
            to="/settings"
            className="inline-flex items-center text-xs font-medium text-blue-800 bg-white hover:bg-blue-50 px-3 py-1.5 rounded border border-blue-200 shadow-xs whitespace-nowrap"
          >
            Credential Inventory <ArrowRight className="w-3 h-3 ml-1" />
          </Link>
        </div>
      ) : null}

      {error ? (
          <div className="p-6 text-center text-red-500 bg-red-50 border border-red-200 rounded-md m-4">{error}</div>
        ) : loading ? (
        <div className="text-gray-500">Loading metrics...</div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 mb-5">
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <dt className="text-sm font-medium text-gray-500 truncate">Total Customers</dt>
                <dd className="mt-1 text-3xl font-semibold text-gray-900">{metrics.totalCustomers}</dd>
              </div>
            </div>
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <dt className="text-sm font-medium text-blue-600 truncate">Active Conversations</dt>
                <dd className="mt-1 text-3xl font-semibold text-gray-900">{metrics.activeConversations}</dd>
              </div>
            </div>
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <dt className="text-sm font-medium text-yellow-600 truncate">Human Handoff</dt>
                <dd className="mt-1 text-3xl font-semibold text-gray-900">{metrics.humanHandoffConversations}</dd>
              </div>
            </div>
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <dt className="text-sm font-medium text-gray-500 truncate">Total Products (Active)</dt>
                <dd className="mt-1 text-3xl font-semibold text-gray-900">{metrics.totalProducts} ({metrics.activeProducts})</dd>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <dt className="text-sm font-medium text-gray-500 truncate">Total Orders</dt>
                <dd className="mt-1 text-3xl font-semibold text-gray-900">{metrics.totalOrders}</dd>
              </div>
            </div>
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <dt className="text-sm font-medium text-yellow-600 truncate">Waiting Verification</dt>
                <dd className="mt-1 text-3xl font-semibold text-gray-900">{metrics.waitingVerification}</dd>
              </div>
            </div>
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <dt className="text-sm font-medium text-green-600 truncate">Paid / Delivered</dt>
                <dd className="mt-1 text-3xl font-semibold text-gray-900">{metrics.paidOrders} / {metrics.deliveredOrders}</dd>
              </div>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <dt className="text-sm font-medium text-gray-500 truncate">Revenue (DZD)</dt>
                <dd className="mt-1 text-3xl font-semibold text-green-600">{metrics.revenueDZD.toLocaleString()} DZD</dd>
              </div>
            </div>
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <dt className="text-sm font-medium text-gray-500 truncate">Revenue (USDT)</dt>
                <dd className="mt-1 text-3xl font-semibold text-blue-600">{metrics.revenueUSDT.toLocaleString()} USDT</dd>
              </div>
            </div>
          </div>

          <div className="mt-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg leading-6 font-medium text-gray-900">Latest Live Conversations</h2>
              <Link to="/conversations" className="text-xs text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1">
                View all in Inbox <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            {metrics.recentConversations && metrics.recentConversations.length > 0 ? (
              <div className="bg-white shadow rounded-lg divide-y divide-gray-100 overflow-hidden">
                {metrics.recentConversations.map((conv: any) => (
                  <Link
                    key={conv.id}
                    to="/conversations"
                    className="p-4 flex items-center justify-between hover:bg-gray-50 transition cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                        <MessageCircle className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-gray-900">{conv.customerName || conv.customerId}</p>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 uppercase font-medium">
                            {conv.platform || "Messenger"}
                          </span>
                          {conv.humanHandoff && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 font-medium">
                              Human Handoff
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 line-clamp-1 mt-0.5 max-w-lg" dir="auto">
                          {conv.snippet || "No messages yet"}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs text-gray-400 shrink-0">
                      {conv.lastMessageAt || conv.updatedAt ? new Date(conv.lastMessageAt || conv.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ""}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="bg-white shadow overflow-hidden sm:rounded-md p-6 flex justify-center items-center h-48 text-gray-500">
                No recent activity to display.
              </div>
            )}
          </div>
        </>
      )}
    </DashboardLayout>
  );
}
