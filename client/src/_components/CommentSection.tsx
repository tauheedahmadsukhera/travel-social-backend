import { Feather, Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Keyboard,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  addComment,
  addCommentReaction,
  addCommentReply,
  deleteComment,
  deleteCommentReply,
  editComment,
  editCommentReply,
  getPostComments,
} from "../../lib/firebaseHelpers/comments";
import { feedEventEmitter } from "../../lib/feedEventEmitter";
import CommentAvatar from "./CommentAvatar";
import { useUser } from "./UserContext";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
export type Comment = {
  id: string;
  text: string;
  userAvatar: string;
  userName: string;
  userId: string;
  createdAt?: any;
  editedAt?: any;
  replies?: Comment[];
  reactions?: { [userId: string]: string };
};

export interface CommentSectionProps {
  postId: string;
  postOwnerId: string;
  currentAvatar: string;
  currentUser?: any;
  maxHeight?: number;
  showInput?: boolean;
  highlightedCommentId?: string;
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────
export const CommentSection: React.FC<CommentSectionProps> = ({
  postId,
  postOwnerId,
  currentAvatar,
  currentUser: userProp,
  maxHeight = 400,
  showInput = true,
  highlightedCommentId,
}) => {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [replyTo, setReplyTo] = useState<{ id: string; userName: string; text: string } | null>(null);
  const [replyText, setReplyText] = useState("");

  const insets = useSafeAreaInsets();

  // Update state whenever the external prop changes
  const [editingComment, setEditingComment] = useState<{
    id: string;
    text: string;
    isReply: boolean;
    parentId?: string;
  } | null>(null);

  const listRef = useRef<FlatList<Comment>>(null);
  const newCommentRef = useRef("");
  const replyTextRef = useRef("");
  const userFromContext = useUser();
  const currentUser = userProp || userFromContext;

  const listMaxHeightStyle = typeof maxHeight === "number" ? { maxHeight } : null;

  // ─── Load comments ───
  useEffect(() => { loadComments(); }, [postId]);

  const normalizeId = (val: any): string => {
    if (typeof val === "string") return val;
    if (val && typeof val === "object")
      return String(val._id || val.id || val.uid || val.userId || val.firebaseUid || "");
    return String(val || "");
  };

  const loadComments = async () => {
    try {
      setLoading(true);
      const res = await getPostComments(postId);
      // getPostComments returns { success, data } or array directly
      const raw = Array.isArray(res) ? res : (res?.data ?? []);
      const mapComment = (c: any): Comment => ({
        id: normalizeId(c._id || c.id),
        text: c.text || "",
        userAvatar: c.userAvatar || "",
        userName: c.userName || "User",
        userId: normalizeId(c.userId),
        createdAt: c.createdAt,
        editedAt: c.editedAt,
        replies: Array.isArray(c.replies) ? c.replies.map(mapComment) : [],
        reactions: c.reactions || {},
      });
      setComments(Array.isArray(raw) ? raw.map(mapComment) : []);
    } catch (e) {
      console.error("[CommentSection] loadComments error:", e);
      setComments([]);
    } finally {
      setLoading(false);
    }
  };

  // ─── Current user helpers ───
  const getCurrentUserId = (): string => {
    if (typeof currentUser === "string") return currentUser;
    return currentUser?.uid || currentUser?.id || currentUser?.userId || currentUser?.firebaseUid || currentUser?._id || "";
  };

  const getCurrentUserName = (): string => {
    if (typeof currentUser === "object")
      return currentUser?.displayName || currentUser?.name || currentUser?.userName || "User";
    return "User";
  };

  // ─── Add comment ───
  // API: addComment(postId, userId, userName, userAvatar, text)
  const handleAddComment = async (overrideText?: string) => {
    const text = (overrideText ?? newCommentRef.current).trim();
    if (!text || isSubmitting) return;
    const uid = getCurrentUserId();
    if (!uid) return;

    setIsSubmitting(true);
    const tempId = `temp_${Date.now()}`;
    const tempComment: Comment = {
      id: tempId,
      text,
      userAvatar: currentAvatar,
      userName: getCurrentUserName(),
      userId: uid,
      createdAt: new Date(),
      replies: [],
      reactions: {},
    };
    setComments((prev) => [tempComment, ...prev]);
    setNewComment("");
    newCommentRef.current = "";

    try {
      const res = await addComment(postId, uid, getCurrentUserName(), currentAvatar, text);
      if (res?.data?._id || res?.data?.id) {
        const realId = normalizeId(res.data._id || res.data.id);
        setComments((prev) => prev.map((c) => (c.id === tempId ? { ...c, id: realId } : c)));
      }
      feedEventEmitter.emit("commentAdded", { postId });
    } catch (e) {
      console.error("[CommentSection] addComment error:", e);
      setComments((prev) => prev.filter((c) => c.id !== tempId));
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── Add reply ───
  // API: addCommentReply(postId, parentCommentId, replyObj)
  const handleAddReply = async (overrideText?: string) => {
    if (!replyTo) return;
    const text = (overrideText ?? replyTextRef.current).trim();
    if (!text || isSubmitting) return;
    const uid = getCurrentUserId();
    if (!uid) return;

    setIsSubmitting(true);
    const tempReply: Comment = {
      id: `temp_reply_${Date.now()}`,
      text,
      userAvatar: currentAvatar,
      userName: getCurrentUserName(),
      userId: uid,
      createdAt: new Date(),
    };
    const parentId = replyTo.id;
    setComments((prev) =>
      prev.map((c) => (c.id === parentId ? { ...c, replies: [...(c.replies || []), tempReply] } : c))
    );
    setReplyTo(null);
    setReplyText("");
    replyTextRef.current = "";

    try {
      await addCommentReply(postId, parentId, {
        userId: uid,
        userName: getCurrentUserName(),
        userAvatar: currentAvatar,
        text,
      });
    } catch (e) {
      console.error("[CommentSection] addReply error:", e);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── Edit comment ───
  // API: editComment(postId, commentId, userId, newText)
  // API: editCommentReply(postId, commentId, replyId, userId, newText)
  const handleEditComment = async () => {
    if (!editingComment) return;
    const text = editingComment.text.trim();
    if (!text) return;
    const uid = getCurrentUserId();

    try {
      if (editingComment.isReply && editingComment.parentId) {
        await editCommentReply(postId, editingComment.parentId, editingComment.id, uid, text);
        setComments((prev) =>
          prev.map((c) =>
            c.id === editingComment.parentId
              ? {
                ...c,
                replies: (c.replies || []).map((r) =>
                  r.id === editingComment.id ? { ...r, text, editedAt: new Date() } : r
                ),
              }
              : c
          )
        );
      } else {
        await editComment(postId, editingComment.id, uid, text);
        setComments((prev) =>
          prev.map((c) => (c.id === editingComment.id ? { ...c, text, editedAt: new Date() } : c))
        );
      }
    } catch (e) {
      console.error("[CommentSection] editComment error:", e);
    } finally {
      setEditingComment(null);
    }
  };

  // ─── Delete comment ───
  // API: deleteComment(postId, commentId, userId, postOwnerId)
  // API: deleteCommentReply(postId, commentId, replyId, userId, postOwnerId)
  const handleDeleteComment = (commentId: string, isReply: boolean, parentId?: string) => {
    Alert.alert("Delete Comment", "Delete this comment?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            const uid = getCurrentUserId();
            if (isReply && parentId) {
              await deleteCommentReply(postId, parentId, commentId, uid, postOwnerId);
              setComments((prev) =>
                prev.map((c) =>
                  c.id === parentId
                    ? { ...c, replies: (c.replies || []).filter((r) => r.id !== commentId) }
                    : c
                )
              );
            } else {
              await deleteComment(postId, commentId, uid, postOwnerId);
              setComments((prev) => prev.filter((c) => c.id !== commentId));
              feedEventEmitter.emit("commentDeleted", { postId });
            }
          } catch (e) {
            console.error("[CommentSection] deleteComment error:", e);
          }
        },
      },
    ]);
  };

  // ─── Heart reaction ───
  const handleHeart = async (commentId: string) => {
    const uid = getCurrentUserId();
    if (!uid) return;
    setComments((prev) =>
      prev.map((c) => {
        if (c.id !== commentId) return c;
        const reactions = { ...(c.reactions || {}) };
        if (reactions[uid]) {
          delete reactions[uid];
        } else {
          reactions[uid] = "heart";
        }
        return { ...c, reactions };
      })
    );
    try {
      await addCommentReaction(postId, commentId, uid, "heart");
    } catch (e) {
      console.error("[CommentSection] handleHeart error:", e);
    }
  };

  // ─── Time ago ───
  const getTimeAgo = (timestamp: any): string => {
    if (!timestamp) return "";
    const time = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
    const diff = Date.now() - time.getTime();
    const m = Math.floor(diff / 60000);
    const h = Math.floor(diff / 3600000);
    const d = Math.floor(diff / 86400000);
    if (m < 1) return "now";
    if (m < 60) return `${m}m`;
    if (h < 24) return `${h}h`;
    if (d < 7) return `${d}d`;
    return `${Math.floor(d / 7)}w`;
  };

  // ─────────────────────────────────────────────
  // Render comment (Instagram style — NO bubble)
  // ─────────────────────────────────────────────
  const renderComment = (comment: Comment, isReply = false, parentId?: string) => {
    const uid = getCurrentUserId();
    const isOwner = uid === comment.userId;
    const canDelete = isOwner || uid === postOwnerId;
    const reactions = comment.reactions || {};
    const heartCount = Object.keys(reactions).length;
    const userLiked = uid ? !!reactions[uid] : false;

    return (
      <View key={comment.id} style={[styles.commentRow, isReply && styles.replyRow]}>
        {/* Avatar */}
        <CommentAvatar
          userId={comment.userId}
          userAvatar={comment.userAvatar}
          size={isReply ? 30 : 40}
        />

        {/* Body */}
        <View style={styles.commentBody}>
          <View style={styles.commentMeta}>
            <Text style={styles.commentUserName}>{comment.userName}</Text>
            <Text style={styles.commentTime}>{getTimeAgo(comment.createdAt)}</Text>
            {comment.editedAt && <Text style={styles.editedLabel}> · edited</Text>}
          </View>
          <Text style={styles.commentText}>{comment.text}</Text>
          <View style={styles.commentActions}>
            {!isReply && (
              <TouchableOpacity
                onPress={() => setReplyTo({ id: comment.id, userName: comment.userName, text: comment.text })}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Text style={styles.actionText}>Reply</Text>
              </TouchableOpacity>
            )}
            {canDelete && (
              <TouchableOpacity
                onPress={() =>
                  Alert.alert("Comment Options", "", [
                    { text: "Cancel", style: "cancel" },
                    ...(isOwner
                      ? [{ text: "Edit", onPress: () => setEditingComment({ id: comment.id, text: comment.text, isReply, parentId }) }]
                      : []),
                    { text: "Delete", style: "destructive", onPress: () => handleDeleteComment(comment.id, isReply, parentId) },
                  ])
                }
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Feather name="more-horizontal" size={13} color="#bbb" />
              </TouchableOpacity>
            )}
          </View>
          {!isReply && comment.replies && comment.replies.length > 0 && (
            <View style={styles.repliesContainer}>
              {comment.replies.map((r) => (
                <View key={r.id}>{renderComment(r, true, comment.id)}</View>
              ))}
            </View>
          )}
        </View>

        {/* Heart — far right */}
        <TouchableOpacity
          style={styles.heartCol}
          onPress={() => handleHeart(comment.id)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}
        >
          <Ionicons
            name={userLiked ? "heart" : "heart-outline"}
            size={isReply ? 14 : 16}
            color={userLiked ? "#e74c3c" : "#ccc"}
          />
          {heartCount > 0 && <Text style={styles.heartCount}>{heartCount}</Text>}
        </TouchableOpacity>
      </View>
    );
  };

  // ─────────────────────────────────────────────
  // Main render
  // ─────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* Scrollable area: flex:1 so footer is always at bottom */}
      <View style={{ flex: 1 }}>
        {loading ? (
          <View style={styles.centeredBox}>
            <ActivityIndicator size="small" color="#999" />
          </View>
        ) : comments.length === 0 ? (
          <View style={styles.centeredBox}>
            <Feather name="message-circle" size={40} color="#ddd" />
            <Text style={styles.emptyText}>No comments yet</Text>
            <Text style={styles.emptySubtext}>Be the first to comment!</Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            style={styles.list}
            contentContainerStyle={{ paddingTop: 6, paddingBottom: 8 }}
            data={comments}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => renderComment(item)}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="always"
            keyboardDismissMode="on-drag"
          />
        )}
      </View>

      {/* ── Instagram-style sticky footer (emoji row + input) ── */}
      {showInput && (
        <View style={[styles.footer, { paddingBottom: Platform.OS === 'android' ? Math.max(insets.bottom, 12) : Math.max(insets.bottom, 12) }]}>
          {/* Replying-to banner */}
          {replyTo && (
            <View style={styles.replyBanner}>
              <Text style={styles.replyBannerText}>
                Replying to{' '}
                <Text style={styles.replyBannerName}>@{replyTo.userName}</Text>
              </Text>
              <TouchableOpacity onPress={() => { setReplyTo(null); setReplyText(''); }}>
                <Feather name="x" size={14} color="#888" />
              </TouchableOpacity>
            </View>
          )}

          {/* Emoji quick-reaction row (simplified) */}
          <View style={styles.emojiRow}>
            {['❤️', '🙌', '🔥', '👏', '😢', '😍', '😮', '😂'].map((emoji) => (
              <TouchableOpacity
                key={emoji}
                style={styles.emojiBtn}
                onPress={() => {
                  if (emoji === '➕') {
                    // Could open a full emoji picker here, for now rely on native keyboard.
                    // Or ideally we shouldn't show this if we can't implement it easily without a library.
                    // Let's just remove the static list and keep it clean, or keep standard 8.
                  } else {
                    if (replyTo) {
                      const next = replyTextRef.current + emoji;
                      replyTextRef.current = next;
                      setReplyText(next);
                    } else {
                      const next = newCommentRef.current + emoji;
                      newCommentRef.current = next;
                      setNewComment(next);
                    }
                  }
                }}
              >
                <Text style={styles.emojiText}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Input row: avatar + pill input + emoji/send */}
          <View style={styles.inputRow}>
            <Image
              source={{ uri: currentAvatar && currentAvatar.trim() !== '' ? currentAvatar : 'https://via.placeholder.com/200x200.png?text=Profile' }}
              style={styles.inputAvatar}
            />
            <TextInput
              style={styles.input}
              placeholder={replyTo ? 'Write a reply...' : 'Add a comment...'}
              placeholderTextColor="#aaa"
              value={replyTo ? replyText : newComment}
              onChangeText={(t) => {
                if (replyTo) { replyTextRef.current = t; setReplyText(t); }
                else { newCommentRef.current = t; setNewComment(t); }
              }}
              multiline
              maxLength={500}
              blurOnSubmit={false}
              returnKeyType="default"
              editable={!isSubmitting}
            />
            <TouchableOpacity
              style={styles.sendBtn}
              onPress={() => {
                const text = replyTo ? replyTextRef.current : newCommentRef.current;
                Keyboard.dismiss();
                if (replyTo) handleAddReply(text);
                else handleAddComment(text);
              }}
              disabled={!(replyTo ? replyText : newComment).trim() || isSubmitting}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#0095f6" />
              ) : (
                <Text
                  style={[
                    styles.sendText,
                    !(replyTo ? replyText : newComment).trim() && styles.sendTextDisabled,
                  ]}
                >
                  Post
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}


      {/* Edit Modal */}
      {editingComment && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setEditingComment(null)}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
            <View style={styles.editOverlay}>
              <View style={styles.editSheet}>
                <View style={styles.editHeader}>
                  <Text style={styles.editTitle}>Edit Comment</Text>
                  <TouchableOpacity onPress={() => setEditingComment(null)}>
                    <Feather name="x" size={22} color="#333" />
                  </TouchableOpacity>
                </View>
                <TextInput
                  style={styles.editInput}
                  value={editingComment.text}
                  onChangeText={(t) => setEditingComment({ ...editingComment, text: t })}
                  multiline
                  autoFocus
                  maxLength={500}
                />
                <View style={styles.editActions}>
                  <TouchableOpacity style={styles.editCancel} onPress={() => setEditingComment(null)}>
                    <Text style={styles.editCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.editSave} onPress={handleEditComment}>
                    <Text style={styles.editSaveText}>Save</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      )}
    </View>
  );
};

export default CommentSection;

// ─────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { flex: 1 },
  centeredBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
    gap: 8,
  },
  emptyText: { fontSize: 15, fontWeight: "600", color: "#888", marginTop: 12 },
  emptySubtext: { fontSize: 13, color: "#bbb" },

  // ── Comment row (Instagram — no bubble) ──
  commentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  replyRow: {
    paddingHorizontal: 0,
    paddingTop: 10,
    paddingBottom: 0,
    marginLeft: 52,
    gap: 10,
  },
  commentBody: { flex: 1 },
  commentMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 3,
  },
  commentUserName: { fontSize: 13, fontWeight: "700", color: "#111" },
  commentTime: { fontSize: 12, color: "#aaa" },
  editedLabel: { fontSize: 11, color: "#bbb", fontStyle: "italic" },
  commentText: { fontSize: 14, color: "#111", lineHeight: 20 },
  commentActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginTop: 6,
  },
  actionText: { fontSize: 12, color: "#888", fontWeight: "600" },
  repliesContainer: { marginTop: 4 },

  // Heart (far right)
  heartCol: {
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 2,
    minWidth: 26,
    gap: 2,
  },
  heartCount: { fontSize: 11, color: "#aaa", textAlign: "center" },

  // ── Sticky footer: emoji row + input ──
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#eee',
    backgroundColor: '#fff',
  },
  emojiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f0f0f0',
  },
  emojiBtn: {
    padding: 4,
    borderRadius: 20,
  },
  emojiText: {
    fontSize: 22,
  },
  replyBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 0,
  },
  replyBannerText: { fontSize: 13, color: "#666" },
  replyBannerName: { fontWeight: "700", color: "#222" },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingLeft: 16,
    paddingRight: 16,
    paddingVertical: 10,
  },
  inputAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#eee",
  },
  input: {
    flex: 1,
    backgroundColor: "#f0f0f0",
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
    fontSize: 14,
    color: "#111",
    maxHeight: 100,
  },
  sendBtn: { paddingHorizontal: 4 },
  sendText: { fontSize: 14, fontWeight: "700", color: "#0095f6" },
  sendTextDisabled: { color: "#b3d4f5" },

  // ── Edit Modal ──
  editOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    padding: 24,
  },
  editSheet: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
  editHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  editTitle: { fontSize: 16, fontWeight: "700", color: "#111" },
  editInput: {
    backgroundColor: "#f5f5f5",
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: "#111",
    minHeight: 70,
    textAlignVertical: "top",
    marginBottom: 14,
  },
  editActions: { flexDirection: "row", gap: 10 },
  editCancel: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    backgroundColor: "#f0f0f0",
    alignItems: "center",
  },
  editCancelText: { fontWeight: "600", color: "#666", fontSize: 15 },
  editSave: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    backgroundColor: "#0095f6",
    alignItems: "center",
  },
  editSaveText: { fontWeight: "700", color: "#fff", fontSize: 15 },
});
