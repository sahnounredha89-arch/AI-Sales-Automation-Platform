import fs from "fs";
let code = fs.readFileSync("src/pages/Conversations.tsx", "utf8");

code = code.replace(
  /ArrowDown,\n  History\n\} from "lucide-react";/,
  `ArrowDown,\n  History,\n  ArrowLeft\n} from "lucide-react";`
);

code = code.replace(
  /<div className="w-full lg:w-80 xl:w-96 border-r border-gray-200 flex flex-col bg-gray-50\/50">/,
  `<div className={\`w-full lg:w-80 xl:w-96 border-r border-gray-200 flex-col bg-gray-50/50 \${selectedConv ? 'hidden lg:flex' : 'flex'}\`}>`
);

code = code.replace(
  /<div className="flex-1 flex flex-col bg-white overflow-hidden min-h-0">/,
  `<div className={\`flex-1 flex-col bg-white overflow-hidden min-h-0 \${!selectedConv ? 'hidden lg:flex' : 'flex'}\`}>`
);

code = code.replace(
  /<div className="flex items-center gap-3">\s*<div className="flex items-center gap-2 text-xs font-medium px-2 py-1 bg-white border border-gray-200 rounded-md shadow-sm">/g,
  `<div className="flex items-center gap-3">
                    {/* Mobile Back Button */}
                    <button
                      onClick={() => setSelectedConv(null)}
                      className="lg:hidden p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-200 rounded-md transition cursor-pointer"
                    >
                      <ArrowLeft className="w-5 h-5" />
                    </button>
            <div className="flex items-center gap-2 text-xs font-medium px-2 py-1 bg-white border border-gray-200 rounded-md shadow-sm">`
);

fs.writeFileSync("src/pages/Conversations.tsx", code);
