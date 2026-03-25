import { collection, doc, getDoc, getDocs, getFirestore, query, updateDoc, where } from "firebase/firestore";

const db = getFirestore();

export async function archiveConversation(conversationId, userId) {
  try {
    const convoRef = doc(db, "conversations", conversationId);
    await updateDoc(convoRef, { [`archived_${userId}`]: true });
    return { success: true };
  } catch (error) {
    return { success: false, error };
  }
}

export async function unarchiveConversation(conversationId, userId) {
  try {
    const convoRef = doc(db, "conversations", conversationId);
    await updateDoc(convoRef, { [`archived_${userId}`]: false });
    return { success: true };
  } catch (error) {
    return { success: false, error };
  }
}

export async function getArchivedConversations(userId) {
  try {
    const q = query(
      collection(db, "conversations"),
      where(`archived_${userId}`, "==", true)
    );
    const snapshot = await getDocs(q);
    const data = [];
    for (const docSnap of snapshot.docs) {
      const convo = docSnap.data();
      // Find the other user in the conversation
      let otherUserId = null;
      if (convo.participants && Array.isArray(convo.participants)) {
        otherUserId = convo.participants.find(uid => uid !== userId);
      } else if (convo.userIds && Array.isArray(convo.userIds)) {
        otherUserId = convo.userIds.find(uid => uid !== userId);
      }
      let otherUser = null;
      if (otherUserId) {
        const userDoc = await getDoc(doc(db, "users", otherUserId));
        if (userDoc.exists()) {
          otherUser = userDoc.data();
        }
      }
      data.push({ id: docSnap.id, ...convo, otherUser });
    }
    return { success: true, data };
  } catch (error) {
    return { success: false, error, data: [] };
  }
}