import dotenv from "dotenv";
dotenv.config({ override: true });
import { getEnvVars, db } from "./server/firebase";

const envVars = getEnvVars();
process.env.FIREBASE_PROJECT_ID = envVars.FIREBASE_PROJECT_ID;
process.env.FIREBASE_CLIENT_EMAIL = envVars.FIREBASE_CLIENT_EMAIL;
process.env.FIREBASE_PRIVATE_KEY = envVars.FIREBASE_PRIVATE_KEY;

async function run() {
    const paymentRef = db().collection("payment_methods").doc("flexy");
    await paymentRef.set({
        name: "Flexy",
        type: "flexy",
        isActive: true,
        details: "0699177640",
        instructions: "يرجى الدفع عبر فليكسي إلى الرقم 0699177640. ممنوع ارسال الماكتيفي، ويجب ارسال الوقت والمبلغ بالضبط.",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    });
    console.log("Flexy payment method added successfully.");
    process.exit(0);
}
run();
