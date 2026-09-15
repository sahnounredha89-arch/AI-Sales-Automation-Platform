import fs from "fs";
let code = fs.readFileSync("src/components/DashboardLayout.tsx", "utf8");

// Add Menu and X to lucide-react imports
code = code.replace(
  /import { LogOut, LayoutDashboard/g,
  `import { LogOut, LayoutDashboard, Menu, X`
);

// Add useState
code = code.replace(
  /import { Link, useLocation } from "react-router-dom";/,
  `import { Link, useLocation } from "react-router-dom";\nimport { useState } from "react";`
);

// Add state to component
code = code.replace(
  /export default function DashboardLayout.*\{/,
  `export default function DashboardLayout({ children }: { children: React.ReactNode }) {\n  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);`
);

// Modify the return block to add a mobile header and make the sidebar responsive
const mobileHeader = `
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between bg-gray-900 text-white p-4">
        <h1 className="text-xl font-bold">AI Sales Admin</h1>
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
          {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>
`;

// Replace `<div className="flex h-screen bg-gray-100">` with something that stacks on mobile
code = code.replace(
  /<div className="flex h-screen bg-gray-100">/,
  `<div className="flex flex-col md:flex-row h-screen bg-gray-100">\n${mobileHeader}`
);

// Replace `<div className="w-64 bg-gray-900 text-white flex flex-col">` with the responsive sidebar
code = code.replace(
  /<div className="w-64 bg-gray-900 text-white flex flex-col">/,
  `<div className={\`\${isMobileMenuOpen ? "flex" : "hidden"} md:flex w-full md:w-64 bg-gray-900 text-white flex-col z-50 overflow-y-auto absolute md:static h-full\`}>`
);

// Let's also hide the redundant title in the sidebar on mobile
code = code.replace(
  /<div className="p-4 border-b border-gray-800">/,
  `<div className="p-4 border-b border-gray-800 hidden md:block">`
);

// Add a click handler to Links so the menu closes on navigation
code = code.replace(/<Link to=/g, `<Link onClick={() => setIsMobileMenuOpen(false)} to=`);

fs.writeFileSync("src/components/DashboardLayout.tsx", code);
