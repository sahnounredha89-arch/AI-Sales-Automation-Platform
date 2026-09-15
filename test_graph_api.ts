const newToken = "EAARUqn0q1IUBSSFFnIpKcRq9fNpAywsZAjW38eHBc7hMXrz82MShunmOJOgqUP44bMEZC7DP4m4Rkx3SZAbOz1Ldyjhwx5uDrqjLC4lHg9jZBpKxXekBahTpOGX4NMKjI1JAsuSzvwvsylCcy9y0RzS367YQYXGAojauk7EmuFeIhxMsxjlHhQZB9mzaJXN1ZACeUufRAepBrBMbNmUYNfD9b3mDmfkvPcTcbiQrBSD38LdLhS1AZDZD";
const newAppId = "1218991127975045";
const newAppSecret = "bfe7e335d2484e773add1ac334c276b2";

async function run() {
    // Check basic info
    const meRes = await fetch(`https://graph.facebook.com/v19.0/me?fields=id,name,instagram_business_account{id,username},accounts{id,name,instagram_business_account}&access_token=${newToken}`);
    const meData = await meRes.json();
    console.log("/me:", JSON.stringify(meData, null, 2));

    // Check permissions
    const debugRes = await fetch(`https://graph.facebook.com/debug_token?input_token=${newToken}&access_token=${newAppId}|${newAppSecret}`);
    const debugData = await debugRes.json();
    console.log("/debug_token scopes:", JSON.stringify(debugData?.data?.scopes, null, 2));
}
run();
