import fs from "fs";
let code = fs.readFileSync("src/pages/Connectors.tsx", "utf8");

code = code.replace(
  /\{testResult\.instagram\?\.accountLinked \|\| instagramConn\.igAccountId \? \(/g,
  "{testResult.instagram?.accountLinked || instagramConn.accountLinked || instagramConn.igAccountId ? ("
);

fs.writeFileSync("src/pages/Connectors.tsx", code);
