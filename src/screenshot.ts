import { chromium, Browser, Page } from "playwright";

interface ScreenshotRequestOptions {
  width?: number;
  height?: number;
  fullPage?: boolean;
  waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit";
  timeout?: number;
  quality?: number;
  type?: "png" | "jpeg";
  deviceScaleFactor?: number;
}

interface HtmlScreenshotRequest {
  html: string;
  css?: string;
  state?: Record<string, any>;
  options?: ScreenshotRequestOptions;
}

let browser: Browser | null = null;

const getBrowser = async (): Promise<Browser> => {
  if (!browser) {
    browser = await chromium.launch({
      headless: true,
    });
  }
  return browser;
};

export const takeScreenshot = async (
  url: string,
  options: ScreenshotRequestOptions = {}
): Promise<Buffer> => {
  const {
    width = 1920,
    height = 1080,
    fullPage = false,
    waitUntil = "networkidle",
    timeout = 30000,
    quality = 100,
    type = "png",
    deviceScaleFactor = 2, // Default to 2x for retina quality
  } = options;

  const browserInstance = await getBrowser();
  const context = await browserInstance.newContext({
    viewport: { width, height },
    deviceScaleFactor,
  });

  const page = await context.newPage();

  try {
    // Navigate to the URL
    await page.goto(url, {
      waitUntil: waitUntil as
        | "load"
        | "domcontentloaded"
        | "networkidle"
        | "commit",
      timeout,
    });

    // Take screenshot with optimized settings
    const screenshotBuffer = await page.screenshot({
      type: type as "png" | "jpeg",
      fullPage,
      quality: type === "jpeg" ? quality : undefined,
      animations: "disabled", // Disable animations for consistent screenshots
    });

    return screenshotBuffer as Buffer;
  } finally {
    await page.close();
    await context.close();
  }
};

export const takeScreenshotFromHtml = async (
  request: HtmlScreenshotRequest
): Promise<Buffer> => {
  const { html, css = "", state = {}, options = {} } = request;

  const {
    width = 1920,
    height = 1080,
    fullPage = false,
    timeout = 30000,
    quality = 100,
    type = "png",
    deviceScaleFactor = 2, // Default to 2x for retina quality
  } = options;

  const browserInstance = await getBrowser();
  const context = await browserInstance.newContext({
    viewport: { width, height },
    deviceScaleFactor,
  });

  const page = await context.newPage();

  try {
    // Construct complete HTML document
    const completeHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    ${css}
  </style>
</head>
<body>
  ${html}
  <script>
    // Inject state if provided
    if (Object.keys(${JSON.stringify(state)}).length > 0) {
      window.__INITIAL_STATE__ = ${JSON.stringify(state)};
    }
  </script>
</body>
</html>
    `.trim();

    // Set HTML content directly
    await page.setContent(completeHtml, {
      waitUntil: "networkidle",
      timeout,
    });

    // Wait a bit for any dynamic content to render
    await page.waitForTimeout(500);

    // Take screenshot with optimized settings
    const screenshotBuffer = await page.screenshot({
      type: type as "png" | "jpeg",
      fullPage,
      quality: type === "jpeg" ? quality : undefined,
      animations: "disabled", // Disable animations for consistent screenshots
    });

    return screenshotBuffer as Buffer;
  } finally {
    await page.close();
    await context.close();
  }
};

// Graceful shutdown
process.on("SIGTERM", async () => {
  if (browser) {
    await browser.close();
    browser = null;
  }
  process.exit(0);
});

process.on("SIGINT", async () => {
  if (browser) {
    await browser.close();
    browser = null;
  }
  process.exit(0);
});
