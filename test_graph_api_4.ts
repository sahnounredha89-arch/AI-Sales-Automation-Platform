const pageToken = "EAARUqn0q1IUBSUnaBvsfND6nPGpIk1lzvlTrXpJ4FnrpTOPehxpnUMA9iePDrojgAgRKYekg89ZBMZBReoG7IZAjL0ZBwZAdV1Odu3CZBFvqV9qTPUdfeMDb9WZCQr5fmM7otljcTSIVDEyjMu8oOAk8lyn9UWRz3jCFiwIHFZBOXsmVo1ZCl2CmNl9ReOVElgcEZCpTZAhNwIZD";
const newAppId = "1218991127975045";
const newAppSecret = "bfe7e335d2484e773add1ac334c276b2";

async function run() {
    const igRes = await fetch(`https://graph.facebook.com/v19.0/me?fields=id,name,instagram_business_account{id,username}&access_token=${pageToken}`);
    console.log("/me IG check:", await igRes.json());
    
    const debugRes = await fetch(`https://graph.facebook.com/debug_token?input_token=${pageToken}&access_token=${newAppId}|${newAppSecret}`);
    const debugData = await debugRes.json();
    console.log("/debug_token scopes:", debugData?.data?.scopes);
}
run();
