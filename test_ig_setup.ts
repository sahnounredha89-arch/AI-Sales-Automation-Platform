import { getAuthoritativeMetaCredentials } from "./server/services/metaCredentialService";
import { getMetaConfig, testInstagramConnection } from "./server/services/metaService";

async function main() {
  console.log("process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID:", process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID);
  console.log("process.env.META_PAGE_ID:", process.env.META_PAGE_ID);
  
  const authIg = await getAuthoritativeMetaCredentials("instagram");
  console.log("authIg:", { ...authIg, accessToken: authIg.accessToken ? authIg.accessToken.substring(0, 15) + "..." : null });

  const configIg = await getMetaConfig("instagram");
  console.log("configIg:", { ...configIg, accessToken: configIg.accessToken ? configIg.accessToken.substring(0, 15) + "..." : null });

  const testRes = await testInstagramConnection();
  console.log("testInstagramConnection result:", testRes);
}

main().catch(console.error);
