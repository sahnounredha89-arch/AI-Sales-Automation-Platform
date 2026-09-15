import React, { useEffect, useState } from "react";
import DashboardLayout from "../components/DashboardLayout";
import ErrorBoundary from "../components/ErrorBoundary";
import { 
  Plus, 
  Edit, 
  Trash2, 
  Image as ImageIcon, 
  CheckCircle2, 
  XCircle, 
  X, 
  Upload, 
  HelpCircle, 
  ListChecks, 
  AlertCircle,
  Loader2
} from "lucide-react";
import { apiFetch } from "../lib/api";

interface ProductForm {
  name: string;
  shortDescription: string;
  fullDescription: string;
  priceDZD: number;
  priceUSDT: number;
  duration: string;
  deliveryInfo: string;
  aiSalesInstructions: string;
  imageUrl: string;
  active: boolean;
  features: string[];
  faq: Array<{ question: string; answer: string }>;
}

export default function Products() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  
  const [isEditing, setIsEditing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [currentProduct, setCurrentProduct] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [newFeatureInput, setNewFeatureInput] = useState("");
  const [productToDelete, setProductToDelete] = useState<{ id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const defaultProduct: ProductForm = {
    name: "",
    shortDescription: "",
    fullDescription: "",
    priceDZD: 0,
    priceUSDT: 0,
    duration: "",
    deliveryInfo: "",
    aiSalesInstructions: "",
    imageUrl: "",
    active: true,
    features: [],
    faq: [],
  };

  const [formData, setFormData] = useState<ProductForm>(defaultProduct);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/admin/products");
      if (!res.ok) {
        if (res.status === 401) {
          window.location.href = "/login";
          return;
        }
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Failed to fetch products (HTTP ${res.status})`);
      }
      const data = await res.json();
      setError(null);
      setProducts(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error("Error fetching products:", err);
      setError(err.message || "Could not load products.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleOpenNew = () => {
    setFormData(defaultProduct);
    setNewFeatureInput("");
    setModalError(null);
    setIsEditing(false);
    setCurrentProduct(null);
    setShowModal(true);
  };

  const handleOpenEdit = (product: any) => {
    setFormData({
      name: product.name || "",
      shortDescription: product.shortDescription || "",
      fullDescription: product.fullDescription || "",
      priceDZD: Number(product.priceDZD) || 0,
      priceUSDT: Number(product.priceUSDT) || 0,
      duration: product.duration || "",
      deliveryInfo: product.deliveryInfo || "",
      aiSalesInstructions: product.aiSalesInstructions || "",
      imageUrl: product.imageUrl || "",
      active: product.active !== undefined ? Boolean(product.active) : true,
      features: Array.isArray(product.features) ? [...product.features] : [],
      faq: Array.isArray(product.faq) ? product.faq.map((item: any) => ({
        question: item?.question || "",
        answer: item?.answer || ""
      })) : [],
    });
    setNewFeatureInput("");
    setModalError(null);
    setIsEditing(true);
    setCurrentProduct(product);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setIsEditing(false);
    setCurrentProduct(null);
    setModalError(null);
    setFormData(defaultProduct);
  };

  const handleToggleActive = async (product: any) => {
    try {
      const newActive = !product.active;
      // Optimistic update
      setProducts(prev => prev.map(p => p.id === product.id ? { ...p, active: newActive } : p));
      
      const res = await apiFetch(`/api/admin/products/${product.id}/toggle-active`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: newActive }),
      });

      if (!res.ok) {
        // Fallback to standard PUT if PATCH toggle-active not recognized
        const fallbackRes = await apiFetch(`/api/admin/products/${product.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active: newActive }),
        });
        if (!fallbackRes.ok) {
          throw new Error("Failed to update status");
        }
      }
      
      setActionSuccess(`Product "${product.name}" is now ${newActive ? "Active" : "Inactive"}`);
      setTimeout(() => setActionSuccess(null), 3000);
      fetchProducts();
    } catch (e: any) {
      console.error(e);
      setError("Failed to toggle product status.");
      fetchProducts();
    }
  };

  const handleDelete = (id: string, name: string, immediate = false) => {
    setError(null);
    if (immediate) {
      executeDeleteProduct(id, name);
    } else {
      setProductToDelete({ id, name });
    }
  };

  const executeDeleteProduct = async (id: string, name: string) => {
    if (!id) return;
    setIsDeleting(true);
    setError(null);
    try {
      let res = await apiFetch(`/api/products/${id}`, { method: "DELETE" });
      if (!res.ok && res.status === 404) {
        // Fallback to /api/admin/products/:id
        res = await apiFetch(`/api/admin/products/${id}`, { method: "DELETE" });
      }

      if (res.ok) {
        // Optimistic UI state update
        setProducts(prev => prev.filter(p => p.id !== id));
        setActionSuccess(`Product "${name}" deleted successfully.`);
        setTimeout(() => setActionSuccess(null), 3000);
        setProductToDelete(null);
        await fetchProducts();
      } else {
        const errData = await res.json().catch(() => ({}));
        setError(`Failed to delete product: ${errData.error || "Server rejected request"}`);
        setProductToDelete(null);
      }
    } catch (e: any) {
      console.error("Error deleting product:", e);
      setError("Network error. Could not delete product.");
      setProductToDelete(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    if (!formData.name.trim()) {
      setModalError("Product Name is required.");
      return;
    }

    if (formData.priceDZD < 0 || formData.priceUSDT < 0) {
      setModalError("Prices cannot be negative.");
      return;
    }

    setIsSaving(true);
    try {
      const url = isEditing && currentProduct ? `/api/admin/products/${currentProduct.id}` : "/api/admin/products";
      const method = isEditing ? "PUT" : "POST";
      
      const payload = {
        name: formData.name.trim(),
        shortDescription: formData.shortDescription.trim(),
        fullDescription: formData.fullDescription.trim(),
        priceDZD: Number(formData.priceDZD),
        priceUSDT: Number(formData.priceUSDT),
        duration: formData.duration.trim(),
        deliveryInfo: formData.deliveryInfo.trim(),
        aiSalesInstructions: formData.aiSalesInstructions.trim(),
        imageUrl: formData.imageUrl.trim(),
        active: Boolean(formData.active),
        features: formData.features.filter(f => f.trim().length > 0),
        faq: formData.faq.filter(item => item.question.trim().length > 0),
      };

      const res = await apiFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setShowModal(false);
        setActionSuccess(isEditing ? "Product updated successfully!" : "Product created successfully!");
        setTimeout(() => setActionSuccess(null), 3000);
        fetchProducts();
      } else {
        const errorData = await res.json().catch(() => ({}));
        setModalError(errorData.error || "Failed to save product. Please check your inputs.");
      }
    } catch (error: any) {
      console.error("Save error:", error);
      setModalError("Network error. Could not save product.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddFeature = () => {
    if (!newFeatureInput.trim()) return;
    setFormData(prev => ({
      ...prev,
      features: [...prev.features, newFeatureInput.trim()]
    }));
    setNewFeatureInput("");
  };

  const handleRemoveFeature = (index: number) => {
    setFormData(prev => ({
      ...prev,
      features: prev.features.filter((_, i) => i !== index)
    }));
  };

  const handleAddFaq = () => {
    setFormData(prev => ({
      ...prev,
      faq: [...prev.faq, { question: "", answer: "" }]
    }));
  };

  const handleUpdateFaq = (index: number, field: "question" | "answer", value: string) => {
    setFormData(prev => ({
      ...prev,
      faq: prev.faq.map((item, i) => i === index ? { ...item, [field]: value } : item)
    }));
  };

  const handleRemoveFaq = (index: number) => {
    setFormData(prev => ({
      ...prev,
      faq: prev.faq.filter((_, i) => i !== index)
    }));
  };

  const handleImageUpload = async (id: string, file: File) => {
    const data = new FormData();
    data.append("image", file);
    try {
      const res = await apiFetch(`/api/admin/products/${id}/image`, {
        method: "POST",
        body: data,
      });
      if (res.ok) {
        const result = await res.json();
        setActionSuccess("Product image uploaded successfully!");
        setTimeout(() => setActionSuccess(null), 3000);
        fetchProducts();
      } else {
        const errorData = await res.json().catch(() => ({}));
        alert(`Failed to upload image: ${errorData.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error(error);
      alert("Network error during image upload.");
    }
  };

  return (
    <ErrorBoundary fallbackTitle="Products Management Error">
      <DashboardLayout>
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Products Catalog</h1>
            <p className="text-sm text-gray-500 mt-1">
              Manage digital products, DZD/USDT pricing, features, FAQs, and Gemini sales instructions
            </p>
          </div>
          <button 
            id="add-product-btn"
            onClick={handleOpenNew}
            className="inline-flex items-center space-x-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg hover:bg-blue-700 shadow-sm transition-colors text-sm font-medium"
          >
            <Plus className="h-4 w-4" />
            <span>Add Product</span>
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

        {/* Products Table / List */}
        <div className="bg-white shadow-sm border border-gray-200 rounded-xl overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-gray-500 flex flex-col items-center justify-center space-y-3">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              <span>Loading products catalog...</span>
            </div>
          ) : products.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3 text-gray-400">
                <ListChecks className="w-6 h-6" />
              </div>
              <p className="font-medium text-gray-900">No products found</p>
              <p className="text-sm text-gray-500 mt-1">Add your first digital product to start selling.</p>
              <button
                onClick={handleOpenNew}
                className="mt-4 inline-flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
              >
                <Plus className="w-4 h-4" />
                <span>Create Product</span>
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <tr>
                    <th scope="col" className="px-6 py-3.5 text-left">Product</th>
                    <th scope="col" className="px-6 py-3.5 text-left">Pricing</th>
                    <th scope="col" className="px-6 py-3.5 text-left">Details</th>
                    <th scope="col" className="px-6 py-3.5 text-left">Status</th>
                    <th scope="col" className="px-6 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200 text-sm">
                  {products.map((product) => {
                    const featureCount = Array.isArray(product.features) ? product.features.length : 0;
                    const faqCount = Array.isArray(product.faq) ? product.faq.length : 0;

                    return (
                      <tr key={product.id} className="hover:bg-gray-50 transition-colors">
                        {/* Product Info */}
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center space-x-3.5">
                            <div className="h-12 w-12 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center overflow-hidden flex-shrink-0 relative group">
                              {product.imageUrl ? (
                                <img 
                                  src={product.imageUrl} 
                                  alt={product.name} 
                                  className="h-full w-full object-cover"
                                  onError={(e) => {
                                    (e.target as HTMLElement).style.display = "none";
                                  }} 
                                />
                              ) : (
                                <ImageIcon className="h-5 w-5 text-gray-400" />
                              )}
                              <label 
                                title="Change Image"
                                className="absolute inset-0 bg-black bg-opacity-40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                              >
                                <Upload className="w-4 h-4" />
                                <input 
                                  type="file" 
                                  className="hidden" 
                                  accept="image/*" 
                                  onChange={(e) => {
                                    if (e.target.files && e.target.files[0]) {
                                      handleImageUpload(product.id, e.target.files[0]);
                                    }
                                  }} 
                                />
                              </label>
                            </div>
                            <div className="max-w-xs truncate">
                              <span className="font-semibold text-gray-900 block truncate" title={product.name}>
                                {product.name}
                              </span>
                              <span className="text-xs text-gray-500 block truncate" title={product.shortDescription}>
                                {product.shortDescription || "No short description"}
                              </span>
                              {product.duration && (
                                <span className="inline-block mt-0.5 text-xs text-blue-600 font-medium">
                                  {product.duration}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Pricing */}
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="space-y-0.5">
                            <div className="font-medium text-gray-900">
                              {Number(product.priceDZD).toLocaleString()} DZD
                            </div>
                            <div className="text-xs text-emerald-600 font-medium">
                              ${Number(product.priceUSDT).toFixed(2)} USDT
                            </div>
                          </div>
                        </td>

                        {/* Details (Features & FAQs) */}
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center space-x-2">
                            <span 
                              title={`${featureCount} features configured`}
                              className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700"
                            >
                              <ListChecks className="w-3 h-3 mr-1 text-gray-500" />
                              {featureCount}
                            </span>
                            <span 
                              title={`${faqCount} FAQs configured`}
                              className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700"
                            >
                              <HelpCircle className="w-3 h-3 mr-1 text-gray-500" />
                              {faqCount}
                            </span>
                          </div>
                        </td>

                        {/* Status Toggle */}
                        <td className="px-6 py-4 whitespace-nowrap">
                          <button
                            id={`toggle-active-${product.id}`}
                            onClick={() => handleToggleActive(product)}
                            title="Click to toggle active status"
                            className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                              product.active 
                                ? "bg-green-100 text-green-800 hover:bg-green-200" 
                                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                            }`}
                          >
                            {product.active ? (
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
                              id={`edit-product-${product.id}`}
                              onClick={() => handleOpenEdit(product)} 
                              className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                              title="Edit Product"
                            >
                              <Edit className="h-4 w-4" />
                            </button>
                            <button 
                              id={`delete-product-${product.id}`}
                              data-product-id={product.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(product.id, product.name, e.shiftKey);
                              }} 
                              className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                              title="Delete Product"
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

        {/* Modal for Add / Edit Product */}
        {showModal && (
          <div 
            className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-50 flex items-center justify-center p-4 sm:p-6"
            aria-labelledby="product-modal-title" 
            role="dialog" 
            aria-modal="true"
          >
            <div 
              className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-fade-in"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
                <div>
                  <h3 className="text-lg font-bold text-gray-900" id="product-modal-title">
                    {isEditing ? `Edit Product: ${currentProduct?.name || ""}` : "Create New Product"}
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Configure catalog item attributes, DZD/USDT prices, and Gemini instructions
                  </p>
                </div>
                <button 
                  onClick={handleCloseModal}
                  className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body - Scrollable */}
              <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-6">
                {modalError && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm flex items-center space-x-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{modalError}</span>
                  </div>
                )}

                {/* Section: Basic Information */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-800 uppercase tracking-wide mb-3">
                    Basic Information
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Product Name *
                      </label>
                      <input 
                        id="form-product-name"
                        type="text" 
                        required 
                        value={formData.name} 
                        onChange={e => setFormData({ ...formData, name: e.target.value })} 
                        className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                        placeholder="e.g. Netflix 4K UHD (1 Screen)"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Duration / Validity
                      </label>
                      <input 
                        id="form-product-duration"
                        type="text" 
                        value={formData.duration} 
                        onChange={e => setFormData({ ...formData, duration: e.target.value })} 
                        className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                        placeholder="e.g. 30 Days (1 Month)" 
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Image URL
                      </label>
                      <input 
                        id="form-product-image-url"
                        type="text" 
                        value={formData.imageUrl} 
                        onChange={e => setFormData({ ...formData, imageUrl: e.target.value })} 
                        className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                        placeholder="https://example.com/image.png" 
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Short Description
                      </label>
                      <input 
                        id="form-product-short-desc"
                        type="text" 
                        value={formData.shortDescription} 
                        onChange={e => setFormData({ ...formData, shortDescription: e.target.value })} 
                        className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                        placeholder="Brief summary displayed on social chats and cards"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Full Description
                      </label>
                      <textarea 
                        id="form-product-full-desc"
                        rows={2} 
                        value={formData.fullDescription} 
                        onChange={e => setFormData({ ...formData, fullDescription: e.target.value })} 
                        className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                        placeholder="Detailed product terms, features, and platform compatibility..."
                      />
                    </div>
                  </div>
                </div>

                {/* Section: Pricing (DZD and USDT) */}
                <div className="pt-2 border-t border-gray-200">
                  <h4 className="text-sm font-semibold text-gray-800 uppercase tracking-wide mb-1">
                    Pricing & Currency
                  </h4>
                  <p className="text-xs text-gray-500 mb-3">
                    BaridiMob and CCP pay in DZD. RedotPay pays in USDT. Never converted.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Price in Algerian Dinars (DZD) *
                      </label>
                      <div className="relative">
                        <input 
                          id="form-product-price-dzd"
                          type="number" 
                          required 
                          min="0" 
                          step="1"
                          value={formData.priceDZD} 
                          onChange={e => setFormData({ ...formData, priceDZD: Number(e.target.value) })} 
                          className="w-full border border-gray-300 rounded-lg p-2.5 text-sm pr-12 focus:ring-2 focus:ring-blue-500" 
                        />
                        <span className="absolute right-3 top-2.5 text-xs text-gray-400 font-semibold">DZD</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Price in Crypto / USDT *
                      </label>
                      <div className="relative">
                        <input 
                          id="form-product-price-usdt"
                          type="number" 
                          required 
                          min="0" 
                          step="0.01" 
                          value={formData.priceUSDT} 
                          onChange={e => setFormData({ ...formData, priceUSDT: Number(e.target.value) })} 
                          className="w-full border border-gray-300 rounded-lg p-2.5 text-sm pr-14 focus:ring-2 focus:ring-blue-500" 
                        />
                        <span className="absolute right-3 top-2.5 text-xs text-emerald-600 font-semibold">USDT</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section: Features Array */}
                <div className="pt-2 border-t border-gray-200">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">
                      Features List ({formData.features.length})
                    </h4>
                  </div>
                  <p className="text-xs text-gray-500 mb-2">
                    Bullet points shared by the AI bot to describe the product.
                  </p>
                  
                  {/* Add Feature Input */}
                  <div className="flex space-x-2 mb-3">
                    <input
                      id="form-new-feature-input"
                      type="text"
                      value={newFeatureInput}
                      onChange={e => setNewFeatureInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddFeature();
                        }
                      }}
                      placeholder="e.g. Ultra HD 4K Quality with private PIN"
                      className="flex-1 border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={handleAddFeature}
                      className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors flex items-center space-x-1"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Add</span>
                    </button>
                  </div>

                  {/* Feature Tags / List */}
                  {formData.features.length > 0 ? (
                    <ul className="space-y-1.5 max-h-36 overflow-y-auto bg-gray-50 p-2.5 rounded-lg border border-gray-200">
                      {formData.features.map((feature, idx) => (
                        <li key={idx} className="flex items-center justify-between bg-white px-3 py-1.5 rounded border border-gray-200 text-sm">
                          <span className="text-gray-800 truncate pr-2">• {feature}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveFeature(idx)}
                            className="text-gray-400 hover:text-red-600 p-0.5 rounded transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-gray-400 italic">No features added yet.</p>
                  )}
                </div>

                {/* Section: Frequently Asked Questions (FAQ) */}
                <div className="pt-2 border-t border-gray-200">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">
                      FAQ ({formData.faq.length})
                    </h4>
                    <button
                      type="button"
                      onClick={handleAddFaq}
                      className="inline-flex items-center space-x-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Question</span>
                    </button>
                  </div>

                  {formData.faq.length > 0 ? (
                    <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
                      {formData.faq.map((item, idx) => (
                        <div key={idx} className="p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-2 relative">
                          <button
                            type="button"
                            onClick={() => handleRemoveFaq(idx)}
                            className="absolute right-2 top-2 text-gray-400 hover:text-red-600 transition-colors"
                            title="Remove FAQ item"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-0.5">
                              Question #{idx + 1}
                            </label>
                            <input
                              type="text"
                              value={item.question}
                              onChange={e => handleUpdateFaq(idx, "question", e.target.value)}
                              placeholder="e.g. Does it work on Smart TV?"
                              className="w-full border border-gray-300 rounded p-1.5 text-xs focus:ring-1 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-0.5">
                              Answer #{idx + 1}
                            </label>
                            <textarea
                              rows={2}
                              value={item.answer}
                              onChange={e => handleUpdateFaq(idx, "answer", e.target.value)}
                              placeholder="e.g. Yes, all smart TV apps and Android TV boxes are supported."
                              className="w-full border border-gray-300 rounded p-1.5 text-xs focus:ring-1 focus:ring-blue-500"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 italic">No FAQ items yet. Click &quot;Add Question&quot; to provide answers for the AI bot.</p>
                  )}
                </div>

                {/* Section: Delivery & AI Sales Instructions */}
                <div className="pt-2 border-t border-gray-200 space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Delivery Information
                    </label>
                    <input 
                      id="form-product-delivery-info"
                      type="text" 
                      value={formData.deliveryInfo} 
                      onChange={e => setFormData({ ...formData, deliveryInfo: e.target.value })} 
                      className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500" 
                      placeholder="e.g. Credentials delivered manually in chat within 15 minutes after verification"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      AI Sales Instructions (Gemini Guidance)
                    </label>
                    <textarea 
                      id="form-product-ai-instructions"
                      rows={2} 
                      value={formData.aiSalesInstructions} 
                      onChange={e => setFormData({ ...formData, aiSalesInstructions: e.target.value })} 
                      className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500" 
                      placeholder="Special rules for the AI (e.g., mention warranty, ask customer what device they use)..."
                    />
                  </div>

                  <div className="flex items-center space-x-2 pt-1">
                    <input 
                      id="form-product-active"
                      type="checkbox" 
                      checked={formData.active} 
                      onChange={e => setFormData({ ...formData, active: e.target.checked })} 
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded" 
                    />
                    <label htmlFor="form-product-active" className="text-sm font-medium text-gray-900 cursor-pointer">
                      Active (available in sales catalog and conversational bot)
                    </label>
                  </div>
                </div>

                {/* Modal Footer */}
                <div className="pt-4 border-t border-gray-200 flex items-center justify-end space-x-3">
                  <button 
                    id="cancel-product-btn"
                    type="button" 
                    onClick={handleCloseModal} 
                    className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    id="save-product-btn"
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
                      <span>{isEditing ? "Update Product" : "Create Product"}</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
        {/* Modal for Confirm Delete Product */}
        {productToDelete && (
          <div 
            id="delete-product-modal"
            className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-50 flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-product-modal-title"
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
                  <h3 className="text-lg font-bold text-gray-900" id="delete-product-modal-title">
                    Delete Product
                  </h3>
                  <p className="text-xs text-gray-500">
                    This action cannot be undone
                  </p>
                </div>
              </div>

              <p className="text-sm text-gray-600 leading-relaxed">
                Are you sure you want to delete <span className="font-semibold text-gray-900">"{productToDelete.name}"</span>? Customers and sales assistants will no longer see this product.
              </p>

              <div className="pt-2 flex items-center justify-end space-x-3">
                <button
                  id="cancel-delete-product-btn"
                  type="button"
                  disabled={isDeleting}
                  onClick={() => setProductToDelete(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  id="confirm-delete-product-btn"
                  data-product-id={productToDelete.id}
                  type="button"
                  disabled={isDeleting}
                  onClick={() => executeDeleteProduct(productToDelete.id, productToDelete.name)}
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
                      <span>Delete Product</span>
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
