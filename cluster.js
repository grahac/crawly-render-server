const { Cluster } = require('puppeteer-cluster');
const express = require('express');

let servedRequests = 0;
let errorCount = 0;

const app = express();
const port = 3000;

app.use(express.json());
// Function to log server stats
const logServerStats = () => {
    console.log(`Served Requests: ${servedRequests}`);
    console.log(`Error Count: ${errorCount}`);
};

// Log server stats every minute (60,000 milliseconds)
setInterval(logServerStats, 60000);

// Define your launch options here
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
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--memory-pressure-off',
        // '--single-process',

    ],
};
if (process.env.CHROME_EXECUTABLE_PATH) {
    launchOptions.executablePath = process.env.CHROME_EXECUTABLE_PATH;
};

let max_concurrency = 2;
if (process.env.MAX_CONCURRENCY) {
    max_concurrency = parseInt(process.env.MAX_CONCURRENCY, 10);
  };

(async () => {
    // Create a cluster with N workers
    const cluster = await Cluster.launch({
        concurrency: Cluster.CONCURRENCY_CONTEXT,
        maxConcurrency: max_concurrency,
        puppeteerOptions: launchOptions,
    });

    // Define a task
    cluster.task(async ({ page, data: {url, headers, formData, formSelector, submitSelector} }) => {
        const startTime = Date.now();
        console.log(`[DEBUG] Starting render for URL: ${url}`);
        
        // Set a real user-agent to avoid bot detection
        console.log(`[DEBUG] Setting user agent`);
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        if (headers) {
            console.log(`[DEBUG] Setting custom headers:`, headers);
            for (const [name, value] of Object.entries(headers)) {
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
            const failure = request.failure();
            const errorText = failure ? failure.errorText : 'Unknown error';
            console.log(`[DEBUG] Request failed: ${request.url()} - ${errorText}`);
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
        
        page.on('response', (response) => {
            const responseUrl = response.url();
            const requestInfo = networkRequests.get(responseUrl);
            if (requestInfo) {
                const duration = Date.now() - requestInfo.startTime;
                console.log(`[DEBUG] Network request: ${requestInfo.method} ${responseUrl} - ${response.status()} (${duration}ms)`);
                if (duration > 5000) {
                    console.log(`[DEBUG] SLOW REQUEST detected: ${responseUrl} took ${duration}ms`);
                }
                networkRequests.delete(responseUrl);
            }
        });
        
        console.log(`[DEBUG] Navigating to URL: ${url}`);
        const navigationStart = Date.now();
        
        // Set up timeout warning
        const timeoutWarning = setTimeout(() => {
            console.log(`[DEBUG] WARNING: Navigation taking longer than 30s for: ${url}`);
        }, 30000);
        
        const response = await page.goto(url, {timeout: 60000});
        clearTimeout(timeoutWarning);
        
        const navigationTime = Date.now() - navigationStart;
        const status_code = response.status();
        console.log(`[DEBUG] Page navigation completed in ${navigationTime}ms, status: ${status_code}`);
        
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
                    await page.waitForSelector(selector, {timeout: 5000});
                    await page.type(selector, fieldValue);
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
        const pageBody = await page.content();
        const contentTime = Date.now() - contentStart;
        console.log(`[DEBUG] Page content retrieved in ${contentTime}ms, content length: ${pageBody.length}`);
        const endTime = Date.now();
        const loadTime = endTime - startTime;
        let url_string = "'" + url + "'";
        if(finalUrl != url)
            url_string = "'" + url + "' -> '" + finalUrl + "'";
        tpl = `[DEBUG] Fetched ${url_string} status: ${status_code} (${loadTime/1000}s)`;
        console.log(tpl);
        console.log(`[DEBUG] Supabase API calls detected: ${supabaseCalls.length}`);
        servedRequests++;
        console.log(`[DEBUG] Render completed successfully for: ${url}`);
        return {
            page: pageBody, 
            status: status_code, 
            headers: response.headers(),
            finalUrl: finalUrl,
            supabaseCalls: supabaseCalls
        };
    });

    // Bearer token authentication middleware
    const authenticateToken = (req, res, next) => {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
        const expectedToken = process.env.CRAWLY_BEARER_TOKEN;
        
        if (!expectedToken) {
            return res.status(500).json({ error: 'Server misconfiguration: CRAWLY_BEARER_TOKEN not set' });
        }
        
        if (token !== expectedToken) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        
        next();
    };

    // Define a route for receiving URLs via POST requests
    app.post('/render', authenticateToken, async (req, res) => {
        const { url, headers, formData, formSelector, submitSelector } = req.body;

        if (!url) {
            return res.status(400).json({ error: 'URL parameter is required.' });
        }

        try {
            const result = await cluster.execute({
                url, 
                headers, 
                formData, 
                formSelector, 
                submitSelector
            });
            res.status(200).json(result);
        } catch (err) {
            errorCount++;
            console.debug("[DEBUG] Could not get '" + url + "' Error: " + err);
            res.status(500).json({ error: 'An error occurred while processing the URL.' + err });
        }
    });

    // Start the Express server
    app.listen(port, '0.0.0.0', () => {
        console.log(`Server is running on port ${port}`);
    });

    // Shutdown the cluster and close Express server on process termination
    process.on('SIGINT', async () => {
        await cluster.idle();
        await cluster.close();
        process.exit();
    });
})();
