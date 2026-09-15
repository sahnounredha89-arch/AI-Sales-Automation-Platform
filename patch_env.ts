import fs from "fs";
let code = fs.readFileSync(".env", "utf8");

code = code.replace(
  /GEMINI_PRIMARY_MODEL=gemini-flash-lite-latest/,
  `GEMINI_PRIMARY_MODEL=gemini-1.5-pro-latest`
);

fs.writeFileSync(".env", code);
