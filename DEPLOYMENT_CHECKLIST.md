# 🚀 Deployment Checklist for Amazon Linux 2023 (t2.small)

## ✅ Pre-Deployment Checklist

### 1. VM Access
- [ ] SSH key file ready
- [ ] VM IP address noted
- [ ] Security group configured

### 2. Telegram Setup
- [ ] Bot created with @BotFather
- [ ] Bot token saved
- [ ] Channel created
- [ ] Bot added as admin to channel
- [ ] Channel ID noted (e.g., @channelname or -1001234567890)

### 3. Repository Ready
- [ ] Code pushed to GitHub
- [ ] Repository URL noted

## 🔧 Deployment Steps

### Step 1: Connect to VM
```bash
ssh -i your-key.pem ec2-user@your-vm-ip
```

### Step 2: Clone Repository
```bash
cd /home/ec2-user
git clone <your-repo-url>
cd amazon-job-monitor
```

### Step 3: Run Deployment Script
```bash
chmod +x deploy.sh
./deploy.sh
```

### Step 4: Configure Application
The script will prompt for:
- [ ] Telegram Bot Token
- [ ] Telegram Channel ID
- [ ] Amazon API URL (press Enter for default)
- [ ] Polling Interval (press Enter for default 1000ms)
- [ ] Max Jobs Per Alert (press Enter for default 5)

## 🔍 Post-Deployment Verification

### Check PM2 Status
```bash
pm2 status
```
Should show: `amazon-monitor-auto` as `online`

### Check Logs
```bash
pm2 logs amazon-monitor-auto --lines 20
```
Should show successful startup messages

### Test Telegram Bot
- [ ] Send a test message to your channel
- [ ] Verify bot can post messages

### Monitor Resources
```bash
# Check CPU and Memory
htop

# Check disk usage
df -h

# Check PM2 monitoring
pm2 monit
```

## 🛠️ Troubleshooting Commands

### If PM2 Process is Down
```bash
pm2 restart amazon-monitor-auto
```

### If Configuration Issues
```bash
npm run setup
```

### If Chrome/Puppeteer Issues
```bash
sudo yum install -y chromium
export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
npm install puppeteer
pm2 restart amazon-monitor-auto
```

### If Memory Issues
```bash
free -h
pm2 restart amazon-monitor-auto
```

## 📊 Expected Performance (t2.small)

- **CPU Usage**: 15-25% average
- **Memory Usage**: 200-300MB
- **Disk Usage**: ~500MB
- **Network**: 200KB/hour

## 🔄 Maintenance Commands

### Daily Checks
```bash
pm2 status
pm2 logs amazon-monitor-auto --lines 10
```

### Weekly Maintenance
```bash
# Update code
git pull
npm install
pm2 restart amazon-monitor-auto

# Clean logs
pm2 flush
```

### Monthly Tasks
```bash
# Check system updates
sudo yum update -y

# Monitor disk space
df -h

# Check for any errors
pm2 logs amazon-monitor-auto --lines 100
```

## 🚨 Emergency Procedures

### If VM is Unresponsive
1. Restart VM from AWS Console
2. SSH back in
3. Check PM2 status: `pm2 status`
4. Restart if needed: `pm2 restart amazon-monitor-auto`

### If Application Crashes
```bash
pm2 logs amazon-monitor-auto --lines 50
pm2 restart amazon-monitor-auto
```

### If Configuration Lost
```bash
npm run setup
pm2 restart amazon-monitor-auto
```

## 📱 Telegram Bot Commands

### Test Bot
```bash
# Send test message
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/sendMessage" \
     -H "Content-Type: application/json" \
     -d '{"chat_id":"<YOUR_CHANNEL_ID>","text":"Test message from Amazon Job Monitor"}'
```

### Get Bot Info
```bash
curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getMe"
```

## 💰 Cost Monitoring

### Monthly Costs (Estimated)
- **t2.small**: ~$17/month
- **Storage**: ~$0.80/month
- **Data Transfer**: ~$1/month
- **Total**: ~$19/month

### Cost Optimization Tips
1. Monitor usage with AWS CloudWatch
2. Consider t2.micro for testing (cheaper)
3. Use spot instances for cost savings (not recommended for production)

## ✅ Success Indicators

Your deployment is successful when:
- [ ] PM2 shows `amazon-monitor-auto` as `online`
- [ ] Logs show "Starting Amazon Job Monitor"
- [ ] Logs show "Auth token extracted successfully"
- [ ] Logs show "Found X jobs" messages
- [ ] Telegram bot can send messages to channel
- [ ] No error messages in logs
- [ ] CPU and memory usage are within expected ranges

## 📞 Support Contacts

- **AWS Support**: If VM issues
- **Telegram @BotFather**: If bot issues
- **GitHub Issues**: If code issues

## 📋 Quick Reference Commands

```bash
# Status
pm2 status

# Logs
pm2 logs amazon-monitor-auto

# Restart
pm2 restart amazon-monitor-auto

# Stop
pm2 stop amazon-monitor-auto

# Start
pm2 start amazon-monitor-auto

# Monitor
pm2 monit

# Setup
npm run setup
```
