#!/usr/bin/env node

// Load environment variables from .env file
require('dotenv').config();

const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Amazon Job Monitor - Modular System');
console.log('=====================================\n');

// Check if environment variables are set
if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHANNEL_ID) {
    console.error('❌ Missing required environment variables!');
    console.error('Please set TELEGRAM_BOT_TOKEN and TELEGRAM_CHANNEL_ID');
    console.error('\nExample:');
    console.error('  set TELEGRAM_BOT_TOKEN=your_bot_token');
    console.error('  set TELEGRAM_CHANNEL_ID=@your_channel');
    console.error('\nOr run with:');
    console.error('  node start-monitor.js');
    process.exit(1);
}

console.log('✅ Environment variables found');
console.log(`📱 Channel: ${process.env.TELEGRAM_CHANNEL_ID}`);
console.log(`🔑 Token: ${process.env.TELEGRAM_BOT_TOKEN.substring(0, 20)}...`);
console.log('\n🎯 Starting Amazon Job Monitor...\n');

// Start the main monitor
const monitor = spawn('node', ['auto-token-monitor.js'], {
    stdio: 'inherit',
    env: process.env
});

monitor.on('error', (error) => {
    console.error('❌ Failed to start monitor:', error.message);
    process.exit(1);
});

monitor.on('close', (code) => {
    console.log(`\n🛑 Monitor process exited with code ${code}`);
    process.exit(code);
});

// Handle process termination
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down...');
    monitor.kill('SIGINT');
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Shutting down...');
    monitor.kill('SIGTERM');
});
