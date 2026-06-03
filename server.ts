import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

let aiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY is not defined in environment variables");
    }
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route for AI category classification
  app.post("/api/analyze", async (req, res) => {
    try {
      const { text, categories } = req.body;
      if (!text || typeof text !== "string") {
        return res.status(400).json({ error: "Missing response text" });
      }
      if (!categories || !Array.isArray(categories)) {
        return res.status(400).json({ error: "Missing or invalid categories list" });
      }

      // Check if GEMINI_API_KEY is available first to handle gracefully
      if (!process.env.GEMINI_API_KEY) {
        console.warn("GEMINI_API_KEY is missing. Defaulting to first category or Other.");
        return res.json({ category: categories[0] || "Other" });
      }

      const ai = getGeminiClient();
      const prompt = `You are an expert interactive workshop categorizer.
Given the participant response: "${text}"
And the allowed categories: ${JSON.stringify(categories)}

Determine which of the specified categories this response most closely belongs to. If it doesn't clearly match any of the allowed categories, classify it as "Other".`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          systemInstruction: "Classify user feedback into exact allowed categories. Be precise, objective, and only choose from the provided list or select 'Other'.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              category: {
                type: Type.STRING,
                description: "The selected category. Must be an exact match to one of the strings in the categories list, or 'Other'.",
              }
            },
            required: ["category"]
          }
        }
      });

      const responseText = response.text || "";
      let result;
      try {
        result = JSON.parse(responseText.trim());
      } catch (err) {
        // Fallback parsing or finding category inside text
        const found = categories.find(c => responseText.toLowerCase().includes(c.toLowerCase()));
        result = { category: found || "Other" };
      }

      res.json({ category: result.category || "Other" });
    } catch (error) {
      console.error("Gemini API Error in /api/analyze:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Internal Server Error" });
    }
  });

  // Batch API Route for AI category classification (一鍵分類功能)
  app.post("/api/analyze-batch", async (req, res) => {
    try {
      const { items, categories } = req.body;
      if (!items || !Array.isArray(items)) {
        return res.status(400).json({ error: "Missing or invalid items list" });
      }
      if (!categories || !Array.isArray(categories)) {
        return res.status(400).json({ error: "Missing or invalid categories list" });
      }

      if (items.length === 0) {
        return res.json({ results: [] });
      }

      // Check if GEMINI_API_KEY is available first to handle gracefully
      if (!process.env.GEMINI_API_KEY) {
        console.warn("GEMINI_API_KEY is missing. Defaulting to first category.");
        const fallback = items.map(it => ({ id: it.id, category: categories[0] || "Other" }));
        return res.json({ results: fallback });
      }

      const ai = getGeminiClient();
      const prompt = `You are an expert workshop categorizer.
Given those participant feedback responses:
${JSON.stringify(items.map(it => ({ id: it.id, text: it.text })))}

And the allowed categories list:
${JSON.stringify(categories)}

Classify each response into exactly one of the allowed categories. If any response does not fit any specified category, assign it as "Other".`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          systemInstruction: "Classify multiple feedback items into exact categories. Be objective and precise, returning a valid JSON array format as specified.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              results: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    category: { 
                      type: Type.STRING, 
                      description: "The classified category. Must be an exact match to one of the allowed categories or 'Other'." 
                    }
                  },
                  required: ["id", "category"]
                }
              }
            },
            required: ["results"]
          }
        }
      });

      const responseText = response.text || "";
      let results;
      try {
        const parsed = JSON.parse(responseText.trim());
        results = parsed.results;
      } catch (err) {
        console.error("Failed to parse Gemini batch classification results:", responseText, err);
        // Fallback for each
        results = items.map(it => {
          const matched = categories.find(c => responseText.toLowerCase().includes(c.toLowerCase()));
          return { id: it.id, category: matched || "Other" };
        });
      }

      res.json({ results });
    } catch (error) {
      console.error("Gemini API Error in /api/analyze-batch:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Internal Server Error" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT} (${process.env.NODE_ENV || 'development'} mode)`);
  });
}

startServer().catch(err => {
  console.error("Failed to start server:", err);
});
