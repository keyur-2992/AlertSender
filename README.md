# Amazon Job Monitor - Telegram Alert Bot

A Node.js script that monitors Amazon's hiring API 24/7 and sends real-time job alerts to a Telegram channel with **automatic token extraction**.

## Features

- **Real-time monitoring** of Amazon warehouse jobs across Canada
- **1-second polling** for instant job detection
- **Telegram alerts** with detailed job information
- **Duplicate prevention** to avoid spam
- **Health monitoring** and logging
- **Error handling** and graceful shutdown
- **Automatic token extraction** and refresh

## How Auto Token Extraction Works

### 1. Browser Automation
- Uses **Puppeteer** to control a headless Chrome browser
- Navigates to Amazon hiring website
- Monitors network requests for GraphQL calls

### 2. Token Capture
- Intercepts GraphQL API requests
- Extracts authorization headers
- Captures Bearer tokens automatically

### 3. Auto Refresh
- **Monitors token expiration** (25-minute window)
- **Automatically refreshes** before expiry
- **Retries failed requests** with new tokens
- **No manual intervention** needed

### 4. Error Handling
- **Graceful token refresh** on 401 errors
- **Browser restart** on failures
- **Automatic retry** mechanisms
- **Health monitoring** and logging

## Prerequisites

- Node.js 16+ installed
- AWS t3.nano or t3.micro instance
- Telegram Bot Token
- ~~Amazon API authentication token~~ (Not needed - automatic extraction!)

## Setup Instructions

### 1. Server Setup (AWS t2.small - Amazon Linux 2023)

```bash
# Update system
sudo yum update -y

# Install Node.js
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs

# Install PM2 for process management
npm install -g pm2

# Install Chrome dependencies for Puppeteer
sudo yum install -y \
    alsa-lib \
    atk \
    cups-libs \
    gtk3 \
    ipa-gothic-fonts \
    libXcomposite \
    libXcursor \
    libXdamage \
    libXext \
    libXi \
    libXrandr \
    libXScrnSaver \
    libXtst \
    pango \
    xorg-x11-fonts-100dpi \
    xorg-x11-fonts-75dpi \
    xorg-x11-fonts-cyrillic \
    xorg-x11-fonts-misc \
    xorg-x11-fonts-Type1 \
    xorg-x11-utils

# Verify installation
node --version
npm --version
pm2 --version
```

### 2. Project Setup

```bash
# Clone the repository
git clone <your-repo-url>
cd amazon-job-monitor

# Or upload files to server manually
cd /home/ubuntu/
mkdir amazon-job-monitor
cd amazon-job-monitor

# Upload files to server
# - package.json
# - auto-token-monitor.js
# - setup.js
# - deploy.sh
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Configuration

The application now uses interactive setup. Run the setup script:

```bash
# Run interactive setup
npm run setup

# Or run the main script (it will prompt for configuration)
npm start
```

The setup will prompt you for:
- **Telegram Bot Token** (required)
- **Telegram Channel ID** (required)
- **Amazon API URL** (optional - uses default)
- **Polling Interval** (optional - defaults to 1000ms)
- **Max Jobs Per Alert** (optional - defaults to 5)

### 5. Telegram Bot Setup

1. **Create Bot:**
   - Message @BotFather on Telegram
   - Send `/newbot`
   - Follow instructions to create bot
   - Save the bot token

2. **Create Channel:**
   - Create a new channel in Telegram
   - Add your bot as admin
   - Note the channel username (e.g., @amazon_jobs_canada)

3. **Get Channel ID:**
   - Send a message to your channel
   - Visit: `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
   - Find the `chat_id` for your channel

## Deployment

### Start the Monitor

```bash
# Option 1: Use the deployment script (recommended)
./deploy.sh

# Option 2: Manual setup
# First run setup
npm run setup

# Then start with PM2
pm2 start auto-token-monitor.js --name "amazon-monitor-auto"

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
```

### Monitor Status

```bash
# Check status
pm2 status

# View logs
pm2 logs amazon-monitor-auto

# Restart if needed
pm2 restart amazon-monitor-auto
```

## Monitoring & Logs

### Health Check
The script logs health status every 5 minutes:
- Uptime
- Memory usage
- Number of seen jobs
- Last poll time
- **Auth token status**
- **Token expiration time**

### Log Locations
```bash
# PM2 logs
pm2 logs amazon-monitor-auto

# Real-time logs
pm2 logs amazon-monitor-auto --lines 100

# Clear logs
pm2 flush
```

## Alert Format

The script sends alerts in this format:

```
NEW AMAZON WAREHOUSE JOBS!

Toronto, ON
Amazon Delivery Station Warehouse Associate
Pay: $18.50 - $18.50
Bonus: $500
Type: Full Time
Employment: Regular
Schedules: 3 available
The last stop before delivering orders.
Receive an additional bonus
Job ID: JOB-CA-0000012355
Distance: 2.5km

Apply: https://hiring.amazon.ca/app#/jobSearch
Alert time: 1/15/2024, 2:30:45 PM
```

## Configuration Options

### Polling Interval
- **1000ms** (1 second) - Default, fastest
- **5000ms** (5 seconds) - Less aggressive
- **10000ms** (10 seconds) - Conservative

### Max Jobs Per Alert
- **5** - Default, prevents message overflow
- **10** - More jobs per message
- **3** - Shorter messages

## Troubleshooting

### Common Issues

1. **Puppeteer Installation:**
   ```bash
   # If Chrome fails to install
   sudo apt-get update
   sudo apt-get install -y chromium-browser
   ```

2. **Memory Issues:**
   ```bash
   # Monitor memory usage
   pm2 monit
   
   # Restart if needed
   pm2 restart amazon-monitor-auto
   ```

3. **Token Extraction Fails:**
   - Check internet connection
   - Verify Amazon website accessibility
   - Check browser logs for errors

### Debug Mode

```bash
# Run directly for debugging
node auto-token-monitor.js

# Run setup separately
node setup.js
```

## Performance

### Resource Usage (t2.small)
- **CPU**: 15-25% average (higher due to browser)
- **RAM**: 200-300MB (includes Chrome)
- **Network**: 200KB/hour
- **Storage**: ~500MB (application + logs)

### Cost Estimation
- **t2.small**: ~$17/month
- **Storage**: ~$0.80/month
- **Data transfer**: ~$1/month
- **Total**: ~$19/month

## Security

### Best Practices
- No sensitive data stored in files (interactive setup)
- Keep Telegram bot token secure
- Regular security updates
- Monitor access logs

### Firewall Setup
```bash
# Allow only necessary ports
sudo ufw allow ssh
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

## Support

For issues or questions:
1. Check the logs: `pm2 logs amazon-monitor-auto`
2. Re-run setup if needed: `npm run setup`
3. Test individual components
4. Monitor system resources

## License

MIT License - Feel free to modify and distribute.
