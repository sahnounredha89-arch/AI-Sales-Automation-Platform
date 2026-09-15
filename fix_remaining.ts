import dotenv from "dotenv";
dotenv.config({ override: true });
import { getEnvVars } from "./server/firebase";
const envVars = getEnvVars();
process.env.FIREBASE_PROJECT_ID = envVars.FIREBASE_PROJECT_ID;
process.env.FIREBASE_CLIENT_EMAIL = envVars.FIREBASE_CLIENT_EMAIL;
process.env.FIREBASE_PRIVATE_KEY = envVars.FIREBASE_PRIVATE_KEY;

import { db } from "./server/firebase";
import { sendMetaMessage } from "./server/services/metaService";

async function run() {
  const users = [
    { name: "Fouad Hamza", id: "28344982968474865", msg: "بصحتك خويا، تفضل، الإدارة راح تتأكد من وصل الدفع تاعك وتفعلولك في أقرب وقت. تقدر تخلينا غير اسمك أو الإيميل اللي سجلت بيه باش نسرعوا العملية؟" },
    { name: "Malik Jhoy Rahmouni", id: "28274655382155062", msg: "بلا جميل خويا! رانا هنا باش نعاونوك. أي استفسار آخر رانا في الخدمة 😊" },
    { name: "Djamel Eddine Elazizi", id: "39693707696895105", msg: "مرحبا بك خويا 😊 كيفاش نقدر نعاونك بخصوص اشتراكاتنا؟ Kimi AI متوفر، تحب نعطيك تفاصيل الأسعار؟" }
  ];
  
  for (const u of users) {
    console.log(`Sending to ${u.name}...`);
    const res = await sendMetaMessage({
      recipientId: u.id,
      text: u.msg,
      platform: "messenger"
    });
    console.log(res);
    await new Promise(r => setTimeout(r, 1000));
  }
}
run().then(()=>process.exit(0)).catch(console.error);
