import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
dotenv.config();

async function testGemini() {
  if (!process.env.GEMINI_API_KEY) {
    console.log("No GEMINI_API_KEY found");
    return;
  }
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: "Hello, this is a test. Reply with 'Test successful'."
    });
    console.log("Gemini Response:", response.text);
  } catch (err: any) {
    console.error("Gemini Error:", err.message);
  }
}
testGemini();
