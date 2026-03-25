// Highlight-related Firestore helpers

/**
 * Create a new highlight
 */
export async function createHighlight(
  userId: string,
  name: string,
  coverImage: string,
  storyIds: string[] = []
) {
  try {
    const res = await fetch(`/api/highlights`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, title: name, items: storyIds.map(id => ({ id, coverImage })) })
    });
    const data = await res.json();
    
    // Unwrap response
    const highlightData = data?.data || data;
    const highlightId = highlightData?._id || highlightData?.id || data?.id;
    
    return { success: data.success, highlightId, highlight: highlightData };
  } catch (error: any) {
    console.error('❌ createHighlight error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Add a story to an existing highlight
 */
export async function addStoryToHighlight(highlightId: string, storyId: string) {
  try {
    const res = await fetch(`/api/highlights/${highlightId}/stories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storyId })
    });
    const data = await res.json();
    return data;
  } catch (error: any) {
    console.error('❌ addStoryToHighlight error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Remove a story from a highlight
 */
export async function removeStoryFromHighlight(highlightId: string, storyId: string) {
  try {
    const res = await fetch(`/api/highlights/${highlightId}/stories/${storyId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await res.json();
    return data;
  } catch (error: any) {
    console.error('❌ removeStoryFromHighlight error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Update highlight details (name, cover image)
 */
export async function updateHighlight(
  highlightId: string,
  updates: { name?: string; coverImage?: string }
) {
  try {
    const res = await fetch(`/api/highlights/${highlightId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: updates.name, coverImage: updates.coverImage })
    });
    const data = await res.json();
    return data;
  } catch (error: any) {
    console.error('❌ updateHighlight error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Delete a highlight
 */
export async function deleteHighlight(highlightId: string, userId: string) {
  try {
    const res = await fetch(`/api/highlights/${highlightId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    });
    const data = await res.json();
    return data;
  } catch (error: any) {
    console.error('❌ deleteHighlight error:', error);
    return { success: false, error: error.message };
  }
}

