// Load environment variables from .env file
require('dotenv').config();

const fetch = require('node-fetch');
const { getValidToken, validateTokenWithServer } = require('./token-extractor');

// Hardcoded endpoints
const AMAZON_GRAPHQL_URL = 'https://e5mquma77feepi2bdn4d6h3mpu.appsync-api.us-east-1.amazonaws.com/graphql';
const POLLING_INTERVAL = 1000; // 1 second
const MAX_JOBS_PER_ALERT = 999;

// Simple setup function - only environment variables
function setupTelegramCredentials() {
    console.log('🤖 Amazon Job Monitor - Modular Token System');
    console.log('============================================\n');
    
    // Check for environment variables (required)
    if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHANNEL_ID) {
        console.error('❌ Missing required environment variables!');
        console.error('Please set TELEGRAM_BOT_TOKEN and TELEGRAM_CHANNEL_ID environment variables');
        console.error('Example:');
        console.error('  set TELEGRAM_BOT_TOKEN=your_bot_token');
        console.error('  set TELEGRAM_CHANNEL_ID=@your_channel');
        process.exit(1);
    }
    
    console.log('📱 Using Telegram credentials from environment variables');
    console.log('✅ Telegram credentials loaded from environment!');
    console.log(`🌐 Using hardcoded endpoints:`);
    console.log(`   GraphQL: ${AMAZON_GRAPHQL_URL}`);
    console.log(`   Polling: ${POLLING_INTERVAL}ms`);
    console.log(`   Token Management: Modular extraction system\n`);
    
    return {
        TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN.trim(),
        TELEGRAM_CHANNEL_ID: process.env.TELEGRAM_CHANNEL_ID.trim()
    };
}

// Configuration
let config = null;

// Track seen jobs and token management
let seenJobIds = new Set();
let currentAuthToken = null;

// Amazon GraphQL Queries
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

// Schedule query to get detailed schedule information for a specific job
const scheduleQuery = {
    "operationName": "searchScheduleCards",
    "variables": {
        "searchScheduleRequest": {
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
            "rangeFilters": [],
            "orFilters": [],
            "dateFilters": [
                {
                    "key": "firstDayOnSite",
                    "range": { "startDate": new Date().toISOString().split('T')[0] }
                }
            ],
            "sorters": [
                {
                    "fieldName": "totalPayRateMax",
                    "ascending": "false"
                }
            ],
            "pageSize": 1000,
            "jobId": ""
        }
    },
    "query": `query searchScheduleCards($searchScheduleRequest: SearchScheduleRequest!) {
        searchScheduleCards(searchScheduleRequest: $searchScheduleRequest) {
            nextToken
            scheduleCards {
                scheduleId
                jobId
                firstDayOnSite
                hoursPerWeek
                totalPayRate
                totalPayRateL10N
                basePay
                basePayL10N
                signOnBonus
                signOnBonusL10N
                city
                state
                address
                employmentType
                employmentTypeL10N
                scheduleType
                scheduleTypeL10N
                __typename
            }
            __typename
        }
    }`
};

// Get valid token from token extractor module
async function ensureValidToken() {
    try {
        if (!currentAuthToken) {
            console.log(`[${new Date().toISOString()}] 🔑 No token available, getting fresh token...`);
            currentAuthToken = await getValidToken();
            console.log(`[${new Date().toISOString()}] ✅ Fresh token obtained: ${currentAuthToken.substring(0, 9999)}...`);
            return currentAuthToken;
        }
        
        // Validate existing token
        console.log(`[${new Date().toISOString()}] 🔍 Validating existing token...`);
        const validation = await validateTokenWithServer(currentAuthToken);
        
        if (validation.isValid) {
            console.log(`[${new Date().toISOString()}] ✅ Existing token is valid`);
            return currentAuthToken;
        } else {
            console.log(`[${new Date().toISOString()}] ❌ Existing token is invalid, getting fresh token...`);
            currentAuthToken = await getValidToken();
            console.log(`[${new Date().toISOString()}] ✅ Fresh token obtained: ${currentAuthToken.substring(0, 9999)}...`);
            return currentAuthToken;
        }
        
    } catch (error) {
        console.error(`[${new Date().toISOString()}] ❌ Error ensuring valid token:`, error.message);
        throw error;
    }
}

// Fetch jobs from Amazon API
async function fetchAmazonJobs() {
    try {
        console.log(`[${new Date().toISOString()}] 🔄 Starting job fetch cycle...`);
        
        // Ensure we have a valid token
        const token = await ensureValidToken();
        
        console.log(`[${new Date().toISOString()}] 📡 Querying GraphQL endpoint: ${AMAZON_GRAPHQL_URL}`);
        
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
        
        console.log(`[${new Date().toISOString()}] 📤 Sending GraphQL query...`);
        
        const response = await fetch(AMAZON_GRAPHQL_URL, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(amazonQuery)
        });

        console.log(`[${new Date().toISOString()}] 📥 Response received: ${response.status} ${response.statusText}`);

        // Handle response based on status
        if (response.status === 200) {
            console.log(`[${new Date().toISOString()}] ✅ 200 OK - Token is valid, continuing job fetch process...`);
        } else if (response.status === 401 || response.status === 403) {
            console.log(`[${new Date().toISOString()}] 🔄 ${response.status} - Token expired/invalid, getting fresh token...`);
            currentAuthToken = null; // Clear invalid token
            const newToken = await ensureValidToken();
            console.log(`[${new Date().toISOString()}] 🔄 Retrying job fetch with fresh token...`);
            return await fetchAmazonJobs(); // Retry with new token
        } else if (!response.ok) {
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

// Fetch schedules for a specific job
async function fetchJobSchedules(jobId, token) {
    try {
        console.log(`[${new Date().toISOString()}] 📅 Fetching schedules for job: ${jobId}`);
        
        // Update the schedule query with the specific job ID
        const queryWithJobId = {
            ...scheduleQuery,
            variables: {
                ...scheduleQuery.variables,
                searchScheduleRequest: {
                    ...scheduleQuery.variables.searchScheduleRequest,
                    jobId: jobId
                }
            }
        };
        
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
        
        const response = await fetch(AMAZON_GRAPHQL_URL, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(queryWithJobId)
        });
        
        if (!response.ok) {
            console.log(`[${new Date().toISOString()}] ⚠️  Schedule fetch failed for job ${jobId}: ${response.status}`);
            return [];
        }
        
        const data = await response.json();
        
        if (data.errors) {
            console.log(`[${new Date().toISOString()}] ⚠️  Schedule query errors for job ${jobId}:`, data.errors);
            return [];
        }
        
        const schedules = data.data?.searchScheduleCards?.scheduleCards || [];
        console.log(`[${new Date().toISOString()}] ✅ Found ${schedules.length} schedules for job ${jobId}`);
        
        return schedules;
        
    } catch (error) {
        console.error(`[${new Date().toISOString()}] ❌ Error fetching schedules for job ${jobId}:`, error.message);
        return [];
    }
}

// Format job for Telegram message
async function formatJobForTelegram(job, token) {
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
    
    let formatted = `----------------------------\n`;
    formatted += `Location: ${job.locationName || job.city}\n`;
    formatted += `Shifts: ${job.scheduleCount || 1}\n`;
    formatted += `Type: ${job.jobTypeL10N || job.employmentTypeL10N || 'Flex Time'}\n`;
    formatted += `Job: ${job.jobId}\n`;
    
    if (job.totalPayRateMinL10N && job.totalPayRateMaxL10N) {
        formatted += `Pay: ${job.totalPayRateMinL10N} - ${job.totalPayRateMaxL10N}\n`;
    } else if (job.totalPayRateMinL10N) {
        formatted += `Pay: ${job.totalPayRateMinL10N} CAD\n`;
    } else {
        formatted += `Pay: See posting\n`;
    }
    
    formatted += `Time: ${timeString}\n\n`;
    
    // Fetch and add schedule information
    try {
        const schedules = await fetchJobSchedules(job.jobId, token);
        if (schedules.length > 0) {
            formatted += `📅 Available Schedules:\n`;
            schedules.forEach((schedule, index) => {
                formatted += `   ${index + 1}. Schedule ID: ${schedule.scheduleId}\n`;
                if (schedule.firstDayOnSite) {
                    formatted += `      Start: ${schedule.firstDayOnSite}\n`;
                }
                if (schedule.hoursPerWeek) {
                    formatted += `      Hours: ${schedule.hoursPerWeek}/week\n`;
                }
                if (schedule.totalPayRateL10N) {
                    formatted += `      Pay: ${schedule.totalPayRateL10N}\n`;
                }
                formatted += `\n`;
            });
        } else {
            formatted += `📅 No schedules available\n\n`;
        }
    } catch (error) {
        formatted += `📅 Schedule info unavailable\n\n`;
    }
    
    formatted += `Link: https://hiring.amazon.ca/app#/jobDetail?jobId=${job.jobId}&locale=en-CA\n`;
    formatted += `------------------------------`;
    
    return formatted;
}

// Send Telegram alert
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
            
            // Get current valid token for schedule fetching
            const token = await ensureValidToken();
            
            // Simple message with just the formatted job info
            const message = await formatJobForTelegram(job, token);
            
            const telegramResponse = await fetch(`https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    chat_id: config.TELEGRAM_CHANNEL_ID,
                    text: message
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
        
        // 🧹 Garbage collection after job processing
        if (global.gc) {
            global.gc();
        }
        
    } catch (error) {
        console.error(`[${new Date().toISOString()}] ❌ Error in polling:`, error.message);
        
        // 🧹 Garbage collection on error recovery
        if (global.gc) {
            global.gc();
        }
    }
}

// Start the monitor
async function main() {
    try {
        console.log(`[${new Date().toISOString()}] 🎬 Starting Amazon Job Monitor...`);
        
        // Get Telegram credentials from environment variables
        config = setupTelegramCredentials();
        
        console.log(`[${new Date().toISOString()}] 🚀 Amazon Job Monitor with Modular Token System`);
        console.log(`[${new Date().toISOString()}] 📡 GraphQL: ${AMAZON_GRAPHQL_URL}`);
        console.log(`[${new Date().toISOString()}] ⏱️  Polling: Every ${POLLING_INTERVAL/1000} seconds`);
        console.log(`[${new Date().toISOString()}] 📱 Channel: ${config.TELEGRAM_CHANNEL_ID}`);
        console.log(`[${new Date().toISOString()}] 🔄 Token: Modular extraction system (auto-refresh)\n`);
        
        // Get initial token
        console.log(`[${new Date().toISOString()}] 🔑 Getting initial token...`);
        await ensureValidToken();
        
        // Start continuous job monitoring
        console.log(`[${new Date().toISOString()}] 🔄 Starting continuous job monitoring...`);
        setInterval(async () => {
            await pollForJobs();
        }, POLLING_INTERVAL);
        
        // Clear seen jobs every 30 seconds to allow refilled positions
        console.log(`[${new Date().toISOString()}] 🧹 Setting up job ID cleanup (every 30 seconds)...`);
        setInterval(() => {
            const previousCount = seenJobIds.size;
            seenJobIds.clear();
            if (previousCount > 0) {
                console.log(`[${new Date().toISOString()}] 🧹 Cleared ${previousCount} seen job IDs - ready to detect refilled positions`);
            }
            
            // 🧹 Periodic garbage collection
            if (global.gc) {
                global.gc();
            }
        }, 30 * 1000);
        
        console.log(`[${new Date().toISOString()}] 🎉 Amazon Job Monitor is now running!`);
        console.log(`[${new Date().toISOString()}] ✅ System will automatically manage tokens and fetch jobs\n`);
        
    } catch (error) {
        console.error(`[${new Date().toISOString()}] ❌ Fatal error in main:`, error.message);
        process.exit(1);
    }
}

// Error handling
process.on('uncaughtException', async (error) => {
    console.error(`[${new Date().toISOString()}] ❌ Uncaught Exception:`, error);
    process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
    console.error(`[${new Date().toISOString()}] ❌ Unhandled Rejection at:`, promise, 'reason:', reason);
    process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log(`[${new Date().toISOString()}] 🛑 Shutting down gracefully...`);
    process.exit(0);
});

// Start the application
main();