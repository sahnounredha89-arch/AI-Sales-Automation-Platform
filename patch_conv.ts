import fs from "fs";
let code = fs.readFileSync("src/pages/Conversations.tsx", "utf8");

// 1. Remove Firestore where filter
code = code.replace(
  /where\("channel", "==", "messenger"\),\s*orderBy\("lastMessageAt", "desc"\),\s*limit\(100\)/,
  `orderBy("lastMessageAt", "desc"),\n      limit(300)`
);

// 2. Remove hard filter for instagram
code = code.replace(
  /\/\/ PRODUCTION INBOX MESSENGER HARD FILTER:[\s\S]*?setConversations\(filteredList\);/,
  `// PRODUCTION INBOX HARD FILTER:\n      const filteredList = list.filter(c => {\n         if (c.platform === "simulator" || c.isTest === true || c.origin === "test" || c.channel === "simulator") return false;\n         if (c.id?.startsWith("conv_test") || c.customerName?.toLowerCase().includes("test 100 messages")) return false;\n         return true;\n      });\n\n      setConversations(filteredList);`
);

// 3. Update messengerCount, instagramCount, allCount calculation
code = code.replace(
  /const messengerCount = conversations\.filter\(c => c\.platform === "messenger"\)\.length;/,
  `const messengerCount = conversations.filter(c => c.platform === "messenger" && (c.unreadCount || 0) > 0).length;`
);
code = code.replace(
  /const instagramCount = conversations\.filter\(c => c\.platform === "instagram"\)\.length;/,
  `const instagramCount = conversations.filter(c => c.platform === "instagram" && (c.unreadCount || 0) > 0).length;\n  const allPendingCount = conversations.filter(c => (c.unreadCount || 0) > 0).length;`
);

// 4. Update the badges in the UI
code = code.replace(
  /All \(\{conversations\.length\}\)/,
  `All {allPendingCount > 0 ? \`(\${allPendingCount})\` : ""}`
);
code = code.replace(
  /Messenger \(\{messengerCount\}\)/,
  `Messenger {messengerCount > 0 ? \`(\${messengerCount})\` : ""}`
);
code = code.replace(
  /Instagram \(\{instagramCount\}\)/,
  `Instagram {instagramCount > 0 ? \`(\${instagramCount})\` : ""}`
);

// 5. Update sort logic to prioritize unread
code = code.replace(
  /\.sort\(\(a, b\) => \{\s*const timeA = new Date\(a\.lastMessageAt/s,
  `.sort((a, b) => {
      const aUnread = (a.unreadCount || 0) > 0 ? 1 : 0;
      const bUnread = (b.unreadCount || 0) > 0 ? 1 : 0;
      if (aUnread !== bUnread) {
        return bUnread - aUnread;
      }
      const timeA = new Date(a.lastMessageAt`
);

// 6. Add Pending to statusFilter
code = code.replace(
  /const \[statusFilter, setStatusFilter\] = useState\("all"\);/,
  `const [statusFilter, setStatusFilter] = useState("all"); // "all", "ai", "human", "pending"`
);

code = code.replace(
  /if \(statusFilter === "human" && !conv\.humanHandoff\) return false;\s*if \(statusFilter === "ai" && conv\.humanHandoff\) return false;/s,
  `if (statusFilter === "human" && !conv.humanHandoff) return false;
      if (statusFilter === "ai" && conv.humanHandoff) return false;
      if (statusFilter === "pending" && !(conv.unreadCount && conv.unreadCount > 0)) return false;`
);

code = code.replace(
  /<div className="flex items-center gap-3 text-xs">\s*<span className="text-gray-500">Filter status:<\/span>\s*<button/,
  `<div className="flex items-center gap-3 text-xs">
                <span className="text-gray-500">Filter status:</span>
                <button
                  onClick={() => setStatusFilter("pending")}
                  className={\`\${statusFilter === "pending" ? "font-bold text-gray-900 underline" : "text-gray-600 hover:text-gray-900"} transition cursor-pointer\`}
                >
                  Pending
                </button>
                <span className="text-gray-300">•</span>
                <button`
);

fs.writeFileSync("src/pages/Conversations.tsx", code);
