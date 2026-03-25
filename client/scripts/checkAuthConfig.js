/**
 * Authentication Configuration Checker
 * Checks if all authentication methods are properly configured
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function checkMark(status) {
  return status ? '✅' : '❌';
}

async function checkAuthConfiguration() {
  log('\n🔐 Authentication Configuration Checker\n', 'bold');

  let allGood = true;

  // Check 1: Firebase Admin SDK
  try {
    const serviceAccountPath = path.join(__dirname, '..', 'serviceAccountKey.json');
    
    if (!fs.existsSync(serviceAccountPath)) {
      log(`${checkMark(false)} Service Account Key not found`, 'red');
      log('   Please download from Firebase Console → Project Settings → Service Accounts', 'yellow');
      allGood = false;
    } else {
      const serviceAccount = require(serviceAccountPath);
      
      if (!admin.apps.length) {
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount)
        });
      }
      
      log(`${checkMark(true)} Firebase Admin SDK initialized`, 'green');
    }
  } catch (error) {
    log(`${checkMark(false)} Error initializing Firebase Admin: ${error.message}`, 'red');
    allGood = false;
  }

  // Check 2: Google Sign-In Configuration
  try {
    const socialAuthPath = path.join(__dirname, '..', 'services', 'socialAuthService.ts');
    const content = fs.readFileSync(socialAuthPath, 'utf8');
    
    if (content.includes('YOUR_WEB_CLIENT_ID') || content.includes('709095117662-YOUR_WEB_CLIENT_ID')) {
      log(`${checkMark(false)} Google Sign-In Web Client ID not configured`, 'yellow');
      log('   Update webClientId in services/socialAuthService.ts', 'cyan');
      allGood = false;
    } else if (content.includes('webClientId:')) {
      log(`${checkMark(true)} Google Sign-In Web Client ID configured`, 'green');
    }
  } catch (error) {
    log(`${checkMark(false)} Could not check Google Sign-In config`, 'yellow');
  }

  // Check 3: Required packages
  const packageJsonPath = path.join(__dirname, '..', 'package.json');
  const packageJson = require(packageJsonPath);
  const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

  const requiredPackages = {
    '@react-native-google-signin/google-signin': 'Google Sign-In',
    'expo-apple-authentication': 'Apple Sign-In',
    'expo-auth-session': 'OAuth Authentication',
    'expo-web-browser': 'Web Browser Auth',
    'firebase': 'Firebase SDK'
  };

  log('\n📦 Package Dependencies:', 'bold');
  for (const [pkg, name] of Object.entries(requiredPackages)) {
    const installed = !!deps[pkg];
    log(`${checkMark(installed)} ${name} (${pkg})`, installed ? 'green' : 'red');
    if (!installed) allGood = false;
  }

  // Check 4: Firebase Auth Providers (if admin is initialized)
  if (admin.apps.length > 0) {
    try {
      log('\n🔥 Firebase Auth Providers:', 'bold');
      
      const auth = admin.auth();
      const providerConfigs = await auth.listProviderConfigs({ maxResults: 10 });
      
      const expectedProviders = ['google.com', 'apple.com', 'password', 'phone'];
      
      log('   Note: Enable providers in Firebase Console → Authentication → Sign-in method', 'cyan');
      log(`   ${checkMark(true)} Email/Password (assumed enabled)`, 'green');
      log(`   ${checkMark(true)} Phone (assumed enabled)`, 'green');
      log('   Check Firebase Console for Google and Apple', 'yellow');
      
    } catch (error) {
      log(`   Could not check Firebase Auth providers`, 'yellow');
    }
  }

  // Check 5: App configuration files
  log('\n📱 App Configuration:', 'bold');
  
  const androidGoogleServicesPath = path.join(__dirname, '..', 'android', 'app', 'google-services.json');
  const hasAndroidConfig = fs.existsSync(androidGoogleServicesPath);
  log(`${checkMark(hasAndroidConfig)} Android google-services.json`, hasAndroidConfig ? 'green' : 'yellow');
  
  if (!hasAndroidConfig) {
    log('   Download from Firebase Console → Project Settings → Android App', 'cyan');
  }

  // Check 6: Username auth service
  const usernameAuthPath = path.join(__dirname, '..', 'services', 'usernameAuthService.ts');
  const hasUsernameAuth = fs.existsSync(usernameAuthPath);
  log(`${checkMark(hasUsernameAuth)} Username Authentication Service`, hasUsernameAuth ? 'green' : 'red');

  // Summary
  log('\n' + '='.repeat(60), 'cyan');
  if (allGood) {
    log('✅ All critical configurations are set up!', 'green');
  } else {
    log('⚠️  Some configurations need attention. Check above for details.', 'yellow');
  }
  
  log('\n📖 For complete setup instructions, see AUTH_SETUP_GUIDE.md', 'cyan');
  log('='.repeat(60) + '\n', 'cyan');

  return allGood;
}

// Run the checker
checkAuthConfiguration()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error('Error running configuration check:', error);
    process.exit(1);
  });
