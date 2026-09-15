import fs from "fs";
let code = fs.readFileSync("server/services/salesAgent.ts", "utf8");

code = code.replace(
  /\/\/ Debounce logic removed for serverless sync`\);\n  \}/g,
  `// Debounce logic removed for serverless sync`
);

fs.writeFileSync("server/services/salesAgent.ts", code);
