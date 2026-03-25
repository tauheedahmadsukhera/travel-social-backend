#!/usr/bin/env node

/**
 * Quick Auth Setup Script
 * Helps configure authentication for the app
 */

const readline = require('readline');
const fs = require('fs');
const path = require('path');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function setupAuth() {
  log('\n🚀 Authentication Quick Setup\n', 'bold');
  
  log('This script will help you configure authentication for your app.', 'cyan');
  log('You can skip any step by pressing Enter.\n', 'cyan');

  // Step 1: Google Web Client ID
  log('📱 Step 1: Google Sign-In Configuration', 'bold');
  log('Get your Web Client ID from:', 'cyan');
  log('Firebase Console → Project Settings → Your apps → Web app\n', 'yellow');
  
  const webClientId = await question('Enter your Google Web Client ID (or press Enter to skip): ');
  
  if (webClientId && webClientId.trim()) {
    try {
      const socialAuthPath = path.join(__dirname, '..', 'services', 'socialAuthService.ts');
      let content = fs.readFileSync(socialAuthPath, 'utf8');
      
      // Replace the placeholder
      content = content.replace(
        /webClientId:\s*['"]709095117662-YOUR_WEB_CLIENT_ID\.apps\.googleusercontent\.com['"]/g,
        `webClientId: '${webClientId.trim()}'`
      );
      
      fs.writeFileSync(socialAuthPath, content, 'utf8');
      log('✅ Google Web Client ID configured!\n', 'green');
    } catch (error) {
      log(`❌ Error updating Web Client ID: ${error.message}\n`, 'yellow');
    }
  } else {
    log('⏭️  Skipped Google Web Client ID\n', 'yellow');
  }

  // Step 2: Download google-services.json
  log('📥 Step 2: Android Configuration', 'bold');
  log('Download google-services.json from:', 'cyan');
  log('Firebase Console → Project Settings → Android App → Download google-services.json', 'yellow');
  log('Place it in: android/app/google-services.json\n', 'yellow');
  
  const hasAndroidConfig = await question('Have you downloaded google-services.json? (y/n): ');
  if (hasAndroidConfig.toLowerCase() === 'y') {
    log('✅ Great! Make sure it\'s in android/app/google-services.json\n', 'green');
  } else {
    log('⏭️  Remember to download it later for Android builds\n', 'yellow');
  }

  // Step 3: Enable Auth Providers
  log('🔥 Step 3: Firebase Auth Providers', 'bold');
  log('Make sure these are enabled in Firebase Console:', 'cyan');
  log('Firebase Console → Authentication → Sign-in method\n', 'yellow');
  log('  1. Email/Password', 'cyan');
  log('  2. Phone', 'cyan');
  log('  3. Google', 'cyan');
  log('  4. Apple (for iOS)\n', 'cyan');
  
  const providersEnabled = await question('Have you enabled these providers? (y/n): ');
  if (providersEnabled.toLowerCase() === 'y') {
    log('✅ Perfect!\n', 'green');
  } else {
    log('⏭️  Remember to enable them in Firebase Console\n', 'yellow');
  }

  // Step 4: SHA-1 Fingerprint (Android)
  log('🔐 Step 4: Android SHA-1 Fingerprint (Optional)', 'bold');
  log('For Google Sign-In on Android, add SHA-1 fingerprint:', 'cyan');
  log('Run: cd android && ./gradlew signingReport', 'yellow');
  log('Then add SHA-1 to Firebase Console → Project Settings → Android App\n', 'yellow');
  
  const generateSHA1 = await question('Do you want to generate SHA-1 now? (y/n): ');
  if (generateSHA1.toLowerCase() === 'y') {
    log('\n📝 Run this command in a new terminal:', 'cyan');
    log('cd android && gradlew signingReport\n', 'yellow');
  } else {
    log('⏭️  You can do this later\n', 'yellow');
  }

  // Summary
  log('═'.repeat(60), 'cyan');
  log('✅ Setup Complete!', 'green');
  log('═'.repeat(60), 'cyan');
  
  log('\n📖 Next Steps:', 'bold');
  log('1. Run: node scripts/checkAuthConfig.js (to verify setup)', 'cyan');
  log('2. Test authentication in your app', 'cyan');
  log('3. Check AUTH_SETUP_GUIDE.md for detailed instructions', 'cyan');
  log('\n🎉 Happy coding!\n', 'green');

  rl.close();
}

setupAuth().catch(error => {
  console.error('Error during setup:', error);
  rl.close();
  process.exit(1);
});
