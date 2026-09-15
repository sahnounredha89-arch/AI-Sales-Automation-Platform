import DashboardLayout from "../components/DashboardLayout";
import React, { useState, useEffect } from "react";
import { Brain, Save, CheckCircle2 } from "lucide-react";
import { apiFetch } from "../lib/api";

export default function AiInstructions() {
  const [instructions, setInstructions] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    fetchInstructions();
  }, []);

  const fetchInstructions = async () => {
    try {
      const res = await apiFetch("/admin/settings/ai");
      const data = await res.json();
      if (data.customInstructions) {
        setInstructions(data.customInstructions);
      }
    } catch (error) {
      console.error("Error fetching AI instructions:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      await apiFetch("/admin/settings/ai", {
        method: "PUT",
        body: JSON.stringify({ customInstructions: instructions })
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error("Error saving AI instructions:", error);
      alert("Failed to save instructions.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center space-x-3 mb-6">
        <div className="p-3 bg-purple-100 rounded-lg">
          <Brain className="w-6 h-6 text-purple-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Instructions to AI</h1>
          <p className="text-gray-500 text-sm mt-1">
            Teach your AI Sales Agent how to reply to clients. These rules will be memorized and followed in every conversation.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6">
          <label htmlFor="ai-instructions" className="block text-sm font-medium text-gray-700 mb-2">
            Custom System Instructions
          </label>
          <p className="text-sm text-gray-500 mb-4">
            Write naturally. For example: "Always start with a friendly greeting", "If a customer asks about delivery, tell them it takes 24 hours", or "Always use emojis".
          </p>
          <textarea
            id="ai-instructions"
            rows={12}
            className="w-full border border-gray-300 rounded-lg p-4 text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 shadow-sm transition-all"
            placeholder="E.g., Speak politely in Algerian Darija. Always confirm the product price..."
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
          ></textarea>
        </div>
        <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex justify-end items-center space-x-4">
          {saveSuccess && (
            <span className="flex items-center text-green-600 text-sm font-medium">
              <CheckCircle2 className="w-4 h-4 mr-1" />
              Saved successfully
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            {isSaving ? (
              <span className="flex items-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Saving...
              </span>
            ) : (
              <span className="flex items-center">
                <Save className="w-4 h-4 mr-2" />
                Save Instructions
              </span>
            )}
          </button>
        </div>
      </div>
          </div>
    </DashboardLayout>
  );
}