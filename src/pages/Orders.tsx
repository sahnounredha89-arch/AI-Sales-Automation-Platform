import React, { useEffect, useState } from "react";
import DashboardLayout from "../components/DashboardLayout";
import { CheckCircle, XCircle, Truck, Bell, ExternalLink, RefreshCw } from "lucide-react";
import { apiFetch } from "../lib/api";

export default function Orders() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [retryingTgId, setRetryingTgId] = useState<string | null>(null);

  const fetchOrders = () => {
    setLoading(true);
    apiFetch("/api/admin/orders")
      .then(async (res) => {
        if (!res.ok) {
          if (res.status === 401) {
            window.location.href = "/login";
            return new Promise(() => {});
          }
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Failed to fetch data");
        }
        return res.json();
      })
      .then((data) => {
        setError(null);
        if (Array.isArray(data)) setOrders(data);
        else setOrders([]);
      })
      .catch((err) => {
        console.error(err);
        setError(err.message);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const handleAction = async (id: string, action: string) => {
    const actionLabel = action === "verify" ? "VERIFY" : action === "reject" ? "REJECT" : "DELIVER";
    if (!confirm(`Are you sure you want to ${actionLabel} this order?`)) return;

    try {
      const res = await apiFetch(`/api/admin/orders/${id}/${action}`, { method: "POST" });
      if (res.ok) {
        setActionMsg({ type: "success", text: `Order successfully updated (${actionLabel}).` });
        fetchOrders();
      } else {
        const err = await res.json();
        setActionMsg({ type: "error", text: `Failed to ${action}: ${err.error}` });
      }
    } catch (e: any) {
      setActionMsg({ type: "error", text: e.message || "Network error" });
    }
  };

  // Resend Telegram Notification (Section 12)
  const handleResendTelegram = async (id: string) => {
    setRetryingTgId(id);
    setActionMsg(null);
    try {
      const res = await apiFetch(`/api/orders/${id}/telegram-notify`, { method: "POST" });
      const data = await res.json();
      if (res.ok && data.success) {
        setActionMsg({
          type: "success",
          text: `Telegram notification resent for Order #${id} (Msg ID: ${data.messageId || "N/A"})`,
        });
        fetchOrders();
      } else {
        setActionMsg({
          type: "error",
          text: data.error || "Failed to resend Telegram notification.",
        });
      }
    } catch (e: any) {
      setActionMsg({ type: "error", text: e.message || "Network error" });
    } finally {
      setRetryingTgId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "VERIFIED":
      case "PAID":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            {status}
          </span>
        );
      case "WAITING_FOR_VERIFICATION":
      case "PENDING":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            {status}
          </span>
        );
      case "DELIVERED":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
            {status}
          </span>
        );
      case "REJECTED":
      case "CANCELLED":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
            {status}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
            {status}
          </span>
        );
    }
  };

  return (
    <DashboardLayout>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Orders</h1>
          <p className="text-sm text-gray-500">
            Review customer payments, inspect payment proofs, and verify orders.
          </p>
        </div>
        <button
          onClick={fetchOrders}
          disabled={loading}
          className="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded shadow-sm hover:bg-gray-50 flex items-center"
        >
          <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {actionMsg && (
        <div
          className={`mb-4 p-3 rounded text-sm ${
            actionMsg.type === "success"
              ? "bg-green-50 text-green-800 border border-green-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          {actionMsg.text}
        </div>
      )}

      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        {error ? (
          <div className="p-6 text-center text-red-500 bg-red-50 border border-red-200 rounded-md m-4">
            {error}
          </div>
        ) : loading && orders.length === 0 ? (
          <div className="p-6 text-center text-gray-500">Loading orders...</div>
        ) : orders.length === 0 ? (
          <div className="p-6 text-center text-gray-500">No orders found.</div>
        ) : (
          <ul className="divide-y divide-gray-200">
            {orders.map((order) => (
              <li key={order.id} className="px-6 py-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-blue-600">
                        Order #{order.id} — {order.productNameSnapshot}
                      </h3>
                      <div className="flex space-x-1.5">
                        {getStatusBadge(order.paymentStatus)}
                        {getStatusBadge(order.orderStatus)}
                      </div>

                      {/* Telegram Notification Tracking Badge */}
                      {order.telegramNotificationSentAt ? (
                        <span
                          title={`Telegram alert sent at ${order.telegramNotificationSentAt}`}
                          className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200"
                        >
                          <Bell className="w-3 h-3 mr-1 text-blue-500" /> Telegram Notified
                        </span>
                      ) : order.telegramNotificationStatus === "FAILED" ? (
                        <span
                          title={order.telegramNotificationError || "Notification delivery failed"}
                          className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-red-50 text-red-700 border border-red-200"
                        >
                          <Bell className="w-3 h-3 mr-1 text-red-500" /> Telegram Failed
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-2 sm:flex sm:justify-between text-sm text-gray-500">
                      <div className="sm:flex items-center space-x-4">
                        <p className="font-medium text-gray-800">
                          {Number(order.amount).toLocaleString()} {order.currency} via{" "}
                          <span className="text-blue-600">{order.paymentMethod}</span>
                        </p>
                        <p className="text-xs text-gray-500">
                          Customer: <span className="font-mono text-gray-700">{order.customerId}</span>
                        </p>
                      </div>
                      <div className="mt-1 sm:mt-0 text-xs text-gray-400">
                        Created: {new Date(order.createdAt).toLocaleString()}
                      </div>
                    </div>

                    {/* Payment Proof Attachments */}
                    {Array.isArray(order.paymentProofUrls) && order.paymentProofUrls.length > 0 && (
                      <div className="mt-2.5 flex items-center space-x-2 text-xs">
                        <span className="font-medium text-gray-600">Payment Proof:</span>
                        {order.paymentProofUrls.map((url: string, idx: number) => (
                          <a
                            key={idx}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center text-blue-600 hover:underline bg-blue-50 px-2 py-0.5 rounded"
                          >
                            <ExternalLink className="w-3 h-3 mr-1" />
                            Proof #{idx + 1}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center space-x-2">
                    {/* Retry Telegram Notification for WAITING_FOR_VERIFICATION */}
                    {order.paymentStatus === "WAITING_FOR_VERIFICATION" && (
                      <button
                        onClick={() => handleResendTelegram(order.id)}
                        disabled={retryingTgId === order.id}
                        title="Resend Telegram Notification to Admin"
                        className="px-2.5 py-1 text-xs text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded flex items-center font-medium disabled:opacity-50"
                      >
                        <Bell
                          className={`w-3.5 h-3.5 mr-1 ${retryingTgId === order.id ? "animate-spin" : ""}`}
                        />
                        {retryingTgId === order.id ? "Sending..." : "Resend Alert"}
                      </button>
                    )}

                    {order.paymentStatus === "WAITING_FOR_VERIFICATION" ||
                    order.paymentStatus === "PENDING" ||
                    order.paymentStatus === "NOT_STARTED" ? (
                      <>
                        <button
                          onClick={() => handleAction(order.id, "verify")}
                          title="Verify Payment (Sets order to PAID)"
                          className="px-3 py-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 hover:bg-green-100 rounded flex items-center"
                        >
                          <CheckCircle className="h-3.5 w-3.5 mr-1" />
                          Verify
                        </button>
                        <button
                          onClick={() => handleAction(order.id, "reject")}
                          title="Reject Payment"
                          className="px-3 py-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 hover:bg-red-100 rounded flex items-center"
                        >
                          <XCircle className="h-3.5 w-3.5 mr-1" />
                          Reject
                        </button>
                      </>
                    ) : null}

                    {order.paymentStatus === "VERIFIED" && order.orderStatus !== "DELIVERED" ? (
                      <button
                        onClick={() => handleAction(order.id, "deliver")}
                        title="Mark Delivered"
                        className="px-3 py-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded flex items-center"
                      >
                        <Truck className="h-3.5 w-3.5 mr-1" />
                        Deliver
                      </button>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </DashboardLayout>
  );
}
