import fs from "fs";
let code = fs.readFileSync("src/pages/PaymentMethods.tsx", "utf8");

code = code.replace(
  /<option value="BaridiMob">BaridiMob \(DZD\)<\/option>\s*<option value="CCP">CCP Algérie \(DZD\)<\/option>\s*<option value="RedotPay">RedotPay \(USDT\)<\/option>/,
  `<option value="BaridiMob">BaridiMob (DZD)</option>
                      <option value="CCP">CCP Algérie (DZD)</option>
                      <option value="flexy">Flexy (DZD)</option>
                      <option value="RedotPay">RedotPay (USDT)</option>`
);

code = code.replace(
  /if \(method\.type && \["BaridiMob", "CCP", "RedotPay"\]\.includes\(method\.type\)\)/,
  `if (method.type && ["BaridiMob", "CCP", "RedotPay", "flexy"].includes(method.type))`
);

code = code.replace(
  /newType === "BaridiMob" \? "BaridiMob" :/,
  `newType === "BaridiMob" ? "BaridiMob" : newType === "flexy" ? "Flexy" :`
);

code = code.replace(
  /\{inferredType === "BaridiMob" \? "BM" : inferredType === "RedotPay" \? "RP" : "CCP"\}/g,
  `{inferredType === "BaridiMob" ? "BM" : inferredType === "RedotPay" ? "RP" : inferredType === "flexy" ? "FL" : "CCP"}`
);

fs.writeFileSync("src/pages/PaymentMethods.tsx", code);
