import { getAuthoritativeMetaCredentials } from "./server/services/metaCredentialService";

async function run() {
  const messenger = await getAuthoritativeMetaCredentials("messenger");
  console.log("Messenger authoritative:", {
    hasToken: !!messenger.accessToken,
    pageId: messenger.pageId,
    pageName: messenger.pageName,
    source: messenger.source
  });

  const instagram = await getAuthoritativeMetaCredentials("instagram");
  console.log("Instagram authoritative:", {
    hasToken: !!instagram.accessToken,
    pageId: instagram.pageId,
    pageName: instagram.pageName,
    igAccountId: (instagram as any).igAccountId,
    igUsername: (instagram as any).igUsername,
    source: instagram.source
  });
}

run().catch(console.error);
