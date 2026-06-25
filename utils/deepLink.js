/**
 * Deep Link Utility
 * Generates URLs that can be handled by the mobile app (Expo Linking / Firebase Dynamic Links)
 */

const APP_SCHEME = 'travelsocial';
const WEB_DOMAIN = 'travelsocial.app'; // Replace with actual production domain

/**
 * Generate a deep link for a user profile
 * @param {string} userId - The unique identifier of the user
 * @returns {string} The deep link URL
 */
const getProfileDeepLink = (userId) => {
  return `${APP_SCHEME}://user/${userId}`;
};

/**
 * Generate a deep link for a post
 * @param {string} postId - The unique identifier of the post
 * @returns {string} The deep link URL
 */
const getPostDeepLink = (postId) => {
  return `${APP_SCHEME}://post/${postId}`;
};

/**
 * Generate a universal link (HTTPS) that works on web and redirects to app
 * @param {string} path - e.g., 'user/123' or 'post/456'
 * @returns {string} The universal link URL
 */
const getUniversalLink = (path) => {
  return `https://${WEB_DOMAIN}/${path}`;
};

module.exports = {
  getProfileDeepLink,
  getPostDeepLink,
  getUniversalLink
};
