import fs from "fs";
let code = fs.readFileSync("src/components/DashboardLayout.tsx", "utf8");

code = code.replace(
  /absolute md:static h-full/,
  `absolute md:static top-[60px] bottom-0 h-[calc(100vh-60px)] md:h-full`
);

code = code.replace(
  /md:hidden flex items-center justify-between bg-gray-900 text-white p-4/,
  `md:hidden shrink-0 flex items-center justify-between bg-gray-900 text-white p-4 z-50 relative`
);

fs.writeFileSync("src/components/DashboardLayout.tsx", code);
