import dotenv from "dotenv";
dotenv.config();

import { initFirebaseAdmin, db } from "./server/firebase";

async function update() {
  initFirebaseAdmin();
  const firestore = db();
  
  const newKey = `-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQDmT6nK7WZ8mlGY\nibce8bszZiMDxyjh/KvGUUV3AustWg/S4oTGQx2F4WPLsaEfMqlbRHw59ADvfoQA\ngKu8J1B0JWuisIXqy/MxWOGcvfiIv/1mJRgBQ7pzk/FMbqdJgCFGYa+35xrTuUZ9\nQXhzCC1akt+zrzPQJtik/FP15XiU6PCc996yHuRU5IaW0ePQdXpFQK7xDELShh+m\n+Z88bAC5xWvj/zQ6WxXxCwXBc6LyzuEV+owMqhOaUyn/Tygs46aR4fE/6kHXB+WX\nIpbZPj+etefYVrHJrW2Vxm+80sGoGs10I/2UpsjeeY3Gc2QflgP4VbI6qGXq/ru4\n9E1s5DelAgMBAAECggEAO32LZdQRu5DfD9BO4WreiKXS2Jh6unkaY9U9ZML3vZS8\nbqQ9WLsgZqM0NHrzHAxpi54ymoOpNDPRZBHYinb7RK0f0vvW87Hv5SjIykSV7Lju\n+xIM09LLWCx4UV5pzsYOklAMZCwJlXQPva4KL2iG0pUKvK6+av+FyYQ2Kde24HuX\niLD1G/TsBlcVeEBRACtAys+C9UrC+oofhePTxPtZt9JPPZlFpjUSiopSxYazZ7Rn\nefpjGSOKw8AWurGMi8GBZgl5zQ+Fo9SVIm0RBzE0RBFkiv4KxsetSGkl0YRSlX+e\nv6OxLqUtp5528Lt4DfH+IcH8joa9Sd3J7FqNW7BKRwKBgQD+0DsO43QKzswB99rP\nUToZmDBHQFSyt9nowl8WwXBNOYryE7QUVgDFFTQMHbj/ER4grGPxszYzYBNbvH+V\n/53/Y4jP1t66ovl5ukfblAzXXChB2wd+7mosle/MHuMCakyvTNJVwIQkXTbAoRVZ\n/x4/PnYD8tvnUH8HBxnh6Hg4zwKBgQDnYjkNlW2z08NOWVwf0uxVU2A9ZVYC+Db4\nJGwsREiYf0hpA5aqN5dBZuR7ebY5t04e0tPLb7nRjeqRhmlTHJlM6DZWFMkZj3fR\nT7a5yMzKdA3eqZr+6eT1AgJyAV1FCjBwqFoaqcttUZXvnVPODeWUK/aOZvYurB2E\n4/3yacn9SwKBgDbkWLSeXxMs9Vm/MQ3UK7XzyQKwYw6U+IZhyOY4CZ85NCtt/y8a\nT9Qk+y9Y/89CusDDIkyhFJ4ApmrusnV3uWuY35IWcai3DxMgA/bTb+i825dEPdsk\nNQ8hxaStSq3shFSHMhBzBoRm6DKbAOSARt3M8NNs795mwtaauwKld7CVAoGAJBfX\nTH4luaprydn4m+I8CWdTGOCo1RfBA14zHYidRmR8eB0eMHkxd/tD4truiPxGDFrY\nvOA1vTGFCKRN47APXcbPSwg9Ama1ywnDOCHRiDcoPrZ4PhFgLLPei8gYs39OZRRt\n0cDwwaG7YMBK5VaXnFBrSnVXK5qflC44W8sSvhcCgYAI4v8WqMw8AdPjwlcfqnMx\nOlWLqCQZMlZrV9D9uKSmOsW+8ADXuXT/4PEFlxCl/GKAzhOMOAS3lXuZrexk/pMk\n5CGq2tquzvWEehgOU40DE+MuyRMugQZXs1yHV2vYVPhBDAONDNLsMpe7U3hgttmd\ngxc4zg7NcAHlTFXWjAizVw==\n-----END PRIVATE KEY-----\n`;

  const escapedKey = newKey.replace(/\n/g, "\\n");

  await firestore.collection("settings").doc("env_backup").update({
    FIREBASE_PRIVATE_KEY: escapedKey,
    updatedAt: new Date().toISOString()
  });

  console.log("Firestore env_backup updated with new FIREBASE_PRIVATE_KEY.");
  process.exit(0);
}
update();
