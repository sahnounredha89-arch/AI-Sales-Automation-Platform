import fs from "fs";
let code = fs.readFileSync("src/pages/Dashboard.tsx", "utf8");

code = code.replace(
  /const primaryStatus = cooldowns\["gemini-2.5-flash-lite"\] \|\| \{ inCooldown: false, remainingSeconds: 0 \};/,
  `const primaryModel = quota.primaryModel || "gemini-2.5-flash-lite";\n  const primaryStatus = cooldowns[primaryModel] || { inCooldown: false, remainingSeconds: 0 };`
);

code = code.replace(
  /<span className="px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">\s*Primary: gemini-2.5-flash-lite\s*<\/span>/,
  `<span className="px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">\n                  Primary: {primaryModel}\n                </span>`
);

code = code.replace(
  /<button\s*onClick=\{\(\) => handleResetCooldown\("gemini-2.5-flash-lite"\)\}/,
  `<button\n                  onClick={() => handleResetCooldown(primaryModel)}`
);

fs.writeFileSync("src/pages/Dashboard.tsx", code);
