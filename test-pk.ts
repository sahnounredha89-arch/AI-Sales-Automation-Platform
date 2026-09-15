import { getEnvVars } from "./server/firebase";
let { FIREBASE_PRIVATE_KEY: rawPrivateKey } = getEnvVars();

let privateKey = rawPrivateKey.trim();
if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
  privateKey = privateKey.substring(1, privateKey.length - 1);
}
if (privateKey.startsWith("'") && privateKey.endsWith("'")) {
  privateKey = privateKey.substring(1, privateKey.length - 1);
}

privateKey = privateKey.replace(/\\-----END PRIVATE KEY-----/g, "\\n-----END PRIVATE KEY-----");
privateKey = privateKey.replace(/-----END PRIVATE KEY-----\\/g, "-----END PRIVATE KEY-----\\n");
privateKey = privateKey.replace(/\\\\n/g, "\n").replace(/\\n/g, "\n");
console.log("FINAL PK: \n" + privateKey);
