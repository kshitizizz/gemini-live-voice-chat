import express from "express";
import { config as loadDotenv } from "dotenv";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OPENAI_REALTIME_MODEL = "gpt-realtime";

// Ensure backend-only environment variables are loaded for server routes.
loadDotenv({ path: path.resolve(process.cwd(), ".env.local") });
loadDotenv({ path: path.resolve(process.cwd(), ".env") });

async function startServer() {
  const app = express();
  const PORT = 3000;

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/openai/session", async (_req, res) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: "OPENAI_API_KEY is not configured on the server." });
      return;
    }

    try {
      const sessionResp = await fetch("https://api.openai.com/v1/realtime/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: OPENAI_REALTIME_MODEL,
          voice: "alloy",
        }),
      });

      if (!sessionResp.ok) {
        const errorText = await sessionResp.text();
        res.status(sessionResp.status).json({
          error: "Failed to create OpenAI realtime session.",
          details: errorText,
        });
        return;
      }

      const sessionData = await sessionResp.json();
      const clientSecret = sessionData?.client_secret?.value;
      if (!clientSecret) {
        res.status(500).json({ error: "OpenAI session response missing client secret." });
        return;
      }

      res.json({
        clientSecret,
        model: OPENAI_REALTIME_MODEL,
      });
    } catch (error) {
      console.error("OpenAI session creation failed:", error);
      res.status(500).json({ error: "Unexpected error creating OpenAI realtime session." });
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
    // Serve static files in production
    app.use(express.static(path.join(__dirname, "dist")));
    
    // SPA fallback
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
