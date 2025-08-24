const fetch = require('node-fetch');
const puppeteer = require('puppeteer');
const readline = require('readline');

// Hardcoded endpoints - no more configuration needed
const AMAZON_WEBSITE_URL = 'https://hiring.amazon.ca/app#/jobSearch';
const AMAZON_GRAPHQL_URL = 'https://e5mquma77feepi2bdn4d6h3mpu.appsync-api.us-east-1.amazonaws.com/graphql';
const POLLING_INTERVAL = 1000; // 1 second
const MAX_JOBS_PER_ALERT = 999;
const TOKEN_REFRESH_INTERVAL = 55 * 60 * 1000; // 55 minutes (refresh before 59-minute expiry)

// Simple setup function - only Telegram credentials
async function setupTelegramCredentials() {
    console.log('🤖 Amazon Job Monitor - Automated Token Extraction');
    console.log('================================================\n');
    
    // Check for environment variables first (for PM2/background compatibility)
    if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHANNEL_ID) {
        console.log('📱 Using Telegram credentials from environment variables');
        console.log('✅ Telegram credentials loaded from environment!');
        console.log(`🌐 Using hardcoded endpoints:`);
        console.log(`   Website: ${AMAZON_WEBSITE_URL}`);
        console.log(`   GraphQL: ${AMAZON_GRAPHQL_URL}`);
        console.log(`   Polling: ${POLLING_INTERVAL}ms`);
        console.log(`   Token Refresh: Every 55 minutes\n`);
        
        return {
            TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN.trim(),
            TELEGRAM_CHANNEL_ID: process.env.TELEGRAM_CHANNEL_ID.trim()
        };
    }
    
    // Fall back to interactive input if no environment variables
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const question = (prompt) => {
        return new Promise((resolve) => {
            rl.question(prompt, resolve);
        });
    };

    console.log('📱 Please provide your Telegram credentials:\n');

    // Get Telegram Bot Token
    let telegramBotToken = await question('Enter your Telegram Bot Token: ');
    while (!telegramBotToken.trim()) {
        console.log('❌ Telegram Bot Token is required!');
        telegramBotToken = await question('Enter your Telegram Bot Token: ');
    }

    // Get Telegram Channel ID
    let telegramChannelId = await question('Enter your Telegram Channel ID (e.g., @channelname): ');
    while (!telegramChannelId.trim()) {
        console.log('❌ Telegram Channel ID is required!');
        telegramChannelId = await question('Enter your Telegram Channel ID: ');
    }

    rl.close();

    console.log('\n✅ Telegram credentials saved!');
    console.log(`🌐 Using hardcoded endpoints:`);
    console.log(`   Website: ${AMAZON_WEBSITE_URL}`);
    console.log(`   GraphQL: ${AMAZON_GRAPHQL_URL}`);
    console.log(`   Polling: ${POLLING_INTERVAL}ms`);
    console.log(`   Token Refresh: Every 55 minutes\n`);

    return {
        TELEGRAM_BOT_TOKEN: telegramBotToken.trim(),
        TELEGRAM_CHANNEL_ID: telegramChannelId.trim()
    };
}

// Configuration
let config = null;

// Track seen jobs and token management
let seenJobIds = new Set();
let lastPollTime = new Date();
let currentAuthToken = null;
let tokenExpiryTime = null;
let browser = null;
let page = null;
let tokenRefreshInterval = null;

// Amazon GraphQL Query
const amazonQuery = {
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
            "pageSize": 50,
            "consolidateSchedule": true
        }
    },
    "query": `query searchJobCardsByLocation($searchJobRequest: SearchJobRequest!) {
        searchJobCardsByLocation(searchJobRequest: $searchJobRequest) {
            nextToken
            jobCards {
                jobId
                jobTitle
                city
                state
                locationName
                totalPayRateMin
                totalPayRateMax
                currencyCode
                totalPayRateMinL10N
                totalPayRateMaxL10N
                bonusPay
                bonusPayL10N
                jobType
                employmentType
                jobTypeL10N
                employmentTypeL10N
                scheduleCount
                featuredJob
                bonusJob
                tagLine
                bannerText
                geoClusterDescription
                distance
            }
        }
    }`
};

// Initialize browser for token extraction
async function initializeBrowser() {
    try {
        console.log(`[${new Date().toISOString()}] 🚀 Initializing browser for token extraction...`);
        
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu'
            ]
        });
        
        page = await browser.newPage();
        
        // Set user agent
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        console.log(`[${new Date().toISOString()}] ✅ Browser initialized successfully`);
        
    } catch (error) {
        console.error(`[${new Date().toISOString()}] ❌ Error initializing browser:`, error.message);
        throw error;
    }
}

// Decode JWT token to get expiration
function decodeJWT(token) {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) {
            return null;
        }
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
        return payload;
    } catch (error) {
        console.error(`[${new Date().toISOString()}] ❌ Error decoding JWT:`, error.message);
        return null;
    }
}

// Extract auth token from Amazon hiring page using proven method
async function extractAuthToken(retryCount = 0) {
    const maxRetries = 3;
    try {
        console.log(`[${new Date().toISOString()}] 🚀 Starting token extraction process... (Attempt ${retryCount + 1}/${maxRetries + 1})`);
        
        // Navigate to Amazon hiring page
        console.log(`[${new Date().toISOString()}] 📡 Navigating to Amazon website...`);
        await page.goto(AMAZON_WEBSITE_URL, {
            waitUntil: 'networkidle0',
            timeout: 30000
        });
        
        console.log(`[${new Date().toISOString()}] ⏱️  Waiting for page to fully load...`);
        await new Promise(resolve => setTimeout(resolve, 15000)); // 15 seconds wait for better token generation
        
        console.log(`[${new Date().toISOString()}] 🔍 Scanning for JWT tokens...`);
        
        // Extract the JWT token and API key from localStorage using our proven method
        const extractedData = await page.evaluate(() => {
            try {
                let tokenData = null;
                let apiKey = null;
                
                // Method 1: Check localStorage for sessionToken (our target)
                const sessionToken = localStorage.getItem('sessionToken');
                if (sessionToken && sessionToken.startsWith('eyJ')) {
                    console.log('✅ Found JWT sessionToken in localStorage');
                    tokenData = {
                        token: sessionToken,
                        source: 'localStorage[sessionToken]',
                        type: 'JWT'
                    };
                }
                
                // Method 2: Check all localStorage items for JWT tokens
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
                
                // Extract API key from window.__AMPLIFY_CONFIG__ or scripts
                try {
                    if (window.__AMPLIFY_CONFIG__ && window.__AMPLIFY_CONFIG__.aws_appsync_apiKey) {
                        apiKey = window.__AMPLIFY_CONFIG__.aws_appsync_apiKey;
                        console.log('✅ Found API key in __AMPLIFY_CONFIG__');
                    } else {
                        // Look for API key in script tags
                        const scripts = document.querySelectorAll('script');
                        for (const script of scripts) {
                            const content = script.textContent || script.innerHTML;
                            const apiKeyMatch = content.match(/["']da2-[a-zA-Z0-9]{26}["']/);
                            if (apiKeyMatch) {
                                apiKey = apiKeyMatch[0].replace(/["']/g, '');
                                console.log('✅ Found API key in script content');
                                break;
                            }
                        }
                    }
                } catch (e) {
                    console.log('⚠️  Could not extract API key');
                }
                
                if (!tokenData) {
                    console.log('❌ No JWT tokens found in storage');
                    return null;
                }
                
                return {
                    ...tokenData,
                    apiKey: apiKey
                };
                
            } catch (error) {
                console.error('❌ Error during token extraction:', error.message);
                return null;
            }
        });
        
        if (!extractedData || !extractedData.token) {
            throw new Error('No JWT token found in localStorage or sessionStorage');
        }
        
        console.log(`[${new Date().toISOString()}] ✅ Token extracted successfully!`);
        
        // Store the API key globally for use in requests
        if (extractedData.apiKey) {
            console.log(`[${new Date().toISOString()}] ✅ API key extracted: ${extractedData.apiKey.substring(0, 20)}...`);
            global.amazonApiKey = extractedData.apiKey;
        }
        
        // Decode JWT to get expiration
        const decoded = decodeJWT(extractedData.token);
        if (decoded && decoded.exp) {
            const expiryDate = new Date(decoded.exp * 1000);
            const timeLeft = expiryDate.getTime() - Date.now();
            const minutesLeft = Math.floor(timeLeft / 60000);
            const secondsLeft = Math.floor((timeLeft % 60000) / 1000);
            
            // Check if token is already expired or expires very soon (less than 5 minutes)
            if (timeLeft <= 0) {
                console.log(`[${new Date().toISOString()}] ⚠️  Token is already expired (${minutesLeft}m ${secondsLeft}s ago).`);
                if (retryCount < maxRetries) {
                    console.log(`[${new Date().toISOString()}] 🔄 Waiting 30 seconds for fresh token generation...`);
                    await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30 seconds
                    console.log(`[${new Date().toISOString()}] 🔄 Retrying token extraction with fresh page visit...`);
                    return await extractAuthToken(retryCount + 1); // Recursive retry with fresh page visit
                } else {
                    throw new Error(`Unable to get a valid token after ${maxRetries + 1} attempts`);
                }
            } else if (timeLeft < 5 * 60 * 1000) {
                console.log(`[${new Date().toISOString()}] ⚠️  Token expires too soon (${minutesLeft}m ${secondsLeft}s).`);
                if (retryCount < maxRetries) {
                    console.log(`[${new Date().toISOString()}] 🔄 Waiting 30 seconds for fresh token generation...`);
                    await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30 seconds
                    console.log(`[${new Date().toISOString()}] 🔄 Retrying token extraction with fresh page visit...`);
                    return await extractAuthToken(retryCount + 1); // Recursive retry with fresh page visit
                } else {
                    console.log(`[${new Date().toISOString()}] ⚠️  Using short-lived token as fallback after ${maxRetries + 1} attempts`);
                }
            }
            
            // Print in the exact format you requested
            console.log(`\n🔑 Token Extraction Results:`);
            console.log(`   Source: ${extractedData.source}`);
            console.log(`   URL: localStorage`);
            console.log(`   Token: ${extractedData.token.substring(0, 50)}...`);
            console.log(`   Type: JWT Token`);
            console.log(`   Issued: ${new Date(decoded.iat * 1000).toISOString()}`);
            console.log(`   Expires: ✅ Expires in ${minutesLeft}m ${secondsLeft}s (${expiryDate.toISOString()})`);
            if (extractedData.apiKey) {
                console.log(`   API Key: ${extractedData.apiKey.substring(0, 20)}...`);
            }
            console.log('');
            
            currentAuthToken = extractedData.token;
            tokenExpiryTime = expiryDate;
            
            // Test the token immediately
            console.log(`[${new Date().toISOString()}] 🧪 Testing token with GraphQL endpoint...`);
            await testToken(extractedData.token);
            
            return extractedData.token;
        } else {
            console.log(`[${new Date().toISOString()}] ⚠️  Warning: Could not decode JWT expiration, assuming 59 minutes`);
            currentAuthToken = extractedData.token;
            tokenExpiryTime = new Date(Date.now() + 59 * 60 * 1000); // 59 minutes from now
            return extractedData.token;
        }
        
    } catch (error) {
        console.error(`[${new Date().toISOString()}] ❌ Error extracting auth token:`, error.message);
        throw error;
    }
}

// Test if the extracted token works
async function testToken(token) {
    try {
        const testResponse = await fetch(AMAZON_GRAPHQL_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                query: '{ __schema { types { name } } }'
            })
        });
        
        console.log(`[${new Date().toISOString()}] 🧪 Token test result: ${testResponse.status} ${testResponse.statusText}`);
        
        if (testResponse.ok) {
            console.log(`[${new Date().toISOString()}] ✅ Token is valid and working!`);
        } else if (testResponse.status === 403) {
            console.log(`[${new Date().toISOString()}] ⚠️  Token received 403 - may need specific query format`);
        } else {
            console.log(`[${new Date().toISOString()}] ❌ Token test failed`);
        }
        
    } catch (error) {
        console.log(`[${new Date().toISOString()}] ❌ Error testing token: ${error.message}`);
    }
}

// Check if token needs refresh
function isTokenExpired() {
    if (!currentAuthToken || !tokenExpiryTime) {
        return true;
    }
    
    // Refresh token 10 minutes before expiry (was 5 minutes)
    const tenMinutesBeforeExpiry = new Date(tokenExpiryTime.getTime() - 10 * 60 * 1000);
    const isExpired = new Date() > tenMinutesBeforeExpiry;
    
    if (isExpired) {
        console.log(`[${new Date().toISOString()}] 🕐 Token will expire soon. Current time: ${new Date().toISOString()}, Expiry: ${tokenExpiryTime.toISOString()}`);
    }
    
    return isExpired;
}

// Refresh auth token
async function refreshAuthToken() {
    try {
        console.log(`[${new Date().toISOString()}] 🔄 Refreshing auth token...`);
        
        if (!browser || !page) {
            await initializeBrowser();
        }
        
        const newToken = await extractAuthToken();
        console.log(`[${new Date().toISOString()}] ✅ Auth token refreshed successfully`);
        return newToken;
        
    } catch (error) {
        console.error(`[${new Date().toISOString()}] ❌ Error refreshing auth token:`, error.message);
        throw error;
    }
}

// Fetch jobs from Amazon API with comprehensive logging
async function fetchAmazonJobs() {
    try {
        console.log(`[${new Date().toISOString()}] 🔄 Starting job fetch cycle...`);
        
        // Check if token needs refresh
        if (isTokenExpired()) {
            console.log(`[${new Date().toISOString()}] ⚠️  Token expired, refreshing...`);
            await refreshAuthToken();
        }
        
        if (!currentAuthToken) {
            throw new Error('No auth token available');
        }
        
        // Calculate time until token expires
        const timeUntilExpiry = tokenExpiryTime ? Math.floor((tokenExpiryTime.getTime() - Date.now()) / 60000) : 'Unknown';
        console.log(`[${new Date().toISOString()}] 🔐 Using token (expires in ${timeUntilExpiry} minutes)`);
        console.log(`[${new Date().toISOString()}] 📡 Querying GraphQL endpoint: ${AMAZON_GRAPHQL_URL}`);
        
        const headers = {
            'accept': '*/*',
            'accept-language': 'en-CA,en;q=0.9',
            'authorization': `Bearer ${currentAuthToken}`,
            'content-type': 'application/json',
            'country': 'Canada',
            'iscanary': 'false',
            'origin': 'https://hiring.amazon.ca',
            'referer': 'https://hiring.amazon.ca/',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'x-amz-user-agent': 'aws-amplify/5.0.0'
        };
        
        // Add API key if we have one
        if (global.amazonApiKey) {
            headers['x-api-key'] = global.amazonApiKey;
            console.log(`[${new Date().toISOString()}] 🔑 Using extracted API key: ${global.amazonApiKey.substring(0, 20)}...`);
        } else {
            console.log(`[${new Date().toISOString()}] ⚠️  No API key available, using token only`);
        }
        
        console.log(`[${new Date().toISOString()}] 📤 Sending GraphQL query...`);
        
        const response = await fetch(AMAZON_GRAPHQL_URL, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(amazonQuery)
        });

        console.log(`[${new Date().toISOString()}] 📥 Response received: ${response.status} ${response.statusText}`);

        if (!response.ok) {
            if (response.status === 401) {
                console.log(`[${new Date().toISOString()}] ❌ 401 Unauthorized - Token expired, refreshing...`);
                await refreshAuthToken();
                console.log(`[${new Date().toISOString()}] 🔄 Retrying with new token...`);
                return await fetchAmazonJobs(); // Retry with new token
            } else if (response.status === 403) {
                console.log(`[${new Date().toISOString()}] ❌ 403 Forbidden - Token may be invalid or endpoint protected`);
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log(`[${new Date().toISOString()}] 📊 Response data received, parsing...`);
        
        if (data.errors) {
            console.error(`[${new Date().toISOString()}] ❌ GraphQL errors:`, data.errors);
            throw new Error(`API Error: ${data.errors[0].message}`);
        }

        if (!data.data || !data.data.searchJobCardsByLocation) {
            console.log(`[${new Date().toISOString()}] ⚠️  No job data in response structure`);
            console.log(`[${new Date().toISOString()}] 📝 Response structure:`, Object.keys(data));
            return [];
        }

        const jobs = data.data.searchJobCardsByLocation.jobCards || [];
        console.log(`[${new Date().toISOString()}] ✅ Successfully fetched ${jobs.length} jobs from Amazon API`);
        
        if (jobs.length > 0) {
            console.log(`[${new Date().toISOString()}] 📋 Sample job titles:`);
            jobs.slice(0, 3).forEach((job, index) => {
                console.log(`[${new Date().toISOString()}]    ${index + 1}. ${job.jobTitle} in ${job.city || job.locationName}`);
            });
        }
        
        return jobs;
        
    } catch (error) {
        console.error(`[${new Date().toISOString()}] ❌ Error fetching jobs:`, error.message);
        return [];
    }
}

// Format job for Telegram message
function formatJobForTelegram(job) {
    // Get current time in a readable format
    const now = new Date();
    const timeString = now.toLocaleString('en-CA', {
        timeZone: 'America/Toronto', // Eastern Time (Canada)
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
    
    let formatted = `-------------------------------------------\n`;
    formatted += `Shifts: ${job.scheduleCount || 1}\n`;
    formatted += `Location: ${job.locationName || job.city}\n`;
    formatted += `Type: ${job.jobTypeL10N || job.employmentTypeL10N || 'Flex Time'}\n`;
    formatted += `Job: ${job.jobTitle}\n`;
    
    if (job.totalPayRateMinL10N && job.totalPayRateMaxL10N) {
        formatted += `Pay: ${job.totalPayRateMinL10N} - ${job.totalPayRateMaxL10N}\n`;
    } else if (job.totalPayRateMinL10N) {
        formatted += `Pay: ${job.totalPayRateMinL10N} CAD\n`;
    } else {
        formatted += `Pay: See posting\n`;
    }
    
    formatted += `Time: ${timeString}\n`;
    formatted += `-------------------------------------------`;
    
    return formatted;
}

// Send Telegram alert with rate limiting protection
async function sendTelegramAlert(jobs) {
    try {
        if (!config.TELEGRAM_BOT_TOKEN || !config.TELEGRAM_CHANNEL_ID) {
            console.error(`[${new Date().toISOString()}] ❌ Telegram configuration missing!`);
            return;
        }

        console.log(`[${new Date().toISOString()}] 📱 Sending Telegram alerts for ${jobs.length} jobs...`);

        // Send individual job alerts to avoid rate limiting
        for (let i = 0; i < jobs.length && i < MAX_JOBS_PER_ALERT; i++) {
            const job = jobs[i];
            
            // Simple message with just the formatted job info
            const message = formatJobForTelegram(job);
            
            const telegramResponse = await fetch(`https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    chat_id: config.TELEGRAM_CHANNEL_ID,
                    text: message,
                    parse_mode: 'HTML'
                })
            });

            if (telegramResponse.status === 429) {
                console.log(`[${new Date().toISOString()}] ⚠️  Rate limited! Waiting 10 seconds...`);
                await new Promise(resolve => setTimeout(resolve, 10000));
                i--; // Retry this job
                continue;
            }

            if (!telegramResponse.ok) {
                console.error(`[${new Date().toISOString()}] ❌ Telegram API error: ${telegramResponse.status}`);
                continue;
            }

            const result = await telegramResponse.json();
            
            if (result.ok) {
                console.log(`[${new Date().toISOString()}] ✅ Job alert ${i + 1} sent successfully!`);
            } else {
                console.error(`[${new Date().toISOString()}] ❌ Telegram API error:`, result.description);
            }
            
            // Wait 2 seconds between messages to avoid rate limiting
            if (i < jobs.length - 1 && i < MAX_JOBS_PER_ALERT - 1) {
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
        
        console.log(`[${new Date().toISOString()}] 📱 Completed sending alerts for ${Math.min(jobs.length, MAX_JOBS_PER_ALERT)} jobs`);
        
    } catch (error) {
        console.error(`[${new Date().toISOString()}] ❌ Error sending Telegram alert:`, error.message);
    }
}

// Main polling function
async function pollForJobs() {
    try {
        const jobs = await fetchAmazonJobs();
        
        if (jobs.length === 0) {
            console.log(`[${new Date().toISOString()}] 📭 No jobs found in this cycle`);
            return;
        }
        
        // Filter for new jobs
        const newJobs = jobs.filter(job => !seenJobIds.has(job.jobId));
        
        if (newJobs.length > 0) {
            console.log(`[${new Date().toISOString()}] 🎉 Found ${newJobs.length} new jobs!`);
            
            // Add new job IDs to seen set
            newJobs.forEach(job => seenJobIds.add(job.jobId));
            
            // Send Telegram alert
            await sendTelegramAlert(newJobs);
        } else {
            console.log(`[${new Date().toISOString()}] 🔄 No new jobs found (${jobs.length} total jobs checked)`);
        }
        
    } catch (error) {
        console.error(`[${new Date().toISOString()}] ❌ Error in polling:`, error.message);
    }
}

// Health check function
function logHealthStatus() {
    const uptime = process.uptime();
    const memoryUsage = process.memoryUsage();
    const timeUntilExpiry = tokenExpiryTime ? Math.floor((tokenExpiryTime.getTime() - Date.now()) / 60000) : 'Unknown';
    
    console.log(`[${new Date().toISOString()}] 💊 Health Check:`);
    console.log(`  🕐 Uptime: ${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`);
    console.log(`  💾 Memory: ${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`);
    console.log(`  📊 Seen Jobs: ${seenJobIds.size} (clears every 30 seconds)`);
    console.log(`  🕒 Last Poll: ${lastPollTime.toISOString()}`);
    console.log(`  🔐 Auth Token: ${currentAuthToken ? 'Valid' : 'Missing'}`);
    console.log(`  ⏰ Token Expires: ${tokenExpiryTime ? tokenExpiryTime.toISOString() : 'N/A'}`);
    console.log(`  ⏱️  Time Until Expiry: ${timeUntilExpiry} minutes`);
    console.log(`  📤 Max Alerts: ${MAX_JOBS_PER_ALERT} (unlimited)`);
    console.log(`  🔄 Alert Mode: New jobs only (30s cleanup)`);
    console.log(`  🌐 Method: Automated Token Extraction`);
}

// Cleanup function
async function cleanup() {
    try {
        console.log(`[${new Date().toISOString()}] 🧹 Starting cleanup process...`);
        
        // Clear token refresh timer
        if (tokenRefreshInterval) {
            clearInterval(tokenRefreshInterval);
            console.log(`[${new Date().toISOString()}] ✅ Token refresh timer cleared`);
        }
        
        // Close browser
        if (browser) {
            await browser.close();
            console.log(`[${new Date().toISOString()}] ✅ Browser closed`);
        }
        
        console.log(`[${new Date().toISOString()}] 🧹 Cleanup completed`);
    } catch (error) {
        console.error(`[${new Date().toISOString()}] ❌ Error during cleanup:`, error.message);
    }
}

// Automatic token refresh system
function startTokenRefreshTimer() {
    // Clear existing timer if any
    if (tokenRefreshInterval) {
        clearInterval(tokenRefreshInterval);
    }
    
    console.log(`[${new Date().toISOString()}] 🔄 Setting up automatic token refresh (every 55 minutes)`);
    
    tokenRefreshInterval = setInterval(async () => {
        try {
            console.log(`[${new Date().toISOString()}] ⏰ 55-minute timer triggered - refreshing token...`);
            await refreshAuthToken();
            console.log(`[${new Date().toISOString()}] ✅ Automatic token refresh completed successfully`);
        } catch (error) {
            console.error(`[${new Date().toISOString()}] ❌ Automatic token refresh failed:`, error.message);
            console.log(`[${new Date().toISOString()}] 🔄 Will retry on next poll cycle...`);
        }
    }, TOKEN_REFRESH_INTERVAL);
}

// Start monitoring with comprehensive logging
async function startMonitoring() {
    try {
        console.log(`[${new Date().toISOString()}] 🚀 Starting Amazon Job Monitor with Automated Token Extraction`);
        console.log(`[${new Date().toISOString()}] ================================================`);
        console.log(`[${new Date().toISOString()}] 🌐 Amazon Website: ${AMAZON_WEBSITE_URL}`);
        console.log(`[${new Date().toISOString()}] 📡 GraphQL Endpoint: ${AMAZON_GRAPHQL_URL}`);
        console.log(`[${new Date().toISOString()}] ⏱️  Polling Interval: ${POLLING_INTERVAL}ms (${POLLING_INTERVAL/1000} seconds)`);
        console.log(`[${new Date().toISOString()}] 📱 Telegram Channel: ${config.TELEGRAM_CHANNEL_ID}`);
        console.log(`[${new Date().toISOString()}] 🔄 Token Refresh: Every 55 minutes`);
        console.log(`[${new Date().toISOString()}] ================================================\n`);
        
        // Step 1: Initialize browser
        console.log(`[${new Date().toISOString()}] 📋 Step 1: Initializing browser for token extraction...`);
        await initializeBrowser();
        
        // Step 2: Extract initial token
        console.log(`[${new Date().toISOString()}] 📋 Step 2: Extracting initial authentication token...`);
        await refreshAuthToken();
        
        // Step 3: Start automatic token refresh timer
        console.log(`[${new Date().toISOString()}] 📋 Step 3: Setting up automatic token refresh...`);
        startTokenRefreshTimer();
        
        // Step 4: Initial job poll
        console.log(`[${new Date().toISOString()}] 📋 Step 4: Performing initial job search...`);
        await pollForJobs();
        
        // Step 5: Set up polling interval
        console.log(`[${new Date().toISOString()}] 📋 Step 5: Starting continuous job monitoring...`);
        setInterval(async () => {
            lastPollTime = new Date();
            await pollForJobs();
        }, POLLING_INTERVAL);
        
        // Step 6: Health check every 5 minutes
        console.log(`[${new Date().toISOString()}] 📋 Step 6: Setting up health monitoring...`);
        setInterval(logHealthStatus, 5 * 60 * 1000);
        
        // Step 7: Clear seen jobs every 30 seconds to allow refilled positions
        console.log(`[${new Date().toISOString()}] 📋 Step 7: Setting up periodic seen jobs cleanup (every 30 seconds)...`);
        setInterval(() => {
            const previousCount = seenJobIds.size;
            seenJobIds.clear();
            console.log(`[${new Date().toISOString()}] 🧹 Cleared ${previousCount} seen job IDs - ready to detect refilled positions`);
        }, 30 * 1000); // Clear every 30 seconds
        
        // Initial health status
        console.log(`[${new Date().toISOString()}] \n🎉 Amazon Job Monitor is now running! 🎉`);
        console.log(`[${new Date().toISOString()}] ✅ All systems operational and monitoring for jobs...`);
        logHealthStatus();
        
    } catch (error) {
        console.error(`[${new Date().toISOString()}] ❌ Critical error starting monitoring:`, error.message);
        await cleanup();
        process.exit(1);
    }
}

// Error handling
process.on('uncaughtException', async (error) => {
    console.error(`[${new Date().toISOString()}] ❌ Uncaught Exception:`, error);
    await cleanup();
    process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
    console.error(`[${new Date().toISOString()}] ❌ Unhandled Rejection at:`, promise, 'reason:', reason);
    await cleanup();
    process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log(`[${new Date().toISOString()}] 🛑 Shutting down gracefully...`);
    await cleanup();
    process.exit(0);
});

// Start the monitor
async function main() {
    try {
        console.log(`[${new Date().toISOString()}] 🎬 Initializing Amazon Job Monitor...`);
        
        // Get Telegram credentials (only thing we need from user)
        config = await setupTelegramCredentials();
        
        // Start the monitoring system
        await startMonitoring();
        
    } catch (error) {
        console.error(`[${new Date().toISOString()}] ❌ Fatal error in main:`, error.message);
        process.exit(1);
    }
}

// Start the application
main();