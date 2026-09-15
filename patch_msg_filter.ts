import fs from "fs";
let code = fs.readFileSync("src/pages/Conversations.tsx", "utf8");

code = code.replace(
  /\/\/ Strict filter: genuine Facebook Messenger messages only\s*\/\/ Exclude simulator, test, demo, seeded, fake, or instagram messages\s*const realMessages = rawDocs\.filter\(m => \{[\s\S]*?return true;\s*\}\);/,
  `// Strict filter: exclude simulators and test messages
      const realMessages = rawDocs.filter(m => {
        if (m.isTest === true || m.origin === "test" || m.channel === "simulator") return false;
        if ((m as any).metaSent === false) return false;
        return true;
      });`
);

fs.writeFileSync("src/pages/Conversations.tsx", code);
