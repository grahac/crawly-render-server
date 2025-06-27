const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
const port = 3000;

let servedRequests = 0;
let errorCount = 0;

// Function to log server stats
const logServerStats = () => {
  console.log(`Served Requests: ${servedRequests}`);
  console.log(`Error Count: ${errorCount}`);
};

// Log server stats every minute
setInterval(logServerStats, 60000);

app.use(express.json());

app.post('/render', async (req, res) => {
  const { 
    url, 
    headers: customHeaders, 
    options,
    formData,
    formSelector,
    submitSelector 
  } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL parameter is required.' });
  }
  
  try {
    const startTime = Date.now();
    console.log(`[DEBUG] Starting render for URL: ${url}`);
    const launchOptions = {
      headless: "new",
      args: [
        '--no-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--disable-setuid-sandbox',
        '--no-first-run',
        '--no-zygote',
        '--deterministic-fetch',
        '--disable-features=IsolateOrigins',
        '--disable-site-isolation-trials',
      ]
    };

    if (process.env.CHROME_EXECUTABLE_PATH) {
      launchOptions.executablePath = process.env.CHROME_EXECUTABLE_PATH;
    }

    console.log(`[DEBUG] Launching browser`);
    const browser = await puppeteer.launch(launchOptions)
    console.log(`[DEBUG] Creating new page`);
    const page = await browser.newPage();

    // Set a real user-agent to avoid bot detection
    console.log(`[DEBUG] Setting user agent and viewport`);
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Enhanced anti-bot detection measures
    await page.setViewport({ width: 1366, height: 768 });
    await page.evaluateOnNewDocument(() => {
      // Remove webdriver property
      delete navigator.__proto__.webdriver;
      
      // Mock plugins and languages
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });
    });

    // Set additional realistic headers
    console.log(`[DEBUG] Setting default headers`);
    await page.setExtraHTTPHeaders({
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
    });

    // Set custom headers if provided
    if (customHeaders) {
      console.log(`[DEBUG] Setting custom headers:`, customHeaders);
      for (const [name, value] of Object.entries(customHeaders)) {
        await page.setExtraHTTPHeaders({ [name]: value });
      }
    }

    // Collection of Supabase API calls and network timing
    const supabaseCalls = [];
    const networkRequests = new Map();
    
    // Add page event listeners for debugging
    page.on('load', () => {
      console.log(`[DEBUG] Page load event fired for: ${url}`);
    });
    
    page.on('domcontentloaded', () => {
      console.log(`[DEBUG] DOMContentLoaded event fired for: ${url}`);
    });
    
    page.on('requestfailed', (request) => {
      console.log(`[DEBUG] Request failed: ${request.url()} - ${request.failure().errorText}`);
    });
    
    page.on('console', (msg) => {
      console.log(`[DEBUG] Page console ${msg.type()}: ${msg.text()}`);
    });
    
    page.on('pageerror', (error) => {
      console.log(`[DEBUG] Page error: ${error.message}`);
    });
    
    // Monitor network requests to track Supabase API calls
    console.log(`[DEBUG] Setting up request interception`);
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const requestUrl = request.url();
      const headers = request.headers();
      
      // Track request start time
      networkRequests.set(requestUrl, {
        startTime: Date.now(),
        method: request.method()
      });
      
      // Check if this is a Supabase request (look for API key and authorization)
      if (requestUrl.includes('supabase') && 
          (headers['apikey'] || 
          headers['Authorization'] || 
          headers['authorization'])) {
        supabaseCalls.push({
          url: requestUrl,
          method: request.method(),
          headers: headers,
          postData: request.postData()
        });
      }
      
      request.continue();
    });

    // Create a variable to hold the response headers
    let responseHeaders = {};

    // Intercept network responses to capture the headers and track timing
    page.on('response', (response) => {
      const responseUrl = response.url();
      const originalUrl = new URL(url);
      
      // Track network request timing
      const requestInfo = networkRequests.get(responseUrl);
      if (requestInfo) {
        const duration = Date.now() - requestInfo.startTime;
        console.log(`[DEBUG] Network request: ${requestInfo.method} ${responseUrl} - ${response.status()} (${duration}ms)`);
        if (duration > 5000) {
          console.log(`[DEBUG] SLOW REQUEST detected: ${responseUrl} took ${duration}ms`);
        }
        networkRequests.delete(responseUrl);
      }
      
      // Capture response headers for main page
      if (responseUrl === originalUrl.href) {
        responseHeaders = response.headers();
      }
    });
    
    const timeoutValue = options && options.timeout !== undefined ? options.timeout : 60000;
    console.log(`[DEBUG] Navigating to URL: ${url} with timeout: ${timeoutValue}ms`);
    const navigationStart = Date.now();
    
    // Set up timeout warning
    const timeoutWarning = setTimeout(() => {
      console.log(`[DEBUG] WARNING: Navigation taking longer than ${Math.floor(timeoutValue/2)}ms for: ${url}`);
    }, Math.floor(timeoutValue/2));
    
    const response = await page.goto(url, {timeout: timeoutValue});
    clearTimeout(timeoutWarning);
    
    const navigationTime = Date.now() - navigationStart;
    const resp_status = response.status();
    console.log(`[DEBUG] Page navigation completed in ${navigationTime}ms, status: ${resp_status}`);
    
    // Handle form submission if form data is provided
    if (formData && formSelector) {
      console.log(`[DEBUG] Form submission requested - selector: ${formSelector}`);
      try {
        // Wait for the form to be available
        console.log(`[DEBUG] Waiting for form selector: ${formSelector}`);
        await page.waitForSelector(formSelector, {timeout: 5000});
        console.log(`[DEBUG] Form selector found`);
        
        // Fill in the form data
        console.log(`[DEBUG] Filling form with data:`, formData);
        for (const [fieldName, fieldValue] of Object.entries(formData)) {
          const selector = `${formSelector} [name="${fieldName}"]`;
          console.log(`[DEBUG] Filling field: ${fieldName}`);
          try {
            await page.waitForSelector(selector, {timeout: 5000});
            await page.type(selector, fieldValue);
          } catch (fieldError) {
            console.log(`[DEBUG] Field not found: ${fieldName}`, fieldError);
          }
        }
        
        // Submit the form
        console.log(`[DEBUG] Submitting form`);
        if (submitSelector) {
          console.log(`[DEBUG] Clicking submit button: ${submitSelector}`);
          await page.click(submitSelector);
        } else {
          console.log(`[DEBUG] Programmatically submitting form`);
          await page.evaluate((formSel) => {
            document.querySelector(formSel).submit();
          }, formSelector);
        }
        
        // Wait for navigation to complete
        console.log(`[DEBUG] Waiting for navigation after form submission`);
        const formNavStart = Date.now();
        
        // Set up timeout warning for form navigation
        const formTimeoutWarning = setTimeout(() => {
          console.log(`[DEBUG] WARNING: Form navigation taking longer than 15s for: ${url}`);
        }, 15000);
        
        await page.waitForNavigation({timeout: 30000});
        clearTimeout(formTimeoutWarning);
        
        const formNavTime = Date.now() - formNavStart;
        console.log(`[DEBUG] Form submission navigation completed in ${formNavTime}ms`);
      } catch (formError) {
        console.log("[DEBUG] Form submission error:", formError);
      }
    }
    
    console.log(`[DEBUG] Getting final URL and page content`);
    const finalUrl = page.url();
    const contentStart = Date.now();
    const content = await page.content();
    const contentTime = Date.now() - contentStart;
    console.log(`[DEBUG] Page content retrieved in ${contentTime}ms, content length: ${content.length}`);
    const endTime = Date.now();
    const loadTime = endTime - startTime;
    
    let url_string = "'" + url + "'";
    if(finalUrl !== url) {
      url_string = "'" + url + "' -> '" + finalUrl + "'";
    }
    console.log(`[DEBUG] Fetched ${url_string} status: ${resp_status} (${loadTime/1000}s)`);
    console.log(`[DEBUG] Supabase API calls detected: ${supabaseCalls.length}`);
    
    // Set the captured response headers to the actual response JSON
    servedRequests++;
    console.log(`[DEBUG] Render completed successfully for: ${url}`);
    
    // Prepare the response JSON
    const responseJson = {
      page: content,
      status: resp_status,
      headers: responseHeaders,
      finalUrl: finalUrl,
      supabaseCalls: supabaseCalls
    };
    
    res.status(200).json(responseJson);
    console.log(`[DEBUG] Closing browser`);
    await browser.close();
    console.log(`[DEBUG] Browser closed`);
  } catch (error) {
    errorCount++;
    console.log(`[DEBUG] ERROR occurred for URL ${url}:`, error.message);
    console.log(`[DEBUG] Full error stack:`, error.stack);
    res.status(500).json({ error: 'An error occurred: ' + error.message });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

module.exports = app;