
import React from 'react';
import Profile from '../user-profile';

export default function UserProfileDynamic() {
  // No props passed, Profile will use useLocalSearchParams internally
  return <Profile />;
}
