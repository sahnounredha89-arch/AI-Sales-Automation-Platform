import fs from "fs";
let code = fs.readFileSync("src/pages/Connectors.tsx", "utf8");

// Messenger UI Auth Status
code = code.replace(
  /<span className="text-gray-500">Meta Authentication:<\/span>\s*<span className="inline-flex items-center font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded border border-green-100">\s*<CheckCircle2 className="w-3.5 h-3.5 mr-1 text-green-600" \/> Connected\s*<\/span>/,
  `
                    <span className="text-gray-500">Meta Authentication:</span>
                    {testResult.messenger?.authStatus === "failed" || messengerConn.status === "failed" ? (
                      <span className="inline-flex items-center font-semibold text-red-700 bg-red-50 px-2 py-0.5 rounded border border-red-100">
                        <XCircle className="w-3.5 h-3.5 mr-1 text-red-600" /> Token Expired
                      </span>
                    ) : (
                      <span className="inline-flex items-center font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded border border-green-100">
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-green-600" /> Connected
                      </span>
                    )}`
);

// Instagram UI Auth Status
code = code.replace(
  /<span className="text-gray-500">Meta Authentication:<\/span>\s*<span className="inline-flex items-center font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded border border-green-100">\s*<CheckCircle2 className="w-3.5 h-3.5 mr-1 text-green-600" \/> Connected\s*<\/span>/,
  `
                    <span className="text-gray-500">Meta Authentication:</span>
                    {testResult.instagram?.authStatus === "failed" || instagramConn.status === "failed" ? (
                      <span className="inline-flex items-center font-semibold text-red-700 bg-red-50 px-2 py-0.5 rounded border border-red-100">
                        <XCircle className="w-3.5 h-3.5 mr-1 text-red-600" /> Token Expired
                      </span>
                    ) : (
                      <span className="inline-flex items-center font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded border border-green-100">
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-green-600" /> Connected
                      </span>
                    )}`
);

fs.writeFileSync("src/pages/Connectors.tsx", code);
