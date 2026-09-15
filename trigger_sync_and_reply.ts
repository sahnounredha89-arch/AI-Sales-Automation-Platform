import dotenv from "dotenv";
dotenv.config({ override: true });
import { getEnvVars } from "./server/firebase";

const envVars = getEnvVars();
process.env.FIREBASE_PROJECT_ID = envVars.FIREBASE_PROJECT_ID;
process.env.FIREBASE_CLIENT_EMAIL = envVars.FIREBASE_CLIENT_EMAIL;
process.env.FIREBASE_PRIVATE_KEY = envVars.FIREBASE_PRIVATE_KEY;

import { syncMetaConversations } from "./server/services/metaService";
import { replyAllUnrepliedMessages } from "./server/services/salesAgent";

async function run() {
    console.log("Starting sync for Messenger...");
    await syncMetaConversations("messenger").catch(e => console.error("Messenger sync error:", e));
    
    console.log("Starting sync for Instagram...");
    await syncMetaConversations("instagram").catch(e => console.error("Instagram sync error:", e));
    
    console.log("Starting AI replies for Messenger...");
    const msgRes = await replyAllUnrepliedMessages("messenger").catch(e => { console.error("Messenger reply error:", e); return null; });
    console.log("Messenger replies:", msgRes);
    
    console.log("Starting AI replies for Instagram...");
    const igRes = await replyAllUnrepliedMessages("instagram").catch(e => { console.error("Instagram reply error:", e); return null; });
    console.log("Instagram replies:", igRes);
    
    process.exit(0);
}
run().catch(console.error);
