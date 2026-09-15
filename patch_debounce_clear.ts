import fs from "fs";
let code = fs.readFileSync("server/services/salesAgent.ts", "utf8");

// Remove the obsolete clearTimeout logic since we replaced the timer logic
code = code.replace(
  /if \(debounceTimers\.has\(customerKey\)\) \{[\s\S]*?\} else \{[\s\S]*?\}/,
  `// Debounce logic removed for serverless sync`
);

fs.writeFileSync("server/services/salesAgent.ts", code);
