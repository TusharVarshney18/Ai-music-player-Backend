import express from "express";
import OpenAI from "openai";
import dotenv from "dotenv";
dotenv.config();

const router = express.Router();

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

router.post("/", async (req, res) => {
   try {
      const { message } = req.body;
      if (!message) return res.status(400).json({ error: "Message is required" });

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const stream = await client.chat.completions.create({
         model: "gpt-4o-mini",
         messages: [{ role: "user", content: message }],
         stream: true,
      });

      // Iterate over streaming chunks
      for await (const chunk of stream) {
         // Each chunk is an object like { choices: [{ delta: { content: "text" } }] }
         const text = chunk.choices[0].delta?.content;
         if (text) {
            res.write(`data: ${text}\n\n`);
         }
      }

      res.write("data: [DONE]\n\n");
      res.end();

   } catch (error) {
      console.error("Streaming error:", error);
      res.status(500).json({ error: "Streaming failed" });
   }
});

export default router;
