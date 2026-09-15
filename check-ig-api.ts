import dotenv from "dotenv";
dotenv.config();

import { getMetaConfig } from "./server/services/metaService";

async function test() {
  const config = await getMetaConfig("instagram");
  console.log("Config:", config);
  const token = config.accessToken;
  const pageId = config.pageId;
  
  // Try to get the IG account ID from the page
  const url = `https://graph.facebook.com/v19.0/${pageId}?fields=instagram_business_account&access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  console.log("IG Account Response:", await res.json());
}
test();
