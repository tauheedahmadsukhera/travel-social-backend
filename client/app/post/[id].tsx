
import React from 'react';
import PostScreen from '../post-main';

export default function PostDynamic() {
  // No props passed, PostScreen will use useLocalSearchParams internally
  return <PostScreen />;
}
