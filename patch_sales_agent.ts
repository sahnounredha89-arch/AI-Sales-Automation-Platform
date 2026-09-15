import fs from "fs";
let code = fs.readFileSync("server/services/salesAgent.ts", "utf8");

code = code.replace(
  /"baridimob\?", "baridimob", "redotpay", "redotpay\?"\]\.includes\(norm\)/,
  `"baridimob?", "baridimob", "redotpay", "redotpay?", "flexy", "flexy?", "فليكسي"].includes(norm)`
);

code = code.replace(
  /DZD for BaridiMob\/CCP, USDT for Binance\/RedotPay/,
  `DZD for BaridiMob/CCP/Flexy, USDT for Binance/RedotPay`
);

fs.writeFileSync("server/services/salesAgent.ts", code);
