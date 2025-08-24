const fetch = require('node-fetch');
const puppeteer = require('puppeteer');
const readline = require('readline');

// Interactive setup function
async function setupConfiguration() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const question = (prompt) => {
        return new Promise((resolve) => {
            rl.question(prompt, resolve);
        });
    };

    console.log('🔧 Amazon Job Monitor Setup');
    console.log('==========================\n');

    // Get Telegram Bot Token
    let telegramBotToken = await question('Enter your Telegram Bot Token: ');
    while (!telegramBotToken.trim()) {
        console.log('❌ Telegram Bot Token is required!');
        telegramBotToken = await question('Enter your Telegram Bot Token: ');
    }

    // Get Telegram Channel ID
    let telegramChannelId = await question('Enter your Telegram Channel ID (e.g., @channelname or -1001234567890): ');
    while (!telegramChannelId.trim()) {
        console.log('❌ Telegram Channel ID is required!');
        telegramChannelId = await question('Enter your Telegram Channel ID (e.g., @channelname or -1001234567890): ');
    }

    // Get Amazon API URL
    let amazonApiUrl = await question('Enter Amazon API URL (press Enter for default): ');
    if (!amazonApiUrl.trim()) {
        amazonApiUrl = 'https://e5mquma77feepi2bdn4d6h3mpu.appsync-api.us-east-1.amazonaws.com/graphql';
        console.log('✅ Using default Amazon API URL');
    }

    // Get Polling Interval
    let pollingInterval = await question('Enter polling interval in milliseconds (press Enter for default 1000): ');
    if (!pollingInterval.trim()) {
        pollingInterval = '1000';
        console.log('✅ Using default polling interval: 1000ms');
    }

    // Get Max Jobs Per Alert
    let maxJobsPerAlert = await question('Enter max jobs per alert (press Enter for default 5): ');
    if (!maxJobsPerAlert.trim()) {
        maxJobsPerAlert = '5';
        console.log('✅ Using default max jobs per alert: 5');
    }

    rl.close();

    // Validate inputs
    if (isNaN(pollingInterval) || parseInt(pollingInterval) < 500) {
        console.log('⚠️  Polling interval must be at least 500ms. Using 1000ms.');
        pollingInterval = '1000';
    }

    if (isNaN(maxJobsPerAlert) || parseInt(maxJobsPerAlert) < 1) {
        console.log('⚠️  Max jobs per alert must be at least 1. Using 5.');
        maxJobsPerAlert = '5';
    }

    console.log('\n✅ Configuration completed!\n');

    return {
        TELEGRAM_BOT_TOKEN: telegramBotToken.trim(),
        TELEGRAM_CHANNEL_ID: telegramChannelId.trim(),
        AMAZON_API_URL: amazonApiUrl.trim(),
        POLLING_INTERVAL: parseInt(pollingInterval),
        MAX_JOBS_PER_ALERT: parseInt(maxJobsPerAlert)
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
            "pageSize": 100,
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
        console.log(`[${new Date().toISOString()}] Initializing browser for token extraction...`);
        
        browser = await puppeteer.launch({
            headless: true,
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
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
        
        console.log(`[${new Date().toISOString()}] Browser initialized successfully`);
        
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error initializing browser:`, error.message);
        throw error;
    }
}

// Extract auth token from Amazon hiring page
async function extractAuthToken() {
    try {
        console.log(`[${new Date().toISOString()}] Extracting auth token...`);
        
        // Navigate to Amazon hiring page
        await page.goto('https://hiring.amazon.ca/app#/jobSearch', {
            waitUntil: 'networkidle2',
            timeout: 30000
        });
        
        // Wait for page to load
        await page.waitForTimeout(5000);
        
        // Listen for GraphQL requests and extract token
        const token = await page.evaluate(() => {
            return new Promise((resolve) => {
                const originalFetch = window.fetch;
                let authToken = null;
                
                window.fetch = function(...args) {
                    const [url, options] = args;
                    
                    if (url.includes('appsync-api.us-east-1.amazonaws.com/graphql')) {
                        if (options && options.headers && options.headers.authorization) {
                            authToken = options.headers.authorization.replace('Bearer ', '');
                            console.log('Auth token captured:', authToken);
                        }
                    }
                    
                    return originalFetch.apply(this, args);
                };
                
                // Trigger a job search to capture the token
                setTimeout(() => {
                    // Simulate a job search request
                    fetch('https://e5mquma77feepi2bdn4d6h3mpu.appsync-api.us-east-1.amazonaws.com/graphql', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Accept': '*/*'
                        },
                        body: JSON.stringify({
                            operationName: 'searchJobCardsByLocation',
                            variables: {
                                searchJobRequest: {
                                    locale: 'en-CA',
                                    country: 'Canada',
                                    pageSize: 10
                                }
                            }
                        })
                    });
                    
                    setTimeout(() => {
                        resolve(authToken);
                    }, 3000);
                }, 2000);
            });
        });
        
        if (token) {
            currentAuthToken = token;
            tokenExpiryTime = new Date(Date.now() + 25 * 60 * 1000); // 25 minutes from now
            console.log(`[${new Date().toISOString()}] Auth token extracted successfully`);
            console.log(`[${new Date().toISOString()}] Token expires at: ${tokenExpiryTime.toISOString()}`);
            return token;
        } else {
            throw new Error('Failed to extract auth token');
        }
        
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error extracting auth token:`, error.message);
        throw error;
    }
}

// Check if token needs refresh
function isTokenExpired() {
    if (!currentAuthToken || !tokenExpiryTime) {
        return true;
    }
    
    // Refresh token 5 minutes before expiry
    return new Date() > new Date(tokenExpiryTime.getTime() - 5 * 60 * 1000);
}

// Refresh auth token
async function refreshAuthToken() {
    try {
        console.log(`[${new Date().toISOString()}] Refreshing auth token...`);
        
        if (!browser || !page) {
            await initializeBrowser();
        }
        
        const newToken = await extractAuthToken();
        return newToken;
        
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error refreshing auth token:`, error.message);
        throw error;
    }
}

// Fetch jobs from Amazon API
async function fetchAmazonJobs() {
    try {
        // Check if token needs refresh
        if (isTokenExpired()) {
            console.log(`[${new Date().toISOString()}] Token expired, refreshing...`);
            await refreshAuthToken();
        }
        
        if (!currentAuthToken) {
            throw new Error('No auth token available');
        }
        
        console.log(`[${new Date().toISOString()}] Fetching jobs from Amazon API...`);
        
        const headers = {
            'accept': '*/*',
            'accept-language': 'en-US,en;q=0.7',
            'authorization': `Bearer ${currentAuthToken}`,
            'content-type': 'application/json',
            'country': 'Canada',
            'iscanary': 'false',
            'priority': 'u=1, i',
            'sec-ch-ua': '"Brave";v="129", "Not=A?Brand";v="8", "Chromium";v="129"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"macOS"',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'cross-site',
            'sec-gpc': '1'
        };
        
        const response = await fetch(config.AMAZON_API_URL, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(amazonQuery)
        });

        if (!response.ok) {
            if (response.status === 401) {
                console.log(`[${new Date().toISOString()}] Token expired, refreshing...`);
                await refreshAuthToken();
                return await fetchAmazonJobs(); // Retry with new token
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        
        if (data.errors) {
            throw new Error(`API Error: ${data.errors[0].message}`);
        }

        if (!data.data || !data.data.searchJobCardsByLocation) {
            console.log('No data in response');
            return [];
        }

        const jobs = data.data.searchJobCardsByLocation.jobCards || [];
        console.log(`[${new Date().toISOString()}] Found ${jobs.length} jobs`);
        
        return jobs;
        
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error fetching jobs:`, error.message);
        return [];
    }
}

// Format job for Telegram message
function formatJobForTelegram(job) {
    let formatted = `${job.locationName}\n`;
    formatted += `${job.jobTitle}\n`;
    
    if (job.totalPayRateMinL10N && job.totalPayRateMaxL10N) {
        formatted += `Pay: ${job.totalPayRateMinL10N} - ${job.totalPayRateMaxL10N}\n`;
    }
    
    if (job.bonusPay && job.bonusPay > 0) {
        formatted += `Bonus: ${job.bonusPayL10N}\n`;
    }
    
    if (job.jobTypeL10N) {
        formatted += `Type: ${job.jobTypeL10N}\n`;
    }
    
    if (job.employmentTypeL10N) {
        formatted += `Employment: ${job.employmentTypeL10N}\n`;
    }
    
    if (job.scheduleCount) {
        formatted += `Schedules: ${job.scheduleCount} available\n`;
    }
    
    if (job.tagLine) {
        formatted += `${job.tagLine}\n`;
    }
    
    if (job.bannerText) {
        formatted += `${job.bannerText}\n`;
    }
    
    formatted += `Job ID: ${job.jobId}\n`;
    
    if (job.distance) {
        formatted += `Distance: ${job.distance}km\n`;
    }
    
    return formatted;
}

// Send Telegram alert
async function sendTelegramAlert(jobs) {
    try {
        if (!config.TELEGRAM_BOT_TOKEN || !config.TELEGRAM_CHANNEL_ID) {
            console.error('Telegram configuration missing!');
            return;
        }

        let message = `NEW AMAZON WAREHOUSE JOBS!\n\n`;
        
        // Limit jobs per message
        const jobsToSend = jobs.slice(0, config.MAX_JOBS_PER_ALERT);
        
        jobsToSend.forEach(job => {
            message += formatJobForTelegram(job);
            message += '\n';
        });
        
        message += `Apply: https://hiring.amazon.ca/app#/jobSearch\n`;
        message += `Alert time: ${new Date().toLocaleString()}`;
        
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

        if (!telegramResponse.ok) {
            throw new Error(`Telegram API error: ${telegramResponse.status}`);
        }

        const result = await telegramResponse.json();
        
        if (result.ok) {
            console.log(`[${new Date().toISOString()}] Telegram alert sent successfully!`);
            console.log(`[${new Date().toISOString()}] Alerted about ${jobsToSend.length} new jobs`);
        } else {
            console.error(`[${new Date().toISOString()}] Telegram API error:`, result.description);
        }
        
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error sending Telegram alert:`, error.message);
    }
}

// Main polling function
async function pollForJobs() {
    try {
        const jobs = await fetchAmazonJobs();
        
        if (jobs.length === 0) {
            return;
        }
        
        // Filter for new jobs
        const newJobs = jobs.filter(job => !seenJobIds.has(job.jobId));
        
        if (newJobs.length > 0) {
            console.log(`[${new Date().toISOString()}] Found ${newJobs.length} new jobs!`);
            
            // Add new job IDs to seen set
            newJobs.forEach(job => seenJobIds.add(job.jobId));
            
            // Send Telegram alert
            await sendTelegramAlert(newJobs);
            
            // Clean up old job IDs (keep last 1000)
            if (seenJobIds.size > 1000) {
                const jobIdsArray = Array.from(seenJobIds);
                seenJobIds = new Set(jobIdsArray.slice(-500));
            }
        }
        
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error in polling:`, error.message);
    }
}

// Health check function
function logHealthStatus() {
    const uptime = process.uptime();
    const memoryUsage = process.memoryUsage();
    
    console.log(`[${new Date().toISOString()}] Health Check:`);
    console.log(`  Uptime: ${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`);
    console.log(`  Memory: ${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`);
    console.log(`  Seen Jobs: ${seenJobIds.size}`);
    console.log(`  Last Poll: ${lastPollTime.toISOString()}`);
    console.log(`  Auth Token: ${currentAuthToken ? 'Valid' : 'Missing'}`);
    console.log(`  Token Expires: ${tokenExpiryTime ? tokenExpiryTime.toISOString() : 'N/A'}`);
}

// Cleanup function
async function cleanup() {
    try {
        if (browser) {
            await browser.close();
            console.log(`[${new Date().toISOString()}] Browser closed`);
        }
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error during cleanup:`, error.message);
    }
}

// Start monitoring
async function startMonitoring() {
    try {
        console.log(`[${new Date().toISOString()}] Starting Amazon Job Monitor with Auto Token Extraction...`);
        console.log(`[${new Date().toISOString()}] Polling interval: ${config.POLLING_INTERVAL}ms`);
        console.log(`[${new Date().toISOString()}] Telegram channel: ${config.TELEGRAM_CHANNEL_ID}`);
        
        // Initialize browser and get first token
        await initializeBrowser();
        await refreshAuthToken();
        
        // Initial poll
        await pollForJobs();
        
        // Set up polling interval
        setInterval(async () => {
            lastPollTime = new Date();
            await pollForJobs();
        }, config.POLLING_INTERVAL);
        
        // Health check every 5 minutes
        setInterval(logHealthStatus, 5 * 60 * 1000);
        
        // Log startup
        logHealthStatus();
        
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error starting monitoring:`, error.message);
        await cleanup();
        process.exit(1);
    }
}

// Error handling
process.on('uncaughtException', async (error) => {
    console.error(`[${new Date().toISOString()}] Uncaught Exception:`, error);
    await cleanup();
    process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
    console.error(`[${new Date().toISOString()}] Unhandled Rejection at:`, promise, 'reason:', reason);
    await cleanup();
    process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log(`[${new Date().toISOString()}] Shutting down gracefully...`);
    await cleanup();
    process.exit(0);
});

// Start the monitor
async function main() {
    config = await setupConfiguration();
    await startMonitoring();
}

main();
