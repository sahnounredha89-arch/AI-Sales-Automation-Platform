import dotenv from "dotenv";
dotenv.config({ override: true });
import { getEnvVars, db } from "./server/firebase";

const envVars = getEnvVars();
process.env.FIREBASE_PROJECT_ID = envVars.FIREBASE_PROJECT_ID;
process.env.FIREBASE_CLIENT_EMAIL = envVars.FIREBASE_CLIENT_EMAIL;
process.env.FIREBASE_PRIVATE_KEY = envVars.FIREBASE_PRIVATE_KEY;

async function run() {
    const paymentRef = db().collection("paymentMethods").doc("flexy");
    await paymentRef.set({
        name: "Flexy (Djezzy)",
        type: "flexy",
        active: true,
        currency: "DZD",
        details: "0699177640",
        instructions: "فليكسي للرقم: 0699177640\n⚠️ ممنوع ارسال الماكتيفي.\n⚠️ يجب ارسال الوقت والمبلغ بالضبط بعد الفليكسي.",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    });
    console.log("Flexy payment method added successfully to paymentMethods.");
    process.exit(0);
}
run();
