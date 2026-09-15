import fs from "fs";
let code = fs.readFileSync("src/pages/Conversations.tsx", "utf8");

code = code.replace(
  'All {allPendingCount > 0 ? `(${allPendingCount})` : ""}',
  'All ({allPendingCount})'
);

code = code.replace(
  'Messenger {messengerCount > 0 ? `(${messengerCount})` : ""}',
  'Messenger ({messengerCount})'
);

code = code.replace(
  'Instagram {instagramCount > 0 ? `(${instagramCount})` : ""}',
  'Instagram ({instagramCount})'
);

fs.writeFileSync("src/pages/Conversations.tsx", code);
