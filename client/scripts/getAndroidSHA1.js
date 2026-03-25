#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');

console.log('\n🔐 Android SHA-1 Certificate Fingerprint Generator\n');
console.log('This will help you get the SHA-1 fingerprint needed for Google Sign-In on Android.\n');

const androidPath = path.join(__dirname, '..', 'android');

try {
  console.log('📱 Running Gradle signing report...\n');
  
  // For Windows
  const command = process.platform === 'win32' 
    ? 'gradlew.bat signingReport' 
    : './gradlew signingReport';
  
  const output = execSync(command, {
    cwd: androidPath,
    encoding: 'utf-8',
    stdio: 'pipe'
  });

  // Extract SHA-1 fingerprints
  const sha1Regex = /SHA1: ([A-F0-9:]+)/gi;
  const matches = output.match(sha1Regex);

  if (matches && matches.length > 0) {
    console.log('✅ Found SHA-1 Fingerprints:\n');
    
    const uniqueFingerprints = [...new Set(matches)];
    uniqueFingerprints.forEach((match, index) => {
      const fingerprint = match.replace('SHA1: ', '');
      console.log(`${index + 1}. ${fingerprint}`);
    });

    console.log('\n📋 Next Steps:\n');
    console.log('1. Copy the SHA-1 fingerprint above (Debug variant)');
    console.log('2. Go to Firebase Console: https://console.firebase.google.com');
    console.log('3. Select your project: travel-app-3da72');
    console.log('4. Go to Project Settings → Your Android app');
    console.log('5. Click "Add fingerprint"');
    console.log('6. Paste the SHA-1 fingerprint');
    console.log('7. Download the updated google-services.json');
    console.log('8. Replace android/app/google-services.json with the new file\n');

    console.log('⚠️  Note: For production, you\'ll also need to add the release SHA-1');
    console.log('   (generated when you create a release keystore)\n');

  } else {
    console.log('❌ Could not extract SHA-1 fingerprint from output');
    console.log('\nFull output:');
    console.log(output);
  }

} catch (error) {
  console.error('❌ Error running Gradle:', error.message);
  console.log('\n💡 Try running manually:');
  console.log('   cd android');
  console.log('   gradlew signingReport  (Windows)');
  console.log('   ./gradlew signingReport  (Mac/Linux)');
  console.log('\nLook for "SHA1:" in the output under "Variant: debug"\n');
}
