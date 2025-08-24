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
    console.log('This script will help you configure the Amazon Job Monitor.\n');

    // Get Telegram Bot Token
    console.log('📱 Telegram Bot Setup:');
    console.log('1. Create a bot with @BotFather on Telegram');
    console.log('2. Get your bot token from @BotFather\n');
    
    let telegramBotToken = await question('Enter your Telegram Bot Token: ');
    while (!telegramBotToken.trim()) {
        console.log('❌ Telegram Bot Token is required!');
        telegramBotToken = await question('Enter your Telegram Bot Token: ');
    }

    // Get Telegram Channel ID
    console.log('\n📢 Telegram Channel Setup:');
    console.log('1. Create a channel or use existing one');
    console.log('2. Add your bot as admin to the channel');
    console.log('3. Get channel ID (e.g., @channelname or -1001234567890)\n');
    
    let telegramChannelId = await question('Enter your Telegram Channel ID: ');
    while (!telegramChannelId.trim()) {
        console.log('❌ Telegram Channel ID is required!');
        telegramChannelId = await question('Enter your Telegram Channel ID: ');
    }

    // Get Amazon API URL
    console.log('\n🌐 Amazon API Setup:');
    console.log('The default API URL should work for most cases.\n');
    
    let amazonApiUrl = await question('Enter Amazon API URL (press Enter for default): ');
    if (!amazonApiUrl.trim()) {
        amazonApiUrl = 'https://e5mquma77feepi2bdn4d6h3mpu.appsync-api.us-east-1.amazonaws.com/graphql';
        console.log('✅ Using default Amazon API URL');
    }

    // Get Polling Interval
    console.log('\n⏱️  Monitoring Settings:');
    console.log('How often should the script check for new jobs?\n');
    
    let pollingInterval = await question('Enter polling interval in milliseconds (press Enter for default 1000): ');
    if (!pollingInterval.trim()) {
        pollingInterval = '1000';
        console.log('✅ Using default polling interval: 1000ms (1 second)');
    }

    // Get Max Jobs Per Alert
    console.log('\n📊 Alert Settings:');
    console.log('How many jobs should be included in each alert message?\n');
    
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

    console.log('\n✅ Configuration Summary:');
    console.log('========================');
    console.log(`📱 Telegram Bot Token: ${telegramBotToken.substring(0, 10)}...`);
    console.log(`📢 Telegram Channel ID: ${telegramChannelId}`);
    console.log(`🌐 Amazon API URL: ${amazonApiUrl}`);
    console.log(`⏱️  Polling Interval: ${pollingInterval}ms`);
    console.log(`📊 Max Jobs Per Alert: ${maxJobsPerAlert}`);
    console.log('\n🎉 Setup completed! You can now run the monitor with:');
    console.log('   npm start');
    console.log('\nOr deploy to server with:');
    console.log('   ./deploy.sh');

    return {
        TELEGRAM_BOT_TOKEN: telegramBotToken.trim(),
        TELEGRAM_CHANNEL_ID: telegramChannelId.trim(),
        AMAZON_API_URL: amazonApiUrl.trim(),
        POLLING_INTERVAL: parseInt(pollingInterval),
        MAX_JOBS_PER_ALERT: parseInt(maxJobsPerAlert)
    };
}

// Run setup if this script is executed directly
if (require.main === module) {
    setupConfiguration().catch(console.error);
}

module.exports = { setupConfiguration };
