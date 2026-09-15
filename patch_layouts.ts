import fs from "fs";

function wrapInLayout(filePath: string) {
  let code = fs.readFileSync(filePath, "utf8");
  if (code.includes("import DashboardLayout")) {
    console.log(filePath, "already has DashboardLayout");
    return;
  }
  
  // Insert import
  code = code.replace(
    /import React/,
    `import DashboardLayout from "../components/DashboardLayout";\nimport React`
  );
  
  // Find the return statement of the default export component
  // We'll just replace the outermost div return.
  // Actually, since these are simple components, let's just do a regex replace
  // or string splitting.
  // A safer way is to find `return (` and inject `<DashboardLayout>`
  code = code.replace(/return\s*\(\s*<div/s, `return (\n    <DashboardLayout>\n      <div`);
  
  // Find the last closing tag.
  // We can just find the last `);` and insert `</DashboardLayout>` before it.
  code = code.replace(/<\/div>\s*\);\s*\}\s*$/g, `      </div>\n    </DashboardLayout>\n  );\n}`);

  fs.writeFileSync(filePath, code);
  console.log(filePath, "patched");
}

wrapInLayout("src/pages/AiInstructions.tsx");
wrapInLayout("src/pages/Settings.tsx");
wrapInLayout("src/pages/Connectors.tsx");
