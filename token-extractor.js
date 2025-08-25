const puppeteer = require('puppeteer');

// Hardcoded endpoints
const AMAZON_WEBSITE_URL = 'https://hiring.amazon.ca/app#/jobSearch';
const AMAZON_GRAPHQL_URL = 'https://e5mquma77feepi2bdn4d6h3mpu.appsync-api.us-east-1.amazonaws.com/graphql';

// Global variables
let browser = null;
let page = null;

// Initialize fresh browser window and clean any existing browser/data
async function initializeFreshBrowser() {
    try {
        console.log(`[${new Date().toISOString()}] 🧹 Cleaning any existing browser instances...`);
        
        // Close existing browser if it exists
        if (browser) {
            try {
                await browser.close();
                console.log(`[${new Date().toISOString()}] ✅ Closed existing browser instance`);
            } catch (error) {
                console.log(`[${new Date().toISOString()}] ⚠️  Error closing existing browser (continuing):`, error.message);
            }
        }
        
        // Clear browser and page references
        browser = null;
        page = null;
        
        console.log(`[${new Date().toISOString()}] 🚀 Initializing fresh browser window for token extraction...`);
        
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu',
                '--disable-web-security',
                '--disable-features=VizDisplayCompositor',
                '--disable-extensions',
                '--disable-plugins'
            ]
        });
        
        page = await browser.newPage();
        
        // Set user agent
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        console.log(`[${new Date().toISOString()}] ✅ Fresh browser initialized successfully`);
        
    } catch (error) {
        console.error(`[${new Date().toISOString()}] ❌ Error initializing fresh browser:`, error.message);
        throw error;
    }
}

// Extract auth token from Amazon hiring page
async function extractAuthToken() {
    try {
        console.log(`[${new Date().toISOString()}] 🚀 Starting token extraction process...`);
        
        // Navigate to Amazon hiring page
        console.log(`[${new Date().toISOString()}] 📡 Navigating to Amazon website: ${AMAZON_WEBSITE_URL}`);
        const response = await page.goto(AMAZON_WEBSITE_URL, {
            waitUntil: 'networkidle0',
            timeout: 30000
        });
        
        console.log(`[${new Date().toISOString()}] 📥 Page response: ${response.status()} ${response.statusText()}`);
        console.log(`[${new Date().toISOString()}] 🌐 Final URL: ${page.url()}`);
        
        // Wait for page to load
        console.log(`[${new Date().toISOString()}] ⏱️  Waiting for page to fully load...`);
        await new Promise(resolve => setTimeout(resolve, 15000));
        
        console.log(`[${new Date().toISOString()}] 📄 Page title: ${await page.title()}`);
        console.log(`[${new Date().toISOString()}] 🔗 Current URL: ${page.url()}`);
        
        // Extract token
        console.log(`[${new Date().toISOString()}] 🔍 Scanning for JWT tokens...`);
        
        const extractedData = await page.evaluate(() => {
            try {
                let tokenData = null;
                
                // Method 1: Check localStorage for sessionToken
                const sessionToken = localStorage.getItem('sessionToken');
                if (sessionToken && sessionToken.startsWith('eyJ')) {
                    console.log('✅ Found JWT sessionToken in localStorage');
                    tokenData = {
                        token: sessionToken,
                        source: 'localStorage[sessionToken]',
                        type: 'JWT'
                    };
                }
                
                // Method 2: Check all localStorage items
                if (!tokenData) {
                    for (let i = 0; i < localStorage.length; i++) {
                        const key = localStorage.key(i);
                        const value = localStorage.getItem(key);
                        
                        if (value && value.startsWith('eyJ') && value.length > 100) {
                            console.log(`✅ Found JWT token in localStorage[${key}]`);
                            tokenData = {
                                token: value,
                                source: `localStorage[${key}]`,
                                type: 'JWT'
                            };
                            break;
                        }
                    }
                }
                
                // Method 3: Check sessionStorage
                if (!tokenData) {
                    for (let i = 0; i < sessionStorage.length; i++) {
                        const key = sessionStorage.key(i);
                        const value = sessionStorage.getItem(key);
                        
                        if (value && value.startsWith('eyJ') && value.length > 100) {
                            console.log(`✅ Found JWT token in sessionStorage[${key}]`);
                            tokenData = {
                                token: value,
                                source: `sessionStorage[${key}]`,
                                type: 'JWT'
                            };
                            break;
                        }
                    }
                }
                
                if (!tokenData) {
                    console.log('❌ No JWT tokens found in storage');
                    return null;
                }
                
                return tokenData;
                
            } catch (error) {
                console.error('❌ Error during token extraction:', error.message);
                return null;
            }
        });
        
        if (!extractedData || !extractedData.token) {
            throw new Error('No JWT token found in localStorage or sessionStorage');
        }
        
        console.log(`[${new Date().toISOString()}] ✅ Token extracted successfully!`);
        console.log(`[${new Date().toISOString()}] 🔑 Source: ${extractedData.source}`);
        console.log(`[${new Date().toISOString()}] 🔑 Token: ${extractedData.token.substring(0, 50)}...`);
        
        return extractedData.token;
        
    } catch (error) {
        console.error(`[${new Date().toISOString()}] ❌ Error extracting auth token:`, error.message);
        throw error;
    }
}

// Test token validity against GraphQL endpoint
async function validateTokenWithServer(token) {
    try {
        console.log(`[${new Date().toISOString()}] 🔍 Testing token validity against server...`);
        
        const fetch = require('node-fetch');
        
        const headers = {
            'accept': '*/*',
            'accept-language': 'en-CA,en;q=0.9',
            'authorization': `Bearer ${token}`,
            'content-type': 'application/json',
            'country': 'Canada',
            'iscanary': 'false',
            'origin': 'https://hiring.amazon.ca',
            'referer': 'https://hiring.amazon.ca/',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'x-amz-user-agent': 'aws-amplify/5.0.0'
        };
        
        const testQuery = {
            "operationName": "searchJobCardsByLocation",
            "variables": {
                "searchJobRequest": {
                    "locale": "en-CA",
                    "country": "Canada",
                    "keyWords": "",
                    "equalFilters": [],
                    "containFilters": [
                        {
                            "key": "isPrivateSchedule",
                            "val": ["false"]
                        }
                    ],
                    "rangeFilters": [{
                        "key": "hoursPerWeek",
                        "range": {
                            "minimum": 0,
                            "maximum": 50
                        }
                    }],
                    "dateFilters": [{
                        "key": "firstDayOnSite",
                        "range": { "startDate": new Date().toISOString().split('T')[0] }
                    }],
                    "sorters": [],
                    "pageSize": 1,
                    "consolidateSchedule": true
                }
            },
            "query": `query searchJobCardsByLocation($searchJobRequest: SearchJobRequest!) {
                searchJobCardsByLocation(searchJobRequest: $searchJobRequest) {
                    nextToken
                    jobCards {
                        jobId
                        jobTitle
                    }
                }
            }`
        };
        
        console.log(`[${new Date().toISOString()}] 📤 Sending validation request to server...`);
        
        const response = await fetch(AMAZON_GRAPHQL_URL, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(testQuery)
        });
        
        console.log(`[${new Date().toISOString()}] 📥 Validation response: ${response.status} ${response.statusText}`);
        
        if (response.status === 200) {
            console.log(`[${new Date().toISOString()}] ✅ Token is VALID!`);
            return { isValid: true, token: token };
        } else {
            console.log(`[${new Date().toISOString()}] ❌ Token validation failed: ${response.status}`);
            return { isValid: false, token: null };
        }
        
    } catch (error) {
        console.error(`[${new Date().toISOString()}] ❌ Error validating token with server:`, error.message);
        return { isValid: false, token: null };
    }
}

// Main token extraction function with retry logic
async function getValidToken(maxRetries = 3) {
    let attempts = 0;
    
    while (attempts < maxRetries) {
        attempts++;
        console.log(`[${new Date().toISOString()}] 🔄 Token extraction attempt ${attempts}/${maxRetries}`);
        
        try {
            // Initialize fresh browser (clears any old data)
            await initializeFreshBrowser();
            
            // Extract token
            const token = await extractAuthToken();
            
            // Validate token
            const validation = await validateTokenWithServer(token);
            
            if (validation.isValid) {
                console.log(`[${new Date().toISOString()}] 🎉 Valid token obtained successfully!`);
                
                // 🧹 Garbage collection after successful token extraction
                if (global.gc) {
                    global.gc();
                }
                
                return validation.token;
            } else {
                console.log(`[${new Date().toISOString()}] ❌ Token validation failed, retrying...`);
                if (attempts < maxRetries) {
                    console.log(`[${new Date().toISOString()}] ⏱️  Waiting 10 seconds before retry...`);
                    await new Promise(resolve => setTimeout(resolve, 10000));
                }
            }
            
        } catch (error) {
            console.error(`[${new Date().toISOString()}] ❌ Error in attempt ${attempts}:`, error.message);
            
            // 🧹 Garbage collection on error recovery
            if (global.gc) {
                global.gc();
            }
            
            if (attempts < maxRetries) {
                console.log(`[${new Date().toISOString()}] ⏱️  Waiting 10 seconds before retry...`);
                await new Promise(resolve => setTimeout(resolve, 10000));
            }
        }
    }
    
    throw new Error(`Failed to obtain valid token after ${maxRetries} attempts`);
}

// Cleanup function
async function cleanup() {
    if (browser) {
        try {
            await browser.close();
            console.log(`[${new Date().toISOString()}] ✅ Browser closed`);
        } catch (error) {
            console.log(`[${new Date().toISOString()}] ⚠️  Error closing browser:`, error.message);
        }
    }
    
    // 🧹 Final garbage collection during cleanup
    if (global.gc) {
        global.gc();
        console.log(`[${new Date().toISOString()}] 🧹 Final garbage collection completed`);
    }
}

// Export functions
module.exports = {
    getValidToken,
    cleanup,
    validateTokenWithServer
};

// If run directly, test the token extraction
if (require.main === module) {
    console.log('🧪 Testing Token Extraction Module');
    console.log('==================================');
    
    getValidToken()
        .then(token => {
            console.log('✅ Token extraction test successful!');
            console.log(`🔑 Token: ${token.substring(0, 50)}...`);
        })
        .catch(error => {
            console.error('❌ Token extraction test failed:', error.message);
        })
        .finally(async () => {
            await cleanup();
            process.exit(0);
        });
}
