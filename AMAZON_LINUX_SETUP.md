# Amazon Linux 2023 Setup Guide

This guide is specifically tailored for your Amazon Linux 2023 VM (t2.small) setup.

## 🖥️ Your VM Specifications
- **Instance Type**: t2.small (2 vCPUs, 2GB RAM)
- **OS**: Amazon Linux 2023
- **Storage**: 8GB
- **Security Group**: launch-wizard-1

## 🚀 Quick Setup (Recommended)

### 1. Connect to Your VM
```bash
ssh -i your-key.pem ec2-user@your-vm-ip
```

### 2. Clone the Repository
```bash
cd /home/ec2-user
git clone <your-repo-url>
cd amazon-job-monitor
```

### 3. Run the Deployment Script
```bash
chmod +x deploy.sh
./deploy.sh
```

The script will automatically:
- Update system packages
- Install Node.js 18.x
- Install PM2 process manager
- Install Chrome dependencies for Puppeteer
- Install project dependencies
- Start the monitor with PM2

## 🔧 Manual Setup (Alternative)

If you prefer manual setup:

### 1. Update System
```bash
sudo yum update -y
```

### 2. Install Node.js
```bash
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs
```

### 3. Install PM2
```bash
sudo npm install -g pm2
```

### 4. Install Chrome Dependencies
```bash
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
```

### 5. Install Project Dependencies
```bash
npm install
```

### 6. Run Setup
```bash
npm run setup
```

### 7. Start with PM2
```bash
pm2 start auto-token-monitor.js --name "amazon-monitor-auto"
pm2 save
pm2 startup
```

## 🔒 Security Group Configuration

Your security group `launch-wizard-1` needs these rules:

### Inbound Rules:
- **SSH (22)** - Your IP only
- **HTTP (80)** - 0.0.0.0/0 (optional, for web monitoring)
- **HTTPS (443)** - 0.0.0.0/0 (optional, for web monitoring)

### Outbound Rules:
- **All traffic** - 0.0.0.0/0 (default)

## 📊 Resource Monitoring

### Expected Resource Usage (t2.small):
- **CPU**: 15-25% average
- **RAM**: 200-300MB (includes Chrome)
- **Storage**: ~500MB (application + logs)
- **Network**: 200KB/hour

### Monitor Resources:
```bash
# Check system resources
htop

# Check PM2 status
pm2 status

# Check logs
pm2 logs amazon-monitor-auto

# Monitor in real-time
pm2 monit
```

## 🛠️ Troubleshooting

### Common Issues on Amazon Linux 2023:

1. **Chrome/Puppeteer Issues:**
```bash
# If Chrome fails to start
sudo yum install -y chromium
export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
npm install puppeteer
```

2. **Permission Issues:**
```bash
# Fix ownership
sudo chown -R ec2-user:ec2-user /home/ec2-user/amazon-job-monitor
```

3. **Memory Issues:**
```bash
# Check memory usage
free -h
# If low memory, restart PM2
pm2 restart amazon-monitor-auto
```

4. **Node.js Version Issues:**
```bash
# Check Node.js version
node --version
# Should be 18.x or higher
```

## 📱 Telegram Setup Reminder

Before running the script, make sure you have:

1. **Telegram Bot Token** from @BotFather
2. **Telegram Channel** created
3. **Bot added as admin** to the channel
4. **Channel ID** (e.g., @channelname or -1001234567890)

## 🔄 Maintenance Commands

```bash
# Check status
pm2 status amazon-monitor-auto

# View recent logs
pm2 logs amazon-monitor-auto --lines 50

# Restart monitor
pm2 restart amazon-monitor-auto

# Update and restart
git pull
npm install
pm2 restart amazon-monitor-auto

# Stop monitor
pm2 stop amazon-monitor-auto

# Start monitor
pm2 start amazon-monitor-auto
```

## 💰 Cost Optimization

Your t2.small instance costs approximately:
- **Compute**: ~$17/month
- **Storage**: ~$0.80/month
- **Data Transfer**: ~$1/month
- **Total**: ~$19/month

## 🎯 Performance Tips

1. **Use t2.small** (current) - good balance of performance and cost
2. **Monitor memory usage** - restart if it gets too high
3. **Keep logs clean** - use `pm2 flush` periodically
4. **Update regularly** - pull latest code for improvements

## 📞 Support

If you encounter issues:
1. Check logs: `pm2 logs amazon-monitor-auto`
2. Verify configuration: `npm run setup`
3. Check system resources: `htop`
4. Restart if needed: `pm2 restart amazon-monitor-auto`
