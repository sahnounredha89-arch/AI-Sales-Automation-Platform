import fs from "fs";
let code = fs.readFileSync("src/pages/PaymentMethods.tsx", "utf8");

code = code.replace(
  /type PaymentType = "BaridiMob" \| "CCP" \| "RedotPay";/,
  `type PaymentType = "BaridiMob" | "CCP" | "RedotPay" | "flexy";`
);

code = code.replace(
  /<option value="BaridiMob">BaridiMob<\/option>\s*<option value="CCP">CCP \(Algérie Poste\)<\/option>\s*<option value="RedotPay">RedotPay \/ Binance Pay<\/option>/,
  `<option value="BaridiMob">BaridiMob</option>
                  <option value="CCP">CCP (Algérie Poste)</option>
                  <option value="flexy">Flexy</option>
                  <option value="RedotPay">RedotPay / Binance Pay</option>`
);

// We need to also find where icons are used if they check the type.
fs.writeFileSync("src/pages/PaymentMethods.tsx", code);
