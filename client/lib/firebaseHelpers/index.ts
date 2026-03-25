// Export all helpers from individual modules
export * from './archive';
export * from './comments';
export * from './conversation';
export { deleteStory } from './deleteStory';
export * from './follow';
export * from './highlights';
export * from './live';
export * from './messages';
export * from './notification';
export * from './passport';
export * from './post';
export { updateUserSectionsOrder } from './updateUserSectionsOrder';
export * from './user';

// Import and re-export from core logic
import firebaseHelpersDefault from './core';

// Re-export the default object
export default firebaseHelpersDefault;

// Auth functions - re-export directly if possible or from default
export const signInUser = firebaseHelpersDefault.signInUser;
export const signUpUser = firebaseHelpersDefault.signUpUser;
export const getCurrentUser = firebaseHelpersDefault.getCurrentUser;
export const getCurrentUserSync = firebaseHelpersDefault.getCurrentUserSync;
export const getCurrentUid = firebaseHelpersDefault.getCurrentUid;
export const isApprovedFollower = firebaseHelpersDefault.isApprovedFollower;
export const getUserHighlights = firebaseHelpersDefault.getUserHighlights;
export const getUserStories = firebaseHelpersDefault.getUserStories;
export const getUserSectionsSorted = firebaseHelpersDefault.getUserSectionsSorted;
export const getPassportTickets = firebaseHelpersDefault.getPassportTickets;

// Other exported functions
export const sendFollowRequest = firebaseHelpersDefault.sendFollowRequest;
export const rejectFollowRequest = firebaseHelpersDefault.rejectFollowRequest;
export const addNotification = firebaseHelpersDefault.addNotification;
export const updateUserProfile = firebaseHelpersDefault.updateUserProfile;
export const uploadImage = firebaseHelpersDefault.uploadImage;
export const uploadMedia = firebaseHelpersDefault.uploadMedia;
export const deleteImage = firebaseHelpersDefault.deleteImage;
export const getCategories = firebaseHelpersDefault.getCategories;
export const getUserSections = firebaseHelpersDefault.getUserSections;
export const addUserSection = firebaseHelpersDefault.addUserSection;
export const updateUserSection = firebaseHelpersDefault.updateUserSection;
export const deleteUserSection = firebaseHelpersDefault.deleteUserSection;
export const getLocationVisitCount = firebaseHelpersDefault.getLocationVisitCount;
export const getAllPosts = firebaseHelpersDefault.getAllPosts;
export const createPost = firebaseHelpersDefault.createPost;
export const getUserPosts = firebaseHelpersDefault.getUserPosts;
export const getFeedPosts = firebaseHelpersDefault.getFeedPosts;
export const deletePost = firebaseHelpersDefault.deletePost;
export const addComment = firebaseHelpersDefault.addComment;
export const likeComment = firebaseHelpersDefault.likeComment;
export const unlikeComment = firebaseHelpersDefault.unlikeComment;
export const getPostComments = firebaseHelpersDefault.getPostComments;
export const deleteComment = firebaseHelpersDefault.deleteComment;
export const editComment = firebaseHelpersDefault.editComment;
export const addCommentReply = firebaseHelpersDefault.addCommentReply;
export const createStory = firebaseHelpersDefault.createStory;
export const getActiveStories = firebaseHelpersDefault.getActiveStories;
export const joinLiveStream = firebaseHelpersDefault.joinLiveStream;
export const leaveLiveStream = firebaseHelpersDefault.leaveLiveStream;
export const subscribeToLiveStream = firebaseHelpersDefault.subscribeToLiveStream;
export const addLikedStatusToPosts = firebaseHelpersDefault.addLikedStatusToPosts;
export const getRegions = firebaseHelpersDefault.getRegions;
export const fetchMessages = firebaseHelpersDefault.fetchMessages;
export const toggleUserPrivacy = firebaseHelpersDefault.toggleUserPrivacy;

// Default categories
export const DEFAULT_CATEGORIES = [
  { name: 'Travel', image: 'https://via.placeholder.com/80x80?text=Travel' },
  { name: 'Food', image: 'https://via.placeholder.com/80x80?text=Food' },
  { name: 'Adventure', image: 'https://via.placeholder.com/80x80?text=Adventure' },
  { name: 'Culture', image: 'https://via.placeholder.com/80x80?text=Culture' },
  { name: 'Nature', image: 'https://via.placeholder.com/80x80?text=Nature' },
  { name: 'Nightlife', image: 'https://via.placeholder.com/80x80?text=Nightlife' }
];

// Ensure default categories exist
export async function ensureDefaultCategories() {
  try {
    // Categories are now hardcoded, no backend call needed
    return { success: true, data: DEFAULT_CATEGORIES };
  } catch (error) {
    console.error('Error ensuring categories:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
