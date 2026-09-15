import React, { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { MessageSquare, Clock, Fingerprint, Database, CheckCircle2 } from "lucide-react";

export default function LastMetaMessageDiagnostic() {
  const [lastMsg, setLastMsg] = useState<any>(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, "diagnostics", "lastMetaMessage"), (docSnap) => {
      if (docSnap.exists()) {
        setLastMsg(docSnap.data());
      }
    });
    return () => unsubscribe();
  }, []);

  if (!lastMsg) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Last Meta Message Received</h3>
        <p className="text-gray-500 text-sm">Waiting for incoming messages...</p>
      </div>
    );
  }

  const maskString = (str: string) => {
    if (!str) return "N/A";
    if (str.length <= 6) return str.replace(/./g, '*');
    return str.substring(0, 3) + '*'.repeat(str.length - 6) + str.substring(str.length - 3);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
        <div className="flex items-center gap-2 text-indigo-700">
          <MessageSquare className="w-5 h-5" />
          <h3 className="font-semibold">Last Meta Message Diagnostic</h3>
        </div>
      </div>
      
      <div className="p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-gray-500 uppercase font-semibold flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Received At</span>
            <span className="text-sm font-medium text-gray-900">{new Date(lastMsg.timestamp).toLocaleString()}</span>
          </div>
          
          <div className="flex flex-col gap-1">
            <span className="text-xs text-gray-500 uppercase font-semibold flex items-center gap-1"><Fingerprint className="w-3.5 h-3.5" /> Message ID</span>
            <span className="text-sm font-medium text-gray-900 font-mono">{maskString(lastMsg.messageId)}</span>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs text-gray-500 uppercase font-semibold flex items-center gap-1"><Fingerprint className="w-3.5 h-3.5" /> Customer PSID</span>
            <span className="text-sm font-medium text-gray-900 font-mono">{maskString(lastMsg.customerPsid)}</span>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs text-gray-500 uppercase font-semibold flex items-center gap-1"><Fingerprint className="w-3.5 h-3.5" /> Conversation ID</span>
            <span className="text-sm font-medium text-gray-900 font-mono">{maskString(lastMsg.conversationId)}</span>
          </div>
          
          <div className="flex flex-col gap-1">
            <span className="text-xs text-gray-500 uppercase font-semibold flex items-center gap-1"><Database className="w-3.5 h-3.5" /> Stored in Firestore</span>
            <span className="text-sm font-medium text-green-600 flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> {lastMsg.storedInFirestore}</span>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs text-gray-500 uppercase font-semibold flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Visible in Conversations</span>
            <span className="text-sm font-medium text-green-600 flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> {lastMsg.visibleInConversations}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
