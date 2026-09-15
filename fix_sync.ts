import dotenv from "dotenv";
dotenv.config({ override: true });
import { getEnvVars, db } from "./server/firebase";
import fs from "fs";

const envVars = getEnvVars();
process.env.FIREBASE_PROJECT_ID = envVars.FIREBASE_PROJECT_ID;
process.env.FIREBASE_CLIENT_EMAIL = envVars.FIREBASE_CLIENT_EMAIL;
process.env.FIREBASE_PRIVATE_KEY = envVars.FIREBASE_PRIVATE_KEY;

async function run() {
    console.log("Updating Firestore env_backup...");
    await db().collection("settings").doc("env_backup").set({
        GEMINI_PRIMARY_MODEL: "gemini-1.5-pro-latest"
    }, { merge: true });
    
    console.log("Updating .credentials_backup.json if exists...");
    if (fs.existsSync(".credentials_backup.json")) {
        const backup = JSON.parse(fs.readFileSync(".credentials_backup.json", "utf-8"));
        backup.GEMINI_PRIMARY_MODEL = "gemini-1.5-pro-latest";
        fs.writeFileSync(".credentials_backup.json", JSON.stringify(backup, null, 2), "utf-8");
    }

    console.log("Updating .env...");
    let code = fs.readFileSync(".env", "utf8");
    code = code.replace(
      /GEMINI_PRIMARY_MODEL=.*/,
      `GEMINI_PRIMARY_MODEL=gemini-1.5-pro-latest`
    );
    fs.writeFileSync(".env", code);

    process.exit(0);
}
run();
