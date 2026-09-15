import crypto from "crypto";
import dotenv from "dotenv";
dotenv.config({ override: true });

async function runTest() {
  const secret = process.env.META_APP_SECRET;
  if (!secret) return console.error("No META_APP_SECRET");

  const payload = {
    object: "page",
    entry: [
      {
        id: process.env.META_PAGE_ID || "110414661460391",
        time: Date.now(),
        messaging: [
          {
            sender: { id: "1000000000001" }, // Fake test PSID
            recipient: { id: process.env.META_PAGE_ID || "110414661460391" },
            timestamp: Date.now(),
            message: {
              mid: "m_live_test_" + Date.now(),
              text: "Hello! This is a brand new live test message. Do you have Gemini Pro available?"
            }
          }
        ]
      }
    ]
  };

  const bodyString = JSON.stringify(payload);
  const signature = 'sha256=' + crypto.createHmac('sha256', secret).update(bodyString).digest('hex');
  console.log("Sending simulated live Meta webhook payload...");
  try {
    const res = await fetch("http://localhost:3000/api/webhooks/meta", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-hub-signature-256": signature },
      body: bodyString
    });
    console.log("Status:", res.status);
  } catch (err) { console.error("Error calling webhook:", err); }
}

runTest();
