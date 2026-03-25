#!/usr/bin/env node

/**
 * Fix Development Build Connection Issues
 * Helps resolve java.net.ConnectException errors
 */

const { execSync } = require('child_process');
const os = require('os');

console.log('\n🔧 FIXING DEVELOPMENT BUILD CONNECTION...\n');

// Get local IP addresses
function getLocalIPs() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal and non-IPv4 addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  
  return ips;
}

const localIPs = getLocalIPs();

console.log('📱 LOCAL IP ADDRESSES:');
localIPs.forEach(ip => {
  console.log(`   ${ip}`);
});

console.log('\n✅ NETWORK CONFIG UPDATED:');
console.log('   - localhost, 127.0.0.1');
console.log('   - 10.0.2.2 (Android Emulator)');
console.log('   - 192.168.x.x (Local Network)');
console.log('   - expo.dev, exp.direct');

console.log('\n🚀 SOLUTIONS:\n');

console.log('1️⃣  RESTART METRO BUNDLER:');
console.log('   npm start -- --reset-cache\n');

console.log('2️⃣  REBUILD ANDROID APP:');
console.log('   cd android && .\\gradlew clean');
console.log('   cd .. && npx expo run:android\n');

console.log('3️⃣  CHECK DEVICE CONNECTION:');
console.log('   adb devices');
console.log('   (Make sure device is listed)\n');

console.log('4️⃣  IF USING PHYSICAL DEVICE:');
console.log('   - Phone and PC must be on SAME WiFi');
console.log('   - Use local IP from above list');
console.log('   - Shake phone → "Change Bundle Location"');
console.log(`   - Enter: ${localIPs[0] || 'YOUR_IP'}:8081\n`);

console.log('5️⃣  IF USING EMULATOR:');
console.log('   - Use: 10.0.2.2:8081');
console.log('   - Or run: adb reverse tcp:8081 tcp:8081\n');

console.log('6️⃣  REBUILD DEVELOPMENT BUILD:');
console.log('   eas build --profile development --platform android\n');

console.log('⚠️  COMMON ISSUES:');
console.log('   × Firewall blocking Metro (port 8081)');
console.log('   × Different WiFi networks');
console.log('   × VPN interfering with connection');
console.log('   × Metro bundler not running\n');

console.log('📞 QUICK FIX COMMAND:');
console.log('   npm start -- --reset-cache --clear\n');

console.log('════════════════════════════════════════════\n');
