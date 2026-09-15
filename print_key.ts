import dotenv from "dotenv";
dotenv.config({ override: true });
console.log(JSON.stringify(process.env.FIREBASE_PRIVATE_KEY));
