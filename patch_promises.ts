import fs from "fs";
let code = fs.readFileSync("server/routes/webhooks.ts", "utf8");

// Change .catch(...) to await handleCustomerMessage to ensure it runs before the Express request completely terminates in stateless environments. Wait, we already returned res.status(200) above!
// So awaiting it would not delay the 200 response, it just delays the return of the async callback function for the route.
code = code.replace(
  /handleCustomerMessage\(\{(.*?)\}\)\.catch\(err => console\.error\("\[Meta Webhook\] Error in handleCustomerMessage:", err\)\);/s,
  `await handleCustomerMessage({$1}).catch(err => console.error("[Meta Webhook] Error in handleCustomerMessage:", err));`
);

fs.writeFileSync("server/routes/webhooks.ts", code);
