import dotenv from "dotenv";
dotenv.config({ override: true });
import { getEnvVars } from "./server/firebase";
const envVars = getEnvVars();
process.env.FIREBASE_PROJECT_ID = envVars.FIREBASE_PROJECT_ID;
process.env.FIREBASE_CLIENT_EMAIL = envVars.FIREBASE_CLIENT_EMAIL;
process.env.FIREBASE_PRIVATE_KEY = envVars.FIREBASE_PRIVATE_KEY;

import { db } from "./server/firebase";
import { getAuthoritativeMetaCredentials } from "./server/services/metaCredentialService";

async function run() {
  const auth = await getAuthoritativeMetaCredentials("messenger");
  const token = auth.accessToken;
  const pageId = auth.pageId;
  
  if (!token || !pageId) return;

  console.log("Fetching top 15 conversations directly from Meta...");
  const fbUrl = `https://graph.facebook.com/v19.0/${pageId}/conversations?limit=15&fields=id,senders,messages.limit(5){id,message,created_time,from,attachments}&access_token=${encodeURIComponent(token)}`;
  
  const res = await fetch(fbUrl);
  const data = await res.json();
  
  if (data.error) {
    console.error("Error fetching conversations:", data.error);
    return;
  }
  
  const convs = data.data || [];
  console.log(`Found ${convs.length} conversations.`);
  
  for (const c of convs) {
    const senders = c.senders?.data || [];
    const customer = senders.find((s: any) => s.id !== pageId);
    if (!customer) continue;
    
    const msgs = c.messages?.data || [];
    if (msgs.length === 0) continue;
    
    // Check if the most recent message is from the customer
    const lastMsg = msgs[0];
    if (lastMsg.from?.id === pageId) {
      console.log(`Skipping ${customer.name}, last message was from the Page.`);
      continue;
    }
    
    console.log(`Needs sync/reply: ${customer.name} - "${lastMsg.message || 'attachment'}"`);
    
    // Save to Firestore so the bot can pick it up
    const convRef = db().collection("conversations").doc(); // Use new ID or deterministic
    const query = await db().collection("conversations").where("platformUserId", "==", customer.id).limit(1).get();
    let docRef = query.empty ? convRef : query.docs[0].ref;
    
    await docRef.set({
      platform: "messenger",
      platformUserId: customer.id,
      customerName: customer.name,
      snippet: lastMsg.message || "Attachment",
      unreadCount: 1,
      lastMessageAt: lastMsg.created_time,
      updatedAt: new Date().toISOString(),
      aiEnabled: true,
      humanHandoff: false,
    }, { merge: true });
    
    // Add the message
    await docRef.collection("messages").add({
      direction: "inbound",
      sender: customer.name,
      type: lastMsg.attachments ? "image" : "text",
      text: lastMsg.message || "",
      timestamp: lastMsg.created_time,
      platformMessageId: lastMsg.id
    });
  }
  
  console.log("Done syncing. Now running AI batch reply...");
}
run().then(()=>process.exit(0)).catch(console.error);
