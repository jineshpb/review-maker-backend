// Load environment variables from .env file
import "dotenv/config";

import express, { Request, Response } from "express";
import cors from "cors";
import { takeScreenshot, takeScreenshotFromHtml } from "./screenshot";

const app = express();
const PORT = process.env.PORT || 3001;

// Increase payload size limit for HTML content
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Middleware
app.use(cors());

// Health check endpoint
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", message: "Screenshot API is running" });
});

// Screenshot endpoint - supports both URL and HTML string
app.post("/screenshot", async (req: Request, res: Response) => {
  try {
    const { url, html, css, state, options } = req.body;

    // Check if HTML string is provided
    if (html) {
      if (typeof html !== "string") {
        return res.status(400).json({
          error: "Invalid HTML format",
          message: "HTML must be a string",
        });
      }

      const screenshotBuffer = await takeScreenshotFromHtml({
        html,
        css: css || "",
        state: state || {},
        options: options || {},
      });

      const imageType = options?.type || "png";
      res.setHeader(
        "Content-Type",
        imageType === "jpeg" ? "image/jpeg" : "image/png"
      );
      res.setHeader("Content-Length", screenshotBuffer.length);
      res.setHeader("Cache-Control", "no-cache");

      return res.send(screenshotBuffer);
    }

    // Fallback to URL-based screenshot
    if (!url) {
      return res.status(400).json({
        error: "URL or HTML is required",
        message:
          "Please provide either a valid URL or HTML string in the request body",
      });
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return res.status(400).json({
        error: "Invalid URL format",
        message: "Please provide a valid URL (e.g., https://example.com)",
      });
    }

    const screenshotBuffer = await takeScreenshot(url, options || {});

    const imageType = options?.type || "png";
    res.setHeader(
      "Content-Type",
      imageType === "jpeg" ? "image/jpeg" : "image/png"
    );
    res.setHeader("Content-Length", screenshotBuffer.length);
    res.setHeader("Cache-Control", "no-cache");

    res.send(screenshotBuffer);
  } catch (error) {
    console.error("Screenshot error:", error);

    if (error instanceof Error) {
      return res.status(500).json({
        error: "Screenshot failed",
        message: error.message,
      });
    }

    res.status(500).json({
      error: "Screenshot failed",
      message: "An unknown error occurred",
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Screenshot API server running on http://localhost:${PORT}`);
  console.log(`📸 POST /screenshot - Take a screenshot`);
  console.log(`❤️  GET /health - Health check`);
});
