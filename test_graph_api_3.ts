const newToken = "EAARUqn0q1IUBSSFFnIpKcRq9fNpAywsZAjW38eHBc7hMXrz82MShunmOJOgqUP44bMEZC7DP4m4Rkx3SZAbOz1Ldyjhwx5uDrqjLC4lHg9jZBpKxXekBahTpOGX4NMKjI1JAsuSzvwvsylCcy9y0RzS367YQYXGAojauk7EmuFeIhxMsxjlHhQZB9mzaJXN1ZACeUufRAepBrBMbNmUYNfD9b3mDmfkvPcTcbiQrBSD38LdLhS1AZDZD";

async function run() {
    const accRes = await fetch(`https://graph.facebook.com/v19.0/me/accounts?access_token=${newToken}`);
    const accData = await accRes.json();
    console.log("/me/accounts:", JSON.stringify(accData, null, 2));
}
run();
