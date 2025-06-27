const chai = require('chai');
const chaiHttp = require('chai-http');
const { expect } = chai;
const express = require('express');
const { Cluster } = require('puppeteer-cluster');

chai.use(chaiHttp);

// Create a test server with the same logic as cluster.js
// but with testing-specific configurations
const createTestServer = async (port) => {
  const app = express();
  app.use(express.json());
  
  const cluster = await Cluster.launch({
    concurrency: Cluster.CONCURRENCY_CONTEXT,
    maxConcurrency: 1, // Use a single instance for testing
    puppeteerOptions: {
      headless: "new",
      args: ['--no-sandbox', '--disable-gpu'],
    },
  });

  // Define the task same as in cluster.js
  cluster.task(async ({ page, data: {url, headers, formData, formSelector, submitSelector} }) => {
    const startTime = Date.now();
    
    // Set a real user-agent to avoid bot detection
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    if (headers) {
      for (const [name, value] of Object.entries(headers)) {
        await page.setExtraHTTPHeaders({ [name]: value });
      }
    }
    
    // Collection of Supabase API calls
    const supabaseCalls = [];
    
    // Monitor network requests to track Supabase API calls
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const url = request.url();
      const headers = request.headers();
      
      // Check if this is a Supabase request (look for API key and authorization)
      if (url.includes('supabase') && 
          (headers['apikey'] || 
            headers['Authorization'] || 
            headers['authorization'])) {
        supabaseCalls.push({
          url: url,
          method: request.method(),
          headers: headers,
          postData: request.postData()
        });
      }
      
      request.continue();
    });
    
    const response = await page.goto(url, {timeout: 60000});
    const status_code = response.status();
    
    // Handle form submission if form data is provided
    if (formData && formSelector) {
      try {
        // Wait for the form to be available
        await page.waitForSelector(formSelector, {timeout: 5000});
        
        // Fill in the form data
        for (const [fieldName, fieldValue] of Object.entries(formData)) {
          const selector = `${formSelector} [name="${fieldName}"]`;
          await page.waitForSelector(selector, {timeout: 5000});
          await page.type(selector, fieldValue);
        }
        
        // Submit the form
        if (submitSelector) {
          await page.click(submitSelector);
        } else {
          await page.evaluate((formSel) => {
            document.querySelector(formSel).submit();
          }, formSelector);
        }
        
        // Wait for navigation to complete
        await page.waitForNavigation({timeout: 30000});
      } catch (formError) {
        console.log("[DEBUG] Form submission error:", formError);
      }
    }
    
    const finalUrl = page.url();
    const pageBody = await page.content();
    
    return {
      page: pageBody, 
      status: status_code, 
      headers: response.headers(),
      finalUrl: finalUrl,
      supabaseCalls: supabaseCalls
    };
  });

  // Set up route handler
  app.post('/render', async (req, res) => {
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
      console.debug("[DEBUG] Could not get '" + url + "' Error: " + err);
      res.status(500).json({ error: 'An error occurred while processing the URL.' + err });
    }
  });

  const server = app.listen(port);
  
  // Add a cleanup method to close the cluster
  server.closeAll = async () => {
    await cluster.idle();
    await cluster.close();
    server.close();
  };
  
  return server;
};

describe('/render Endpoint Tests', () => {
  let server;

  before(async function() {
    this.timeout(30000); // Increase timeout for puppeteer setup
    server = await createTestServer(4000);
  });

  after(async function() {
    this.timeout(10000); // Increase timeout for cleanup
    await server.closeAll();
  });

  it('should return an error if URL is missing', async () => {
    const res = await chai.request('http://localhost:4000')
      .post('/render')
      .send({});

    expect(res).to.have.status(400);
    expect(res.body).to.have.property('error');
  });

  it("should render a page correctly", async function() {
    this.timeout(15000); // Increase timeout for page rendering
    const res = await chai.request('http://localhost:4000')
      .post('/render')
      .send({
        url: "https://example.com"
      });

    expect(res).to.have.status(200);
    expect(res.body).to.have.property('page');
    expect(res.body.page).to.include('<h1>Example Domain</h1>');
    expect(res.body).to.have.property('supabaseCalls').that.is.an('array');
  });

  it('should handle form submission', async function() {
    this.timeout(20000); // Increase timeout for form submission
    const res = await chai.request('http://localhost:4000')
      .post('/render')
      .send({
        url: "https://httpbin.org/forms/post",
        formData: {
          custname: "Test User",
          custtel: "123-456-7890",
          custemail: "test@example.com",
          comments: "Test comment"
        },
        formSelector: "form"
      });

    expect(res).to.have.status(200);
    expect(res.body).to.have.property('finalUrl');
    expect(res.body.finalUrl).to.include('httpbin.org');
    // The form response content should contain our submitted data
    expect(res.body.page).to.include('Test User');
    expect(res.body.page).to.include('123-456-7890');
  });

  it('should track Supabase API calls', async function() {
    this.timeout(15000);
    // Note: This test will only track Supabase calls if the page makes them
    // For testing purposes, we're just verifying the structure is returned
    const res = await chai.request('http://localhost:4000')
      .post('/render')
      .send({
        url: "https://example.com"
      });

    expect(res).to.have.status(200);
    expect(res.body).to.have.property('supabaseCalls').that.is.an('array');
  });

  it('should handle errors gracefully', async () => {
    const res = await chai.request('http://localhost:4000')
      .post('/render')
      .send({
        url: 'invalid-url'
      });

    expect(res).to.have.status(500);
    expect(res.body).to.have.property('error');
  });
});
