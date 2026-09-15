import fs from "fs";
let code = fs.readFileSync("server/services/salesAgent.ts", "utf8");

// Cloud Run throttles CPU after response, so background timers fail. 
// Change processCustomerQueue to be awaited if possible, or trigger it directly. 
// But processCustomerQueue is intended for debouncing.
// If we want it to run reliably on Cloud Run, we should trigger the logic synchronously OR await a short delay then process.

code = code.replace(
  /debounceTimers\.set\(customerKey, setTimeout\(\(\) => \{[\s\S]*?\}, DEBOUNCE_MS\)\);/,
  `// In serverless, setTimeout might be killed.
  // We'll await a short delay instead of purely backgrounding if we can.
  // But wait, handleCustomerMessage is awaited now. So we can just sleep then process.
  await new Promise(resolve => setTimeout(resolve, DEBOUNCE_MS));
  await processCustomerQueue(conversationId, customerId, platform, platformUserId, name);`
);

fs.writeFileSync("server/services/salesAgent.ts", code);
