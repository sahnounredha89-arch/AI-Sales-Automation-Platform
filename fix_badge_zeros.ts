import fs from "fs";
let code = fs.readFileSync("src/pages/Conversations.tsx", "utf8");

code = code.replace(
  /All \{allPendingCount > 0 \? `\(\\\$\{allPendingCount\}\)` : ""\}/g,
  `All ({allPendingCount})`
);

code = code.replace(
  /Messenger \{messengerCount > 0 \? `\(\\\$\{messengerCount\}\)` : ""\}/g,
  `Messenger ({messengerCount})`
);

code = code.replace(
  /Instagram \{instagramCount > 0 \? `\(\\\$\{instagramCount\}\)` : ""\}/g,
  `Instagram ({instagramCount})`
);

fs.writeFileSync("src/pages/Conversations.tsx", code);
