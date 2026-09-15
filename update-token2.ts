import { initFirebaseAdmin, db } from "./server/firebase";
import fs from "fs";

async function updateToken() {
  initFirebaseAdmin();
  const firestore = db();
  const newToken = "EAARUqn0q1IUBSZAXWFVFkMgVACU0aE4IexVhhHxbdG6sBgtdATOaVLOmD43FDENQu0aM8qMdxBaZBJqXiWYw6GGzcxtHYeZA9Swbx2LJJFJmqymcUBYZCZCF5T6ZAzT5t4B31SFjRufml5rXwcRLtMfndY2H6ZBEbhTx76MDAsZCKmJ2Gi3fwcTNZB6y8WbY8nPwCaYMRZAOYkEEBtJ670oqzZBbyPestur0Twt96cZALdUZD";

  try {
    await firestore.collection("settings").doc("meta").update({
      pageAccessToken: newToken,
      updatedAt: new Date().toISOString()
    });

    await firestore.collection("settings").doc("env_backup").update({
      META_PAGE_ACCESS_TOKEN: newToken,
      updatedAt: new Date().toISOString()
    });

    console.log("Firestore updated with Page Access Token.");

    let envContent = fs.readFileSync(".env", "utf8");
    if (envContent.includes("META_PAGE_ACCESS_TOKEN=")) {
      envContent = envContent.replace(/META_PAGE_ACCESS_TOKEN=.*/, `META_PAGE_ACCESS_TOKEN=${newToken}`);
    } else {
      envContent += `\nMETA_PAGE_ACCESS_TOKEN=${newToken}\n`;
    }
    fs.writeFileSync(".env", envContent);
    console.log(".env updated with Page Access Token.");
  } catch (err: any) {
    console.error("Failed to update:", err);
  }
}

updateToken();
