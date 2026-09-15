import React, { useEffect, useState } from "react";
import DashboardLayout from "../components/DashboardLayout";
import ErrorBoundary from "../components/ErrorBoundary";
import { 
  Plus, 
  Edit, 
  Trash2, 
  CheckCircle2, 
  XCircle, 
  X, 
  CreditCard, 
  AlertCircle,
  Loader2,
  Info
} from "lucide-react";
import { apiFetch } from "../lib/api";

type PaymentType = "BaridiMob" | "CCP" | "RedotPay" | "flexy";

interface PaymentMethodForm {
  name: string;
  type: PaymentType;
  currency: string;
  accountName: string;
  accountNumber: string;
  instructions: string;
  active: boolean;
}

export default function PaymentMethods() {
  const [methods, setMethods] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  
  const [isEditing, setIsEditing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [currentMethod, setCurrentMethod] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [methodToDelete, setMethodToDelete] = useState<{ id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const defaultMethod: PaymentMethodForm = {
    name: "",
    type: "BaridiMob",
    currency: "DZD",
    accountName: "",
    accountNumber: "",
    instructions: "",
    active: true,
  };

  const [formData, setFormData] = useState<PaymentMethodForm>(defaultMethod);

  const fetchMethods = async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/admin/payment-methods");
      if (!res.ok) {
        if (res.status === 401) {
          window.location.href = "/login";
          return;
        }
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Failed to fetch payment methods (HTTP ${res.status})`);
      }
      const data = await res.json();
      setError(null);
      setMethods(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error("Error fetching payment methods:", err);
      setError(err.message || "Could not load payment methods.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMethods();
  }, []);

  const inferType = (method: any): PaymentType => {
    if (method.type && ["BaridiMob", "CCP", "RedotPay", "flexy"].includes(method.type)) {
      return method.type as PaymentType;
    }
    const nameLower = (method.name || "").toLowerCase();
    if (nameLower.includes("redot") || nameLower.includes("binance") || method.currency === "USDT") {
      return "RedotPay";
    }
    if (nameLower.includes("baridi")) {
      return "BaridiMob";
    }
    return "CCP";
  };

  const handleOpenNew = () => {
    setFormData(defaultMethod);
    setModalError(null);
    setIsEditing(false);
    setCurrentMethod(null);
    setShowModal(true);
  };

  const handleOpenEdit = (method: any) => {
    const inferredType = inferType(method);
    const correctCurrency = inferredType === "RedotPay" ? "USDT" : "DZD";

    setFormData({
      name: method.name || "",
      type: inferredType,
      currency: correctCurrency,
      accountName: method.accountName || "",
      accountNumber: method.accountNumber || "",
      instructions: method.instructions || "",
      active: method.active !== undefined ? Boolean(method.active) : true,
    });
    setModalError(null);
    setIsEditing(true);
    setCurrentMethod(method);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setIsEditing(false);
    setCurrentMethod(null);
    setModalError(null);
    setFormData(defaultMethod);
  };

  const handleTypeChange = (newType: PaymentType) => {
    const newCurrency = newType === "RedotPay" ? "USDT" : "DZD";
    setFormData(prev => ({
      ...prev,
      type: newType,
      currency: newCurrency,
      // Auto-suggest name if empty
      name: prev.name.trim() === "" ? (
        newType === "BaridiMob" ? "BaridiMob" : newType === "flexy" ? "Flexy" :
        newType === "CCP" ? "CCP (Algérie Poste)" :
        "RedotPay (USDT)"
      ) : prev.name
    }));
  };

  const handleToggleActive = async (method: any) => {
    try {
      const newActive = !method.active;
      // Optimistic update
      setMethods(prev => prev.map(m => m.id === method.id ? { ...m, active: newActive } : m));
      
      const res = await apiFetch(`/api/admin/payment-methods/${method.id}/toggle-active`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: newActive }),
      });

      if (!res.ok) {
        // Fallback to standard PUT if PATCH toggle-active not recognized
        const fallbackRes = await apiFetch(`/api/admin/payment-methods/${method.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active: newActive }),
        });
        if (!fallbackRes.ok) {
          throw new Error("Failed to update status");
        }
      }
      
      setActionSuccess(`Payment Method "${method.name}" is now ${newActive ? "Active" : "Inactive"}`);
      setTimeout(() => setActionSuccess(null), 3000);
      fetchMethods();
    } catch (e: any) {
      console.error(e);
      setError("Failed to toggle payment method status.");
      fetchMethods();
    }
  };

  const handleDelete = (id: string, name: string, immediate = false) => {
    setError(null);
    if (immediate) {
      executeDeleteMethod(id, name);
    } else {
      setMethodToDelete({ id, name });
    }
  };

  const executeDeleteMethod = async (id: string, name: string) => {
    if (!id) return;
    setIsDeleting(true);
    setError(null);
    try {
      let res = await apiFetch(`/api/payment-methods/${id}`, { method: "DELETE" });
      if (!res.ok && res.status === 404) {
        // Fallback to /api/admin/payment-methods/:id
        res = await apiFetch(`/api/admin/payment-methods/${id}`, { method: "DELETE" });
      }

      if (res.ok) {
        setMethods(prev => prev.filter(m => m.id !== id));
        setActionSuccess(`Payment method "${name}" deleted successfully.`);
        setTimeout(() => setActionSuccess(null), 3000);
        setMethodToDelete(null);
        await fetchMethods();
      } else {
        const errData = await res.json().catch(() => ({}));
        setError(`Failed to delete payment method: ${errData.error || "Server rejected request"}`);
        setMethodToDelete(null);
      }
    } catch (e: any) {
      console.error("Error deleting payment method:", e);
      setError("Network error. Could not delete payment method.");
      setMethodToDelete(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    if (!formData.name.trim()) {
      setModalError("Method Name is required.");
      return;
    }

    if (!formData.accountName.trim() || !formData.accountNumber.trim()) {
      setModalError("Account Name and Account Number / RIB / ID are required so customers know where to pay.");
      return;
    }

    // Enforce strict currency rules
    const expectedCurrency = formData.type === "RedotPay" ? "USDT" : "DZD";
    if (formData.currency !== expectedCurrency) {
      setModalError(`Currency for ${formData.type} must be ${expectedCurrency}.`);
      return;
    }

    setIsSaving(true);
    try {
      const url = isEditing && currentMethod ? `/api/admin/payment-methods/${currentMethod.id}` : "/api/admin/payment-methods";
      const method = isEditing ? "PUT" : "POST";
      
      const payload = {
        name: formData.name.trim(),
        type: formData.type,
        currency: expectedCurrency,
        accountName: formData.accountName.trim(),
        accountNumber: formData.accountNumber.trim(),
        instructions: formData.instructions.trim(),
        active: Boolean(formData.active),
      };

      const res = await apiFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setShowModal(false);
        setActionSuccess(isEditing ? "Payment method updated successfully!" : "Payment method created successfully!");
        setTimeout(() => setActionSuccess(null), 3000);
        fetchMethods();
      } else {
        const errorData = await res.json().catch(() => ({}));
        setModalError(errorData.error || "Failed to save payment method. Please check your inputs.");
      }
    } catch (error: any) {
      console.error("Save error:", error);
      setModalError("Network error. Could not save payment method.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ErrorBoundary fallbackTitle="Payment Methods Management Error">
      <DashboardLayout>
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Payment Methods</h1>
            <p className="text-sm text-gray-500 mt-1">
              Configure payment instructions for BaridiMob (DZD), CCP (DZD), and RedotPay (USDT)
            </p>
          </div>
          <button 
            id="add-payment-method-btn"
            onClick={handleOpenNew}
            className="inline-flex items-center space-x-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg hover:bg-blue-700 shadow-sm transition-colors text-sm font-medium"
          >
            <Plus className="h-4 w-4" />
            <span>Add Payment Method</span>
          </button>
        </div>

        {/* Global Notifications */}
        {actionSuccess && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-800 rounded-lg flex items-center space-x-2 text-sm animate-fade-in">
            <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
            <span>{actionSuccess}</span>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-800 rounded-lg flex items-center space-x-2 text-sm">
            <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Methods Table / List */}
        <div className="bg-white shadow-sm border border-gray-200 rounded-xl overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-gray-500 flex flex-col items-center justify-center space-y-3">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              <span>Loading payment methods...</span>
            </div>
          ) : methods.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3 text-gray-400">
                <CreditCard className="w-6 h-6" />
              </div>
              <p className="font-medium text-gray-900">No payment methods configured</p>
              <p className="text-sm text-gray-500 mt-1">
                Add BaridiMob, CCP, or RedotPay so customers receive exact payment details.
              </p>
              <button
                onClick={handleOpenNew}
                className="mt-4 inline-flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
              >
                <Plus className="w-4 h-4" />
                <span>Create Method</span>
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <tr>
                    <th scope="col" className="px-6 py-3.5 text-left">Method & Type</th>
                    <th scope="col" className="px-6 py-3.5 text-left">Account Details</th>
                    <th scope="col" className="px-6 py-3.5 text-left">Currency</th>
                    <th scope="col" className="px-6 py-3.5 text-left">Status</th>
                    <th scope="col" className="px-6 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200 text-sm">
                  {methods.map((method) => {
                    const inferredType = inferType(method);
                    const isCrypto = method.currency === "USDT" || inferredType === "RedotPay";

                    return (
                      <tr key={method.id} className="hover:bg-gray-50 transition-colors">
                        {/* Name & Type */}
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center space-x-3">
                            <div className={`h-10 w-10 rounded-lg flex items-center justify-center font-bold text-xs ${
                              inferredType === "BaridiMob" 
                                ? "bg-amber-100 text-amber-800" 
                                : inferredType === "RedotPay"
                                ? "bg-purple-100 text-purple-800"
                                : "bg-blue-100 text-blue-800"
                            }`}>
                              {inferredType === "BaridiMob" ? "BM" : inferredType === "RedotPay" ? "RP" : inferredType === "flexy" ? "FL" : "CCP"}
                            </div>
                            <div>
                              <span className="font-semibold text-gray-900 block">
                                {method.name}
                              </span>
                              <span className="inline-block mt-0.5 text-xs text-gray-500">
                                Type: {inferredType}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Account Details */}
                        <td className="px-6 py-4">
                          <div className="text-sm">
                            <span className="font-medium text-gray-900 block truncate max-w-xs">
                              {method.accountName || "—"}
                            </span>
                            <span className="text-xs text-gray-500 font-mono block truncate max-w-xs">
                              {method.accountNumber || "—"}
                            </span>
                          </div>
                        </td>

                        {/* Currency */}
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            isCrypto 
                              ? "bg-emerald-100 text-emerald-800 border border-emerald-200" 
                              : "bg-blue-100 text-blue-800 border border-blue-200"
                          }`}>
                            {method.currency || (isCrypto ? "USDT" : "DZD")}
                          </span>
                        </td>

                        {/* Status Toggle */}
                        <td className="px-6 py-4 whitespace-nowrap">
                          <button
                            id={`toggle-method-${method.id}`}
                            onClick={() => handleToggleActive(method)}
                            title="Click to toggle active status"
                            className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                              method.active 
                                ? "bg-green-100 text-green-800 hover:bg-green-200" 
                                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                            }`}
                          >
                            {method.active ? (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-green-600" />
                                Active
                              </>
                            ) : (
                              <>
                                <XCircle className="w-3.5 h-3.5 mr-1 text-gray-500" />
                                Inactive
                              </>
                            )}
                          </button>
                        </td>

                        {/* Actions */}
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex items-center justify-end space-x-2">
                            <button 
                              id={`edit-method-${method.id}`}
                              onClick={() => handleOpenEdit(method)} 
                              className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                              title="Edit Payment Method"
                            >
                              <Edit className="h-4 w-4" />
                            </button>
                            <button 
                              id={`delete-method-${method.id}`}
                              data-method-id={method.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(method.id, method.name, e.shiftKey);
                              }} 
                              className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                              title="Delete Payment Method"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal for Add / Edit Payment Method */}
        {showModal && (
          <div 
            className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-50 flex items-center justify-center p-4 sm:p-6"
            aria-labelledby="method-modal-title" 
            role="dialog" 
            aria-modal="true"
          >
            <div 
              className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden animate-fade-in"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
                <div>
                  <h3 className="text-lg font-bold text-gray-900" id="method-modal-title">
                    {isEditing ? `Edit Method: ${currentMethod?.name || ""}` : "Create Payment Method"}
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Account details shared automatically with customers during checkout
                  </p>
                </div>
                <button 
                  onClick={handleCloseModal}
                  className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Form */}
              <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-4">
                {modalError && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm flex items-center space-x-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{modalError}</span>
                  </div>
                )}

                {/* Method Name */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Display Name *
                  </label>
                  <input 
                    id="form-method-name"
                    type="text" 
                    required 
                    value={formData.name} 
                    onChange={e => setFormData({ ...formData, name: e.target.value })} 
                    className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500" 
                    placeholder="e.g. BaridiMob or CCP (Algérie Poste)"
                  />
                </div>

                {/* Type & Currency Selection */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Payment Type *
                    </label>
                    <select 
                      id="form-method-type"
                      required 
                      value={formData.type} 
                      onChange={e => handleTypeChange(e.target.value as PaymentType)} 
                      className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      <option value="BaridiMob">BaridiMob (DZD)</option>
                      <option value="CCP">CCP Algérie (DZD)</option>
                      <option value="flexy">Flexy (DZD)</option>
                      <option value="RedotPay">RedotPay (USDT)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Currency (Fixed)
                    </label>
                    <div className="relative">
                      <input 
                        type="text" 
                        disabled 
                        value={formData.currency} 
                        className="w-full border border-gray-200 rounded-lg p-2.5 text-sm bg-gray-100 font-semibold text-gray-700 cursor-not-allowed" 
                      />
                      <span className="absolute right-3 top-2.5 text-xs text-gray-400">
                        {formData.type === "RedotPay" ? "Crypto" : "Dinar"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Info Note */}
                <div className="p-2.5 bg-blue-50 rounded-lg border border-blue-100 flex items-start space-x-2 text-xs text-blue-800">
                  <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>
                    {formData.type === "RedotPay" 
                      ? "RedotPay accepts USDT exclusively. Never convert DZD to USDT." 
                      : `${formData.type} accepts Algerian Dinars (DZD) exclusively.`}
                  </span>
                </div>

                {/* Account Name */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Account Holder Name (Titulaire) *
                  </label>
                  <input 
                    id="form-method-account-name"
                    type="text" 
                    required 
                    value={formData.accountName} 
                    onChange={e => setFormData({ ...formData, accountName: e.target.value })} 
                    className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500" 
                    placeholder="e.g. BENALI AHMED"
                  />
                </div>

                {/* Account Number / RIP / ID */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Account Number / RIP / RedotPay ID *
                  </label>
                  <input 
                    id="form-method-account-number"
                    type="text" 
                    required 
                    value={formData.accountNumber} 
                    onChange={e => setFormData({ ...formData, accountNumber: e.target.value })} 
                    className="w-full border border-gray-300 rounded-lg p-2.5 text-sm font-mono focus:ring-2 focus:ring-blue-500" 
                    placeholder="e.g. 00799999000123456789 or RedotPay Account ID"
                  />
                </div>

                {/* Instructions */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Payment Instructions for Customer
                  </label>
                  <textarea 
                    id="form-method-instructions"
                    rows={3} 
                    value={formData.instructions} 
                    onChange={e => setFormData({ ...formData, instructions: e.target.value })} 
                    className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500" 
                    placeholder="e.g. Send transfer to the RIP above. Screenshot receipt with transaction ID and send it in this chat."
                  />
                </div>

                {/* Active Checkbox */}
                <div className="flex items-center space-x-2 pt-2">
                  <input 
                    id="form-method-active"
                    type="checkbox" 
                    checked={formData.active} 
                    onChange={e => setFormData({ ...formData, active: e.target.checked })} 
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded" 
                  />
                  <label htmlFor="form-method-active" className="text-sm font-medium text-gray-900 cursor-pointer">
                    Active (Offered to customers during checkout)
                  </label>
                </div>

                {/* Footer */}
                <div className="pt-4 border-t border-gray-200 flex items-center justify-end space-x-3">
                  <button 
                    id="cancel-payment-method-btn"
                    type="button" 
                    onClick={handleCloseModal} 
                    className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    id="save-payment-method-btn"
                    type="submit" 
                    disabled={isSaving}
                    className="inline-flex items-center space-x-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <span>{isEditing ? "Update Method" : "Create Method"}</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
        {/* Modal for Confirm Delete Payment Method */}
        {methodToDelete && (
          <div 
            id="delete-method-modal"
            className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-50 flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-method-modal-title"
          >
            <div 
              className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4 animate-fade-in"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center space-x-3 text-red-600">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                  <Trash2 className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900" id="delete-method-modal-title">
                    Delete Payment Method
                  </h3>
                  <p className="text-xs text-gray-500">
                    This action cannot be undone
                  </p>
                </div>
              </div>

              <p className="text-sm text-gray-600 leading-relaxed">
                Are you sure you want to delete <span className="font-semibold text-gray-900">"{methodToDelete.name}"</span>? Customers will no longer be able to submit payments using this method.
              </p>

              <div className="pt-2 flex items-center justify-end space-x-3">
                <button
                  id="cancel-delete-method-btn"
                  type="button"
                  disabled={isDeleting}
                  onClick={() => setMethodToDelete(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  id="confirm-delete-method-btn"
                  data-method-id={methodToDelete.id}
                  type="button"
                  disabled={isDeleting}
                  onClick={() => executeDeleteMethod(methodToDelete.id, methodToDelete.name)}
                  className="inline-flex items-center space-x-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Deleting...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      <span>Delete Payment Method</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </DashboardLayout>
    </ErrorBoundary>
  );
}
