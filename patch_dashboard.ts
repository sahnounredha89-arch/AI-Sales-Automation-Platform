import fs from "fs";
let code = fs.readFileSync("server/routes/dashboard.ts", "utf8");

// Add primary model to the response
code = code.replace(
  /cooldownStatus,/,
  `cooldownStatus,\n        primaryModel: process.env.GEMINI_PRIMARY_MODEL || "gemini-2.5-flash-lite",`
);

fs.writeFileSync("server/routes/dashboard.ts", code);
