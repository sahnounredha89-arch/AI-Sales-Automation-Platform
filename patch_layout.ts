import fs from "fs";
let code = fs.readFileSync("src/components/DashboardLayout.tsx", "utf8");

code = code.replace(/h-screen/g, "h-[100dvh]");
code = code.replace(/h-\[calc\(100vh-60px\)\]/g, "h-[calc(100dvh-60px)]");
code = code.replace(/<main className="flex-1 overflow-y-auto bg-gray-50 p-4 sm:p-6 lg:p-8">/, `<main className="flex-1 overflow-y-auto bg-gray-50 p-4 sm:p-6 lg:p-8 pb-32 sm:pb-32 lg:pb-32">`);

fs.writeFileSync("src/components/DashboardLayout.tsx", code);
