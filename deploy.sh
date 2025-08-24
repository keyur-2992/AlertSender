#!/bin/bash

# Amazon Job Monitor - Auto Token Extraction Deployment Script
# This script sets up a complete monitoring environment on a Linux server

set -e  # Exit on any error

echo "🚀 Starting Amazon Job Monitor Deployment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    print_error "Please don't run this script as root. Use a regular user with sudo privileges."
    exit 1
fi

# Update system packages
print_status "Updating system packages..."
sudo yum update -y
print_success "System packages updated"

# Install Node.js 18.x
print_status "Installing Node.js 18.x..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
    sudo yum install -y nodejs
    print_success "Node.js installed"
else
    print_warning "Node.js already installed: $(node --version)"
fi

# Install PM2 globally
print_status "Installing PM2 process manager..."
if ! command -v pm2 &> /dev/null; then
    sudo npm install -g pm2
    print_success "PM2 installed"
else
    print_warning "PM2 already installed: $(pm2 --version)"
fi

# Install Chrome dependencies for Puppeteer
print_status "Installing Chrome dependencies for Puppeteer..."
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
print_success "Chrome dependencies installed"

# Create project directory
PROJECT_DIR="/home/$(whoami)/amazon-job-monitor"
print_status "Creating project directory: $PROJECT_DIR"
mkdir -p "$PROJECT_DIR"
cd "$PROJECT_DIR"

# Check if files exist
if [ ! -f "package.json" ]; then
    print_error "package.json not found in current directory!"
    print_error "Please make sure you're running this script from the project directory."
    exit 1
fi

if [ ! -f "auto-token-monitor.js" ]; then
    print_error "auto-token-monitor.js not found in current directory!"
    print_error "Please make sure you're running this script from the project directory."
    exit 1
fi

# Configuration will be handled interactively by the script
print_status "Configuration will be prompted when the script starts"

# Install Node.js dependencies
print_status "Installing Node.js dependencies..."
npm install
print_success "Dependencies installed"

# Configuration will be handled interactively
print_status "Configuration will be prompted when the script starts"
print_success "No configuration file needed - interactive setup enabled"

# Stop existing PM2 process if running
print_status "Stopping existing PM2 processes..."
pm2 stop amazon-monitor-auto 2>/dev/null || true
pm2 delete amazon-monitor-auto 2>/dev/null || true

# Start the monitor with PM2
print_status "Starting Amazon Job Monitor with PM2..."
pm2 start auto-token-monitor.js --name "amazon-monitor-auto"
print_success "Monitor started with PM2"

# Save PM2 configuration
print_status "Saving PM2 configuration..."
pm2 save
print_success "PM2 configuration saved"

# Setup PM2 to start on boot
print_status "Setting up PM2 to start on boot..."
pm2 startup
print_success "PM2 startup configured"

# Create helper scripts
print_status "Creating helper scripts..."

# Status script
cat > status.sh << 'EOF'
#!/bin/bash
echo "=== Amazon Job Monitor Status ==="
pm2 status amazon-monitor-auto
echo ""
echo "=== Recent Logs ==="
pm2 logs amazon-monitor-auto --lines 20
EOF

# Restart script
cat > restart.sh << 'EOF'
#!/bin/bash
echo "Restarting Amazon Job Monitor..."
pm2 restart amazon-monitor-auto
echo "Monitor restarted!"
EOF

# Update script
cat > update.sh << 'EOF'
#!/bin/bash
echo "Updating Amazon Job Monitor..."
cd /home/$(whoami)/amazon-job-monitor
git pull 2>/dev/null || echo "No git repository found"
npm install
pm2 restart amazon-monitor-auto
echo "Monitor updated and restarted!"
EOF

# Make scripts executable
chmod +x status.sh restart.sh update.sh
print_success "Helper scripts created"

# Display final status
echo ""
print_success "🎉 Deployment completed successfully!"
echo ""
echo "📊 Current Status:"
pm2 status amazon-monitor-auto
echo ""
echo "📝 Useful Commands:"
echo "  ./status.sh     - Check monitor status and recent logs"
echo "  ./restart.sh    - Restart the monitor"
echo "  ./update.sh     - Update and restart the monitor"
echo "  pm2 logs amazon-monitor-auto --lines 50  - View recent logs"
echo "  pm2 monit       - Monitor system resources"
echo ""
echo "🔧 Configuration:"
echo "  Run the script interactively to configure settings"
echo "  Restart with: pm2 restart amazon-monitor-auto"
echo ""
echo "📱 Telegram Setup:"
echo "  Make sure your bot is added to the channel as admin"
echo "  Test by sending a message to your channel"
echo ""
print_success "Your Amazon Job Monitor is now running 24/7! 🚀"
