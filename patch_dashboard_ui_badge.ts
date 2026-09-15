import fs from "fs";
let code = fs.readFileSync("src/pages/Dashboard.tsx", "utf8");

code = code.replace(
  /<span className="inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">\s*<CheckCircle2 className="w-3.5 h-3.5 mr-1" \/> Flash-Lite Active\s*<\/span>/,
  `<span className="inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> {primaryModel.includes('pro') ? 'Pro Active' : primaryModel.includes('flash-lite') ? 'Flash-Lite Active' : 'Active'}
              </span>`
);

code = code.replace(
  /<Clock className="w-3.5 h-3.5 mr-1 animate-pulse" \/> Flash-Lite in Cooldown/,
  `<Clock className="w-3.5 h-3.5 mr-1 animate-pulse" /> {primaryModel.includes('pro') ? 'Pro' : primaryModel.includes('flash-lite') ? 'Flash-Lite' : 'Model'} in Cooldown`
);

fs.writeFileSync("src/pages/Dashboard.tsx", code);
