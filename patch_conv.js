const fs = require("fs");
let content = fs.readFileSync("src/pages/Conversations.tsx", "utf8");

// Fix conversations query
content = content.replace(
  /where\("source", "==", "messenger"\),\s*limit\(100\)/g,
  'where("channel", "==", "messenger"),\n      orderBy("lastMessageAt", "desc"),\n      limit(100)'
);

// Fix conversations sorting (since we already orderBy from DB, we don't strictly need to sort, but let's keep it just in case, but fix it)
content = content.replace(
  /\/\/ Sort newest first chronologically[\s\S]*?\/\/ PRODUCTION INBOX MESSENGER HARD FILTER:/g,
  `// PRODUCTION INBOX MESSENGER HARD FILTER:`
);

// Fix frontend filtering of conversations
content = content.replace(
  /if \(c\.source && c\.source !== "messenger"\) return false;/g,
  `if (c.channel && c.channel !== "messenger") return false;`
);

// Fix messages query
// Actually messages query is: orderBy("timestamp", "desc"), limit(messageLimit)
// Let's check it.

// Fix frontend filtering of messages
content = content.replace(
  /if \(m\.source && m\.source !== "messenger"\) return false;/g,
  `if (m.channel && m.channel !== "messenger") return false;`
);

fs.writeFileSync("src/pages/Conversations.tsx", content);
console.log("Done patching Conversations.tsx");
