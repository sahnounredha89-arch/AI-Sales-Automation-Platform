import fs from "fs";
let code = fs.readFileSync("src/pages/AiInstructions.tsx", "utf8");

// Fix isLoading block
code = code.replace(
  /return \(\s*<DashboardLayout>\s*<div className="flex justify-center items-center h-64">/s,
  `return (\n      <DashboardLayout>\n        <div className="flex justify-center items-center h-64">`
);

// We need to add the closing </DashboardLayout> to isLoading block
code = code.replace(
  /        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"><\/div>\s*<\/div>\s*\);\s*\}/,
  `        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>\n        </div>\n      </DashboardLayout>\n    );\n  }`
);

// Fix the main return block
code = code.replace(
  /return \(\s*<div className="max-w-4xl mx-auto space-y-6">/,
  `return (\n    <DashboardLayout>\n      <div className="max-w-4xl mx-auto space-y-6">`
);

fs.writeFileSync("src/pages/AiInstructions.tsx", code);
