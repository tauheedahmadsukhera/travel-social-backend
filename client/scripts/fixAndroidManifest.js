const fs = require('fs');
const path = require('path');

const manifests = [
  'node_modules/react-native-app-auth/android/src/main/AndroidManifest.xml',
  'node_modules/@react-native-community/netinfo/android/src/main/AndroidManifest.xml',
  'node_modules/@react-native-google-signin/google-signin/android/src/main/AndroidManifest.xml',
  'node_modules/react-native-safe-area-context/android/src/main/AndroidManifest.xml',
];

manifests.forEach((manifest) => {
  const filePath = path.join(__dirname, '..', manifest);
  if (fs.existsSync(filePath)) {
    try {
      let content = fs.readFileSync(filePath, 'utf8');
      const originalContent = content;
      // Remove package attribute from manifest tag
      content = content.replace(/\spackage="[^"]*"/, '');
      if (content !== originalContent) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`✓ Fixed: ${manifest}`);
      }
    } catch (error) {
      console.error(`✗ Error fixing ${manifest}:`, error.message);
    }
  }
});

// Enable Picture-in-Picture in app's AndroidManifest if present (after prebuild)
try {
  const appManifestPath = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
  if (fs.existsSync(appManifestPath)) {
    let xml = fs.readFileSync(appManifestPath, 'utf8');

    // Add uses-feature for PiP if missing
    if (!xml.includes('android.software.picture_in_picture')) {
      xml = xml.replace(
        /<manifest[\s\S]*?>/,
        (m) =>
          m.replace(
            '</manifest>',
            ''
          )
      );
      // Insert uses-feature right after <manifest> header
      xml = xml.replace(
        /<manifest[^>]*>/,
        (m) =>
          `${m}\n    <uses-feature android:name="android.software.picture_in_picture" android:required="false" />`
      );
    }

    // Add supportsPictureInPicture="true" to MainActivity
    if (!xml.includes('supportsPictureInPicture="true"')) {
      xml = xml.replace(
        /<activity[^>]*MainActivity[^>]*>/,
        (m) => {
          if (m.includes('supportsPictureInPicture')) return m; 
          return m.replace('>', ' android:supportsPictureInPicture="true" android:resizeableActivity="true">');
        }
      );
    }

    fs.writeFileSync(appManifestPath, xml, 'utf8');
    console.log('✓ Enabled Picture-in-Picture in AndroidManifest');
  } else {
    console.log('ℹ️ AndroidManifest not found (Expo managed) — will be patched after prebuild');
  }
} catch (e) {
  console.error('✗ Error enabling PiP in AndroidManifest:', e.message);
}
