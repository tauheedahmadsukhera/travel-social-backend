/**
 * Script to add Android and iOS apps to Firebase project
 * This will automatically register apps in Firebase Console
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const https = require('https');

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

// Firebase project details from app.json
const projectId = 'travel-app-3da72';
const androidPackage = 'com.tauhee56.travesocial';
const iosBundleId = 'com.tauhee56.travesocial';
const appName = 'trave-social';

async function downloadFile(url, destination) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destination);
    https.get(url, (response) => {
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(destination, () => {});
      reject(err);
    });
  });
}

async function addFirebaseApps() {
  log('\n🔥 Firebase Apps Setup\n', 'bold');
  
  try {
    // Initialize Firebase Admin
    const serviceAccountPath = path.join(__dirname, '..', 'serviceAccountKey.json');
    
    if (!fs.existsSync(serviceAccountPath)) {
      log('❌ serviceAccountKey.json not found!', 'red');
      log('Please download from Firebase Console → Project Settings → Service Accounts', 'yellow');
      log('→ Generate new private key → Save as serviceAccountKey.json in project root\n', 'yellow');
      process.exit(1);
    }

    const serviceAccount = require(serviceAccountPath);
    
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: projectId
      });
    }

    log('✅ Firebase Admin SDK initialized\n', 'green');
    
    // Note: Firebase Admin SDK doesn't have direct methods to add apps
    // We need to use Firebase Management API
    
    log('📱 Firebase Apps Configuration:', 'bold');
    log(`   Project ID: ${projectId}`, 'cyan');
    log(`   Android Package: ${androidPackage}`, 'cyan');
    log(`   iOS Bundle ID: ${iosBundleId}\n`, 'cyan');
    
    log('🔧 Manual Steps Required:', 'yellow');
    log('\n1. Go to Firebase Console:', 'bold');
    log(`   https://console.firebase.google.com/project/${projectId}/settings/general\n`, 'cyan');
    
    log('2. Add Android App:', 'bold');
    log('   → Click "Add app" → Select Android', 'cyan');
    log(`   → Android package name: ${androidPackage}`, 'cyan');
    log('   → App nickname: Travel Social (optional)', 'cyan');
    log('   → Download google-services.json', 'cyan');
    log('   → Place in: android/app/google-services.json\n', 'cyan');
    
    log('3. Add iOS App:', 'bold');
    log('   → Click "Add app" → Select iOS', 'cyan');
    log(`   → iOS bundle ID: ${iosBundleId}`, 'cyan');
    log('   → App nickname: Travel Social (optional)', 'cyan');
    log('   → Download GoogleService-Info.plist', 'cyan');
    log('   → Place in: ios/ folder (when you build iOS)\n', 'cyan');
    
    log('4. Enable Authentication:', 'bold');
    log('   → Go to Authentication → Sign-in method', 'cyan');
    log('   → Enable: Email/Password, Phone, Google, Apple\n', 'cyan');
    
    log('5. For Google Sign-In on Android:', 'bold');
    log('   → Get SHA-1 fingerprint:', 'cyan');
    log('     cd android && ./gradlew signingReport', 'yellow');
    log('   → Add to Firebase Console → Project Settings → Android App → Add Fingerprint\n', 'cyan');

    // Generate template google-services.json
    const googleServicesTemplate = {
      "project_info": {
        "project_number": "709095117662",
        "project_id": projectId,
        "storage_bucket": "travel-app-3da72.firebasestorage.app"
      },
      "client": [
        {
          "client_info": {
            "mobilesdk_app_id": "1:709095117662:android:DOWNLOAD_FROM_FIREBASE",
            "android_client_info": {
              "package_name": androidPackage
            }
          },
          "oauth_client": [
            {
              "client_id": "709095117662-DOWNLOAD_FROM_FIREBASE.apps.googleusercontent.com",
              "client_type": 3
            }
          ],
          "api_key": [
            {
              "current_key": "AIzaSyC_0pHFGAK5YySB--8hL3Ctz-u1cx4vaCk"
            }
          ],
          "services": {
            "appinvite_service": {
              "other_platform_oauth_client": [
                {
                  "client_id": "709095117662-DOWNLOAD_FROM_FIREBASE.apps.googleusercontent.com",
                  "client_type": 3
                }
              ]
            }
          }
        }
      ],
      "configuration_version": "1"
    };

    const androidAppDir = path.join(__dirname, '..', 'android', 'app');
    const googleServicesPath = path.join(androidAppDir, 'google-services.json');
    
    if (!fs.existsSync(googleServicesPath)) {
      fs.writeFileSync(
        googleServicesPath, 
        JSON.stringify(googleServicesTemplate, null, 2),
        'utf8'
      );
      log('📝 Created template google-services.json', 'yellow');
      log('   ⚠️  This is a TEMPLATE - Download actual file from Firebase Console!\n', 'red');
    } else {
      log('✅ google-services.json already exists\n', 'green');
    }

    // Create iOS GoogleService-Info.plist template
    const plistTemplate = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CLIENT_ID</key>
  <string>709095117662-DOWNLOAD_FROM_FIREBASE.apps.googleusercontent.com</string>
  <key>REVERSED_CLIENT_ID</key>
  <string>com.googleusercontent.apps.709095117662-DOWNLOAD_FROM_FIREBASE</string>
  <key>API_KEY</key>
  <string>AIzaSyC_0pHFGAK5YySB--8hL3Ctz-u1cx4vaCk</string>
  <key>GCM_SENDER_ID</key>
  <string>709095117662</string>
  <key>PLIST_VERSION</key>
  <string>1</string>
  <key>BUNDLE_ID</key>
  <string>${iosBundleId}</string>
  <key>PROJECT_ID</key>
  <string>${projectId}</string>
  <key>STORAGE_BUCKET</key>
  <string>travel-app-3da72.firebasestorage.app</string>
  <key>IS_ADS_ENABLED</key>
  <false></false>
  <key>IS_ANALYTICS_ENABLED</key>
  <false></false>
  <key>IS_APPINVITE_ENABLED</key>
  <true></true>
  <key>IS_GCM_ENABLED</key>
  <true></true>
  <key>IS_SIGNIN_ENABLED</key>
  <true></true>
  <key>GOOGLE_APP_ID</key>
  <string>1:709095117662:ios:DOWNLOAD_FROM_FIREBASE</string>
</dict>
</plist>`;

    const iosDir = path.join(__dirname, '..', 'ios');
    if (!fs.existsSync(iosDir)) {
      fs.mkdirSync(iosDir, { recursive: true });
    }
    
    const plistPath = path.join(iosDir, 'GoogleService-Info.plist');
    if (!fs.existsSync(plistPath)) {
      fs.writeFileSync(plistPath, plistTemplate, 'utf8');
      log('📝 Created template GoogleService-Info.plist', 'yellow');
      log('   ⚠️  This is a TEMPLATE - Download actual file from Firebase Console!\n', 'red');
    } else {
      log('✅ GoogleService-Info.plist already exists\n', 'green');
    }

    log('═'.repeat(70), 'cyan');
    log('✅ Setup Script Complete!', 'green');
    log('═'.repeat(70), 'cyan');
    
    log('\n📋 Next Steps:', 'bold');
    log('1. Open Firebase Console:', 'cyan');
    log(`   https://console.firebase.google.com/project/${projectId}/settings/general\n`, 'yellow');
    
    log('2. Add Android and iOS apps following the steps above', 'cyan');
    log('3. Download ACTUAL config files (google-services.json & GoogleService-Info.plist)', 'cyan');
    log('4. Replace template files with actual downloaded files', 'cyan');
    log('5. Run: npm run check-auth\n', 'cyan');

  } catch (error) {
    log(`\n❌ Error: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  }
}

// Run the script
addFirebaseApps()
  .then(() => {
    log('✅ Done!\n', 'green');
    process.exit(0);
  })
  .catch((error) => {
    log(`\n❌ Error: ${error.message}`, 'red');
    process.exit(1);
  });
