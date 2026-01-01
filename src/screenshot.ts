import { chromium, Browser, Page } from "playwright";

interface ScreenshotRequestOptions {
  width?: number;
  height?: number;
  fullPage?: boolean;
  /**
   * Optional CSS selector to screenshot a specific element instead of the full page.
   * If omitted, we'll try `#review-card` by default (and fall back to full-page if not found).
   */
  selector?: string;
  /**
   * How long to wait (ms) for the selector to appear before falling back to full-page screenshot.
   * Defaults to `timeout`.
   */
  selectorTimeout?: number;
  waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit";
  timeout?: number;
  quality?: number;
  type?: "png" | "jpeg";
  deviceScaleFactor?: number;
  transparent?: boolean; // Enable transparent background (PNG only)
  headless?: boolean; // Set to false to show browser UI for debugging
}

interface HtmlScreenshotRequest {
  html: string;
  css?: string;
  state?: Record<string, any>;
  options?: ScreenshotRequestOptions;
}

let browser: Browser | null = null;

const getBrowser = async (headless: boolean = true): Promise<Browser> => {
  // If headless is false (debug mode), create a new browser instance
  // so we don't interfere with the shared headless browser
  if (!headless) {
    return await chromium.launch({
      headless: false,
      slowMo: 100, // Slow down operations so you can see what's happening
    });
  }

  // Use shared browser instance for headless mode
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
    selector = "#review-card",
    selectorTimeout,
    waitUntil = "networkidle",
    timeout = 30000,
    quality = 100,
    type = "png",
    deviceScaleFactor = 2, // Default to 2x for retina quality
    transparent = true,
    headless = false,
  } = options;

  // Force PNG type when transparent is enabled
  const screenshotType = transparent ? "png" : (type as "png" | "jpeg");

  const browserInstance = await getBrowser(headless);
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

    // Inject CSS immediately after page load to make page background transparent
    // This ensures the PNG area outside elements is transparent
    if (transparent) {
      await page.addStyleTag({
        content: `
          html, body {
            background-color: transparent !important;
            background: transparent !important;
          }
        `,
      });
      // Wait for style to apply and re-render
      await page.waitForTimeout(200);
    }

    // Wait longer in debug mode so you can see what's happening
    if (!headless) {
      await page.waitForTimeout(3000);
      console.log(
        "🔍 Debug mode: Browser is visible. Press any key to continue..."
      );
    }

    // Prefer element-level screenshot when possible (e.g. `#review-card`)
    if (selector) {
      try {
        const element = page.locator(selector);
        await element.waitFor({
          state: "visible",
          timeout:
            typeof selectorTimeout === "number" ? selectorTimeout : timeout,
        });

        const elementBuffer = await element.screenshot({
          type: screenshotType,
          quality: screenshotType === "jpeg" ? quality : undefined,
          animations: "disabled",
          omitBackground: transparent,
        });

        return elementBuffer as Buffer;
      } catch {
        // Fall back to full page screenshot below if element isn't found or isn't visible in time
      }
    }

    // Fallback: Take screenshot of the page
    const screenshotBuffer = await page.screenshot({
      type: screenshotType,
      fullPage,
      quality: screenshotType === "jpeg" ? quality : undefined,
      animations: "disabled", // Disable animations for consistent screenshots
      omitBackground: transparent, // Enable transparent background for PNG
    });

    return screenshotBuffer as Buffer;
  } finally {
    await page.close();
    await context.close();
    // Close debug browser instance if it was created separately
    if (!headless && browserInstance !== browser) {
      await browserInstance.close();
    }
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
    transparent = true,
    headless = false,
  } = options;

  // Force PNG type when transparent is enabled
  const screenshotType = transparent ? "png" : (type as "png" | "jpeg");

  const browserInstance = await getBrowser(headless);
  const context = await browserInstance.newContext({
    viewport: { width, height },
    deviceScaleFactor,
  });

  const page = await context.newPage();

  try {
    let completeHtml: string;

    if (transparent) {
      // When transparent is true, render only the HTML content - minimal structure, no viewport constraints
      completeHtml = `
<!DOCTYPE html>
<html style="margin: 0; padding: 0; width: fit-content; height: fit-content;">
<head>
  <meta charset="UTF-8">
  <style>
    html, body {
      margin: 0;
      padding: 0;
      width: fit-content;
      height: fit-content;
      display: inline-block;
    }
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
    } else {
      // When transparent is false, use full HTML document with viewport
      completeHtml = `
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
    }

    // Set HTML content directly
    await page.setContent(completeHtml, {
      waitUntil: "networkidle",
      timeout,
    });

    // Wait a bit for any dynamic content to render
    await page.waitForTimeout(500);

    // Target the review card element
    const element = page.locator("#review-card");

    await element.waitFor({ state: "visible", timeout });
    console.log("element found", element);

    // Wait longer in debug mode so you can see what's happening
    if (!headless) {
      await page.waitForTimeout(3000);
      console.log(
        "🔍 Debug mode: Browser is visible. Targeting #review-card element."
      );
    }

    // Take screenshot of the review card element only
    const screenshotBuffer = await element.screenshot({
      type: screenshotType,
      quality: screenshotType === "jpeg" ? quality : undefined,
      animations: "disabled", // Disable animations for consistent screenshots
      omitBackground: transparent, // Enable transparent background for PNG
    });

    return screenshotBuffer as Buffer;
  } finally {
    await page.close();
    await context.close();
    // Close debug browser instance if it was created separately
    if (!headless && browserInstance !== browser) {
      await browserInstance.close();
    }
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
