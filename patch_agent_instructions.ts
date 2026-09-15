import fs from "fs";
let code = fs.readFileSync("server/services/salesAgent.ts", "utf8");

// Fetch the instructions
code = code.replace(
  /if \(!paymentMethods\.length\) \{\s*paymentMethods = FALLBACK_PAYMENT_METHODS;\s*\}/,
  `if (!paymentMethods.length) {
      paymentMethods = FALLBACK_PAYMENT_METHODS;
    }

    let aiInstructions = "";
    if (!isDbInCooldown) {
      try {
        const aiSettingsDoc = await withTimeout(db().collection("settings").doc("ai").get(), 3000);
        if (aiSettingsDoc.exists) {
          aiInstructions = aiSettingsDoc.data()?.customInstructions || "";
        }
      } catch (e: any) {
        // ignore
      }
    }`
);

// Inject into prompt
code = code.replace(
  /const systemInstruction = \`You are a real Algerian sales representative for Dokuni Shop chatting naturally with a customer\./,
  `const systemInstruction = \`You are a real Algerian sales representative for Dokuni Shop chatting naturally with a customer.\n\n\${aiInstructions ? "USER INSTRUCTIONS:\\n" + aiInstructions + "\\n\\n" : ""}`
);

fs.writeFileSync("server/services/salesAgent.ts", code);
