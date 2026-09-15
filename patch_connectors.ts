import fs from "fs";
let code = fs.readFileSync("src/pages/Connectors.tsx", "utf8");

// 1. Fix Instagram top badge logic
code = code.replace(
  /\(testResult\.instagram\?\.messagingStatus \|\| instagramConn\.messagingStatus\) === "ready" \? \(/,
  `((testResult.instagram?.messagingStatus || instagramConn.messagingStatus) === "ready" && (testResult.instagram?.accountLinked || instagramConn.accountLinked || instagramConn.igAccountId)) ? (`
);

// 2. Fix Instagram bottom Messaging Status logic
code = code.replace(
  /\(testResult\.instagram\?\.messagingStatus \|\| instagramConn\.messagingStatus\) === "ready" \? \(/g,
  `((testResult.instagram?.messagingStatus || instagramConn.messagingStatus) === "ready" && (testResult.instagram?.accountLinked || instagramConn.accountLinked || instagramConn.igAccountId)) ? (`
);

// 3. Fix Telegram logic as well if needed? Telegram is just "verified" or not.

// 4. Add flex-shrink-0 to the gray footer area buttons so they never clip vertically inside a flex column if constrained
code = code.replace(/<div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex flex-wrap gap-2 justify-end">/g, `<div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex flex-wrap gap-2 justify-end shrink-0">`);

fs.writeFileSync("src/pages/Connectors.tsx", code);
