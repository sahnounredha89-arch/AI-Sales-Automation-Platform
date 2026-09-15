import { initFirebaseAdmin, db } from "./server/firebase";
import fs from "fs";

async function updateToken() {
  initFirebaseAdmin();
  const firestore = db();
  const newToken = "EAARUqn0q1IUBSaBp3w6vI3604ltddnW7Rg5zOEqOJAMvfZBCuwPb02I2hm59ke6lkK1TqHwORdYWzZBDk24TvFZAJCE3mMtkYSMS6aeuUGKvqBfzGYM1mSVbkhZAXTWwibZBj0SGesXkdYJ5NlJZAG2DykdOUFfd9ilHTtJwNulGBGbaZCx1ubwVFXwUhg62qpnP6IqI2PZCh7ZCffsIPaAMeUIUr3IBPfoHAIgZDZD";

  try {
    await firestore.collection("settings").doc("meta").update({
      pageAccessToken: newToken,
      updatedAt: new Date().toISOString()
    });

    await firestore.collection("settings").doc("env_backup").update({
      META_PAGE_ACCESS_TOKEN: newToken,
      updatedAt: new Date().toISOString()
    });

    console.log("Firestore updated successfully.");

    let envContent = fs.readFileSync(".env", "utf8");
    if (envContent.includes("META_PAGE_ACCESS_TOKEN=")) {
      envContent = envContent.replace(/META_PAGE_ACCESS_TOKEN=.*/, `META_PAGE_ACCESS_TOKEN=${newToken}`);
    } else {
      envContent += `\nMETA_PAGE_ACCESS_TOKEN=${newToken}\n`;
    }
    fs.writeFileSync(".env", envContent);
    console.log(".env updated successfully.");
  } catch (err: any) {
    console.error("Failed to update:", err);
  }
}

updateToken();
