const { withAndroidManifest } = require('expo/config-plugins');

/**
 * Config plugin to fix AndroidManifest.xml:
 * 1. Replaces ${appAuthRedirectScheme} placeholder with actual value
 * 2. Forces windowSoftInputMode=adjustResize on MainActivity so keyboard
 *    shrinks the window instead of panning the entire UI off-screen.
 */
const withAndroidManifestFix = (config) => {
  return withAndroidManifest(config, (config) => {
    const { modResults } = config;
    const mainApplication = modResults.manifest.application[0];

    if (!mainApplication || !mainApplication.activity) {
      console.warn('⚠️ Could not find activity in AndroidManifest.xml');
      return config;
    }

    // Find MainActivity
    const mainActivity = mainApplication.activity.find(
      (activity) => activity.$['android:name'] === '.MainActivity'
    );

    if (!mainActivity) {
      console.warn('⚠️ Could not find MainActivity');
      return config;
    }

    // ✅ FIX 1: Force adjustResize so keyboard shrinks the window instead of panning
    // This prevents the header from being pushed off-screen when keyboard opens.
    mainActivity.$['android:windowSoftInputMode'] = 'adjustResize';
    console.log('✅ Set windowSoftInputMode=adjustResize on MainActivity');

    if (!mainActivity['intent-filter']) {
      return config;
    }

    // Find the intent-filter with BROWSABLE category
    const browsableFilter = mainActivity['intent-filter'].find((filter) => {
      return filter.category?.some(
        (cat) => cat.$['android:name'] === 'android.intent.category.BROWSABLE'
      );
    });

    if (!browsableFilter || !browsableFilter.data) {
      console.warn('⚠️ Could not find BROWSABLE intent-filter');
      return config;
    }

    // ✅ FIX 2: Replace ${appAuthRedirectScheme} with actual value
    let fixed = false;
    browsableFilter.data = browsableFilter.data.map((dataItem) => {
      if (dataItem.$['android:scheme'] === '${appAuthRedirectScheme}') {
        fixed = true;
        return {
          $: {
            'android:scheme': 'trave-social'
          }
        };
      }
      return dataItem;
    });

    if (fixed) {
      console.log('✅ Fixed ${appAuthRedirectScheme} placeholder in AndroidManifest.xml');
    } else {
      const hasTraveScheme = browsableFilter.data.some(
        (dataItem) => dataItem.$['android:scheme'] === 'trave-social'
      );
      if (!hasTraveScheme) {
        browsableFilter.data.unshift({
          $: {
            'android:scheme': 'trave-social'
          }
        });
        console.log('✅ Added trave-social scheme to AndroidManifest.xml');
      }
    }

    return config;
  });
};

module.exports = withAndroidManifestFix;

