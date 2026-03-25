/**
 * @fileoverview Primary annotator interface for a single chat room.
 *
 * This is the most complex component in the application.  It handles both
 * annotation modes:
 *
 * **Disentanglement mode**:
 * - Renders `MessageBubble` components that accept thread-label assignment.
 * - Maintains `annotationsMap` (messageId → annotation[]) and `threadDetails`
 *   (threadId → { messages, annotators, annotations }) for the sidebar.
 * - Tracks `statistics` (annotated/total counts, per-thread breakdowns) for
 *   the instructions panel progress bar.
 * - Completion status is managed via the `update_completion` API.
 *
 * **Adjacency-pairs mode**:
 * - Renders `MessageBubble` in `relationMode`; drag-and-drop and right-click
 *   context-menu interactions create pending pairs.
 * - `AdjacencyRelationsCanvas` draws curved SVG arcs; `buildAdjacencyLines`
 *   is called via `useMemo` to produce stable lane assignments.
 * - Read-status (which turns the annotator has "read") is persisted to both
 *   `localStorage` (for offline-first responsiveness) and the backend
 *   (`updateReadStatus`).  Auto-completion is triggered when all turns are read.
 * - Reply-link click generates a `suggestedRelation` that the `SuggestedRelationEditor`
 *   lets the annotator confirm or discard.
 *
 * Shared infrastructure:
 * - `useMessagePositions` tracks per-bubble Y coordinates for SVG rendering.
 * - `useScrollToTop` shows a floating scroll-to-top button.
 * - Errors surface via a `Modal`-wrapped `ErrorMessage` (dismissible warning).
 * - `THREAD_COLORS` and `RELATION_COLORS` are fixed palettes cycled by index
 *   so colours are deterministic across renders without server involvement.
 */
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { projects as projectsApi, annotations as annotationsApi, adjacencyPairs as adjacencyPairsApi, auth } from '../utils/api';
import MessageBubble from './MessageBubble';
import SmartThreadCard from './SmartThreadCard';
import Modal from './Modal';
import ErrorMessage from './ErrorMessage';
import AdjacencyRelationsCanvas, { buildAdjacencyLines } from './AdjacencyRelationsCanvas';
import InstructionsPanel from './InstructionsPanel';
import { SelectedRelationEditor, SuggestedRelationEditor } from './RelationEditor';
import { useMessagePositions } from '../hooks/useMessagePositions';
import { useScrollToTop } from '../hooks/useScrollToTop';
import './AnnotatorChatRoomPage.css';

/**
 * Extract a display-friendly error string from an axios error object.
 * @param {Error} error
 * @returns {string}
 */
const parseApiError = (error) => {
  if (error.response?.data?.detail) return error.response.data.detail;
  return error.message || 'An unexpected error occurred';
};

/** Fixed colour palette cycled by thread index for deterministic thread colouring. */
const THREAD_COLORS = [
  '#3B82F6', '#8B5CF6', '#EF4444', '#10B981', '#F59E0B',
  '#EC4899', '#06B6D4', '#84CC16', '#92400E', '#6B7280',
  '#7C3AED', '#DC2626',
];

/** Fixed colour palette cycled by relation-type index for arc colouring in the SVG canvas. */
const RELATION_COLORS = [
  '#2563EB', '#16A34A', '#DC2626', '#9333EA',
  '#F59E0B', '#0EA5E9', '#14B8A6', '#F97316',
];

/**
 * Full-page annotator interface for a single chat room.
 *
 * Route params consumed: `projectId` and `roomId` from the URL.
 */
const AnnotatorChatRoomPage = () => {
  const { projectId, roomId } = useParams();
  const navigate = useNavigate();
  const messagesContentRef = useRef(null);

  // ── Data state ──────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState([]);
  const [annotationsMap, setAnnotationsMap] = useState({});
  const [allThreads, setAllThreads] = useState([]);
  const [threadDetails, setThreadDetails] = useState({});
  const [threadColors, setThreadColors] = useState({});
  const [project, setProject] = useState(null);
  const [annotationMode, setAnnotationMode] = useState('disentanglement');
  const [relationTypes, setRelationTypes] = useState([]);
  const [adjacencyPairs, setAdjacencyPairs] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [chatRoomName, setChatRoomName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [isCompletionSaving, setIsCompletionSaving] = useState(false);
  const [readStatus, setReadStatus] = useState({});
  const [statistics, setStatistics] = useState({
    totalMessages: 0, annotatedMessages: 0, unannotatedMessages: 0,
    annotationPercentage: 0, totalThreads: 0, messagesPerThread: {}, annotatorsPerThread: {}
  });

  // ── UI state ─────────────────────────────────────────────────────────────────
  const [highlightedUserId, setHighlightedUserId] = useState(null);
  const [hoveredUserId, setHoveredUserId] = useState(null);
  const [highlightedThreadId, setHighlightedThreadId] = useState(null);
  const [showInstructions, setShowInstructions] = useState(false);
  const [dragSourceMessageId, setDragSourceMessageId] = useState(null);
  const [dragHoverMessageId, setDragHoverMessageId] = useState(null);
  const [pairSourceMessageId, setPairSourceMessageId] = useState(null);
  const [pendingPair, setPendingPair] = useState(null);
  const [showPairModal, setShowPairModal] = useState(false);
  const [relationTypeColors, setRelationTypeColors] = useState({});
  const [selectedRelationId, setSelectedRelationId] = useState(null);
  const [hoveredRelationId, setHoveredRelationId] = useState(null);
  const [hoveredMessageId, setHoveredMessageId] = useState(null);
  const [replyHoverIds, setReplyHoverIds] = useState(null);
  const [suggestedRelation, setSuggestedRelation] = useState(null);
  const [suggestedRelationType, setSuggestedRelationType] = useState('');
  const [confirmMarkAll, setConfirmMarkAll] = useState({ open: false, nextValue: false });
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, targetMessageId: null });

  // ── Custom hooks ─────────────────────────────────────────────────────────────
  const { messagePositions, messagesScrollHeight, requestPositionUpdate } = useMessagePositions(messagesContentRef);
  const { showScrollToTop, scrollToTop } = useScrollToTop(messagesContentRef);

  // ── Helpers ──────────────────────────────────────────────────────────────────
  /**
   * Build the localStorage key used to persist this user's read-status map for
   * this specific room.  Scoped to project + room + user to avoid collisions.
   */
  const getReadStorageKey = useCallback(
    (userId) => `adjpairs-read:${projectId}:${roomId}:${userId}`,
    [projectId, roomId]
  );

  /**
   * Assign a colour from `THREAD_COLORS` to each thread, cycling through the
   * palette when there are more threads than colours.
   * @param {string[]} threads - Ordered array of thread label strings.
   */
  const assignThreadColors = useCallback((threads) => {
    const colors = {};
    threads.forEach((threadId, index) => { colors[threadId] = THREAD_COLORS[index % THREAD_COLORS.length]; });
    setThreadColors(colors);
  }, []);

  /**
   * Assign a colour from `RELATION_COLORS` to each relation type.
   * @param {string[]} types - Array of relation-type label strings.
   */
  const assignRelationTypeColors = useCallback((types) => {
    const colors = {};
    types.forEach((type, index) => { colors[type] = RELATION_COLORS[index % RELATION_COLORS.length]; });
    setRelationTypeColors(colors);
  }, []);

  /**
   * Produce a short (≤4 char) abbreviation of a relation-type label for use
   * as an SVG arc label.  Single-word types use the first 3 characters;
   * multi-word/hyphenated/underscored types use the initial of each word.
   *
   * @param {string} relationType
   * @returns {string} Upper-case abbreviation.
   */
  const abbreviateRelationType = useCallback((relationType) => {
    if (!relationType) return '';
    const words = relationType.split(/[\s_-]+/).filter(Boolean);
    if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
    return words.map((w) => w[0]).join('').slice(0, 4).toUpperCase();
  }, []);

  /**
   * Transform a flat annotation array into the keyed maps required for
   * rendering.  Populates `annotationsMap`, `allThreads`, `threadDetails`, and
   * thread colour assignments.
   *
   * @param {Object[]} annotationsData - Full annotation list for the room.
   */
  const processAnnotations = (annotationsData) => {
    const newAnnotationsMap = {};
    const threadsSet = new Set();
    const newThreadDetails = {};
    annotationsData.forEach(annotation => {
      if (!newAnnotationsMap[annotation.message_id]) newAnnotationsMap[annotation.message_id] = [];
      newAnnotationsMap[annotation.message_id].push(annotation);
      threadsSet.add(annotation.thread_id);
      if (!newThreadDetails[annotation.thread_id]) {
        newThreadDetails[annotation.thread_id] = { id: annotation.thread_id, messages: [], annotators: new Set(), annotations: [] };
      }
      newThreadDetails[annotation.thread_id].messages.push(annotation.message_id);
      newThreadDetails[annotation.thread_id].annotators.add(annotation.annotator_username);
      newThreadDetails[annotation.thread_id].annotations.push(annotation);
    });
    const threads = Array.from(threadsSet);
    setAnnotationsMap(newAnnotationsMap);
    setAllThreads(threads);
    setThreadDetails(newThreadDetails);
    assignThreadColors(threads);
  };

  /**
   * Compute annotation progress statistics and update the `statistics` state.
   *
   * Counts unique annotated message IDs (not annotation count, which would
   * double-count multi-annotator messages) and builds per-thread message and
   * annotator counts by collapsing intermediate `Set` objects.
   *
   * @param {Object[]} messagesData - All messages in the room.
   * @param {Object[]} annotationsData - All annotations in the room.
   */
  const calculateStatistics = useCallback((messagesData, annotationsData) => {
    const totalMessages = messagesData.length;
    const annotatedMessageIds = new Set(annotationsData.map(a => a.message_id));
    const annotatedMessages = annotatedMessageIds.size;
    const threadsSet = new Set(annotationsData.map(a => a.thread_id));
    const messagesPerThread = {};
    const annotatorsPerThread = {};
    annotationsData.forEach(a => {
      if (!messagesPerThread[a.thread_id]) messagesPerThread[a.thread_id] = new Set();
      messagesPerThread[a.thread_id].add(a.message_id);
      if (!annotatorsPerThread[a.thread_id]) annotatorsPerThread[a.thread_id] = new Set();
      annotatorsPerThread[a.thread_id].add(a.annotator_username);
    });
    Object.keys(messagesPerThread).forEach(t => {
      messagesPerThread[t] = messagesPerThread[t].size;
      annotatorsPerThread[t] = annotatorsPerThread[t].size;
    });
    setStatistics({
      totalMessages, annotatedMessages,
      unannotatedMessages: totalMessages - annotatedMessages,
      annotationPercentage: totalMessages > 0 ? Math.round((annotatedMessages / totalMessages) * 100) : 0,
      totalThreads: threadsSet.size, messagesPerThread, annotatorsPerThread
    });
  }, []);

  // ── Data fetching ─────────────────────────────────────────────────────────────
  /**
   * Fetch all data required for the annotation view in a single coordinated
   * async flow.
   *
   * Fetches project metadata first (synchronously) to determine which
   * mode-specific requests to include in the subsequent `Promise.all`.  The
   * adjacency-pairs branch fetches pairs and read-status; the disentanglement
   * branch fetches all annotations for the room.
   */
  const fetchChatRoomData = useCallback(async () => {
    if (isNaN(parseInt(projectId, 10)) || isNaN(parseInt(roomId, 10))) {
      setError('Invalid Project or Chat Room ID.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const projectData = await projectsApi.getProject(projectId);
      setProject(projectData);
      setAnnotationMode(projectData.annotation_type || 'disentanglement');
      setRelationTypes(projectData.relation_types || []);
      assignRelationTypeColors(projectData.relation_types || []);

      const requests = [
        projectsApi.getChatRoom(projectId, roomId),
        projectsApi.getChatMessages(projectId, roomId),
        auth.getCurrentUser(),
        projectsApi.getChatRoomCompletion(projectId, roomId),
      ];
      if (projectData.annotation_type === 'adjacency_pairs') {
        requests.push(adjacencyPairsApi.getChatRoomPairs(projectId, roomId));
        requests.push(projectsApi.getReadStatus(projectId, roomId));
      } else {
        requests.push(annotationsApi.getChatRoomAnnotations(projectId, roomId));
        requests.push(null);
      }

      const [chatRoomData, messagesResponse, userData, completionData, thirdPayload, readStatusFromServer] = await Promise.all(requests);
      setChatRoomName(chatRoomData?.name || '');
      const messagesData = messagesResponse.messages || [];
      setMessages(messagesData);
      setCurrentUser(userData);
      setIsCompleted(Boolean(completionData?.is_completed));

      if (projectData.annotation_type === 'adjacency_pairs') {
        setAdjacencyPairs(thirdPayload);
        setAnnotationsMap({});
        setAllThreads([]);
        setThreadDetails({});
        setThreadColors({});
        setStatistics(prev => ({ ...prev, totalMessages: messagesResponse.total ?? messagesData.length }));
        // Initialize read status from backend; fall back to localStorage
        if (readStatusFromServer && Object.keys(readStatusFromServer).length > 0) {
          setReadStatus(readStatusFromServer);
        }
        // If backend is empty and room is completed, mark all as read (handled by existing useEffect)
      } else {
        processAnnotations(thirdPayload);
        calculateStatistics(messagesData, thirdPayload);
      }
    } catch (err) {
      console.error('Error fetching chat room data:', err);
      setError(parseApiError(err));
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, roomId, calculateStatistics]);

  useEffect(() => { fetchChatRoomData(); }, [fetchChatRoomData]);

  useEffect(() => { requestPositionUpdate(); }, [messages, adjacencyPairs, requestPositionUpdate]);
  useEffect(() => { requestPositionUpdate(); }, [showInstructions, annotationMode, requestPositionUpdate]);

  // ── Completion sync ───────────────────────────────────────────────────────────
  /**
   * Persist the completion flag to the backend and update local state.
   * @param {boolean} nextValue - `true` to mark the room as complete.
   */
  const syncCompletionStatus = useCallback(async (nextValue) => {
    setIsCompletionSaving(true);
    try {
      await projectsApi.updateChatRoomCompletion(projectId, roomId, nextValue);
      setIsCompleted(nextValue);
    } catch (err) {
      setError(parseApiError(err));
    } finally {
      setIsCompletionSaving(false);
    }
  }, [projectId, roomId]);

  // ── Read-status persistence (adjacency pairs mode) ───────────────────────────
  useEffect(() => {
    if (annotationMode !== 'adjacency_pairs' || !currentUser) return;
    const key = getReadStorageKey(currentUser.id);
    const storedRaw = window.localStorage.getItem(key);
    let nextStatus = {};
    if (storedRaw) {
      try {
        const parsed = JSON.parse(storedRaw);
        if (parsed && typeof parsed === 'object') nextStatus = parsed;
      } catch { /* ignore */ }
    } else if (isCompleted && messages.length > 0) {
      messages.forEach(msg => { nextStatus[msg.id] = true; });
    }
    setReadStatus(nextStatus);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annotationMode, currentUser, getReadStorageKey, isCompleted, messages]);

  useEffect(() => {
    if (annotationMode !== 'adjacency_pairs' || !currentUser) return;
    const key = getReadStorageKey(currentUser.id);
    window.localStorage.setItem(key, JSON.stringify(readStatus));
  }, [annotationMode, currentUser, getReadStorageKey, readStatus]);

  const totalMessagesCount = messages.length;
  const readCount = messages.reduce((acc, msg) => acc + (readStatus[msg.id] ? 1 : 0), 0);
  const allRead = annotationMode === 'adjacency_pairs' && totalMessagesCount > 0 && readCount === totalMessagesCount;

  useEffect(() => {
    if (annotationMode !== 'adjacency_pairs') return;
    if (totalMessagesCount === 0) return;
    if (allRead === isCompleted) return;
    syncCompletionStatus(allRead);
  }, [annotationMode, totalMessagesCount, allRead, isCompleted, syncCompletionStatus]);

  // ── Context menu close on outside click ──────────────────────────────────────
  useEffect(() => {
    if (!contextMenu.visible) return;
    const handleClickOutside = () => setContextMenu({ visible: false, x: 0, y: 0, targetMessageId: null });
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [contextMenu.visible]);

  // ── Annotation handlers ───────────────────────────────────────────────────────
  /**
   * Create a disentanglement annotation for the given message and refresh all
   * annotation state.
   * @param {number} messageId
   * @param {string} threadName - Thread label to assign.
   */
  const handleCreateAnnotation = async (messageId, threadName) => {
    setIsSubmitting(true);
    try {
      await annotationsApi.createAnnotation(projectId, messageId, { message_id: messageId, thread_id: threadName });
      const annotationsData = await annotationsApi.getChatRoomAnnotations(projectId, roomId);
      processAnnotations(annotationsData);
      calculateStatistics(messages, annotationsData);
    } catch (err) {
      throw new Error(parseApiError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * Delete a disentanglement annotation and refresh all annotation state.
   * @param {number} messageId
   * @param {number} annotationId
   */
  const handleDeleteAnnotation = async (messageId, annotationId) => {
    setIsSubmitting(true);
    try {
      await annotationsApi.deleteAnnotation(projectId, messageId, annotationId);
      const annotationsData = await annotationsApi.getChatRoomAnnotations(projectId, roomId);
      processAnnotations(annotationsData);
      calculateStatistics(messages, annotationsData);
    } catch (err) {
      throw new Error(parseApiError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Adjacency pair handlers ───────────────────────────────────────────────────
  /**
   * Re-fetch the current user's adjacency pairs for this room and update state.
   * Returns the fresh array so callers can use it without waiting for a React
   * re-render.
   */
  const refreshAdjacencyPairs = useCallback(async () => {
    const pairs = await adjacencyPairsApi.getChatRoomPairs(projectId, roomId);
    setAdjacencyPairs(pairs);
    return pairs;
  }, [projectId, roomId]);

  /**
   * Map of `{messageId: listIndex}` for O(1) position look-up in direction
   * enforcement (adjacency pairs may only link a later turn to an earlier one).
   */
  const messageIndexMap = useMemo(() => {
    const map = {};
    messages.forEach((msg, idx) => { map[msg.id] = idx; });
    return map;
  }, [messages]);

  /**
   * Return `true` if linking `fromId` → `toId` is valid, i.e., `toId` appears
   * before `fromId` in the message list (SPP must come after FPP).  Returns
   * `true` defensively when either ID is missing from the index.
   *
   * @param {number|null} fromId - SPP message ID.
   * @param {number|null} toId - FPP message ID.
   * @returns {boolean}
   */
  const isBackwardLinkAllowed = useCallback((fromId, toId) => {
    if (fromId == null || toId == null) return true;
    const fromIndex = messageIndexMap[fromId];
    const toIndex = messageIndexMap[toId];
    if (fromIndex == null || toIndex == null) return true;
    return toIndex < fromIndex;
  }, [messageIndexMap]);

  /**
   * Record the drag source when a bubble drag begins in relation mode.
   * @param {number} messageId
   */
  const handlePairDragStart = (messageId) => {
    setDragSourceMessageId(messageId);
    setPairSourceMessageId(messageId);
  };

  /**
   * Complete a drag-and-drop pair creation.  Validates direction (SPP must
   * come after FPP), then opens the relation-type modal for the annotator to
   * confirm.
   * @param {number} targetMessageId - The drop-target message (intended FPP).
   */
  const handlePairDrop = (targetMessageId) => {
    if (!dragSourceMessageId || dragSourceMessageId === targetMessageId) {
      setDragSourceMessageId(null);
      setDragHoverMessageId(null);
      return;
    }
    if (!isBackwardLinkAllowed(dragSourceMessageId, targetMessageId)) {
      setError('You can only link a turn to an earlier turn.');
      setDragSourceMessageId(null);
      setDragHoverMessageId(null);
      return;
    }
    setPendingPair({ from: dragSourceMessageId, to: targetMessageId });
    setShowPairModal(true);
  };

  /**
   * Right-click handler in relation mode.  First click sets the source (SPP);
   * second click on a different bubble opens the relation-type context menu.
   * @param {number} messageId
   * @param {React.MouseEvent} event
   */
  const handlePairContextMenu = (messageId, event) => {
    if (annotationMode !== 'adjacency_pairs') return;
    event.preventDefault();
    if (!pairSourceMessageId || pairSourceMessageId === messageId) {
      setPairSourceMessageId(messageId);
      return;
    }
    setContextMenu({ visible: true, x: event.clientX, y: event.clientY, targetMessageId: messageId });
  };

  /**
   * Confirm creation of the pending pair (from the drag-and-drop modal) with
   * the selected relation type.
   * @param {string} relationType
   */
  const handleCreateAdjacencyPair = async (relationType) => {
    if (pendingPair && !isBackwardLinkAllowed(pendingPair.from, pendingPair.to)) {
      setError('You can only link a turn to an earlier turn.');
      setPendingPair(null);
      setShowPairModal(false);
      setDragSourceMessageId(null);
      setDragHoverMessageId(null);
      return;
    }
    if (!pendingPair) return;
    setIsSubmitting(true);
    try {
      await adjacencyPairsApi.createAdjacencyPair(projectId, roomId, {
        from_message_id: pendingPair.from, to_message_id: pendingPair.to, relation_type: relationType
      });
      await refreshAdjacencyPairs();
    } catch (err) {
      setError(parseApiError(err));
    } finally {
      setIsSubmitting(false);
      setPendingPair(null);
      setShowPairModal(false);
      setDragSourceMessageId(null);
      setDragHoverMessageId(null);
    }
  };

  /**
   * Create a pair directly from the right-click context menu (no modal).
   * @param {string} relationType - Selected relation type from the context menu.
   * @param {number} targetMessageId - The FPP message chosen by right-click.
   */
  const handleCreateAdjacencyPairDirect = async (relationType, targetMessageId) => {
    if (!isBackwardLinkAllowed(pairSourceMessageId, targetMessageId)) {
      setError('You can only link a turn to an earlier turn.');
      setContextMenu({ visible: false, x: 0, y: 0, targetMessageId: null });
      return;
    }
    if (!pairSourceMessageId || !targetMessageId || pairSourceMessageId === targetMessageId) return;
    setIsSubmitting(true);
    try {
      await adjacencyPairsApi.createAdjacencyPair(projectId, roomId, {
        from_message_id: pairSourceMessageId, to_message_id: targetMessageId, relation_type: relationType
      });
      await refreshAdjacencyPairs();
    } catch (err) {
      setError(parseApiError(err));
    } finally {
      setIsSubmitting(false);
      setContextMenu({ visible: false, x: 0, y: 0, targetMessageId: null });
    }
  };

  /**
   * Delete an adjacency pair and deselect it if it was selected.
   * @param {number} pairId
   */
  const handleDeleteAdjacencyPair = async (pairId) => {
    setIsSubmitting(true);
    try {
      await adjacencyPairsApi.deleteAdjacencyPair(projectId, roomId, pairId);
      await refreshAdjacencyPairs();
      if (selectedRelationId === pairId) setSelectedRelationId(null);
    } catch (err) {
      setError(parseApiError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * Change the relation type of an existing pair using a delete-then-create
   * pattern (the API has no PATCH endpoint for relation type).  After
   * creation, the newly created pair is located in the refreshed list and
   * selected so the editor panel remains open.
   * @param {Object} pair - Existing pair record.
   * @param {string} relationType - New relation type label.
   */
  const handleUpdateAdjacencyPair = async (pair, relationType) => {
    if (!pair || pair.relation_type === relationType) return;
    setIsSubmitting(true);
    try {
      await adjacencyPairsApi.deleteAdjacencyPair(projectId, roomId, pair.id);
      await adjacencyPairsApi.createAdjacencyPair(projectId, roomId, {
        from_message_id: pair.from_message_id, to_message_id: pair.to_message_id, relation_type: relationType
      });
      const pairs = await refreshAdjacencyPairs();
      const updated = pairs.find(p => p.from_message_id === pair.from_message_id && p.to_message_id === pair.to_message_id && p.relation_type === relationType);
      setSelectedRelationId(updated ? updated.id : null);
    } catch (err) {
      setError(parseApiError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * Handle a reply-indicator click in adjacency-pairs mode.
   *
   * Looks up the message whose `turn_id` matches the reply reference and, if
   * the direction is valid, creates a `suggestedRelation` that the
   * `SuggestedRelationEditor` presents for confirmation.
   *
   * @param {number} currentMessageId - ID of the message whose reply badge was clicked.
   * @param {string|number} replyToTurnId - The turn_id value from the reply reference.
   */
  const handleReplyClick = useCallback((currentMessageId, replyToTurnId) => {
    if (annotationMode !== 'adjacency_pairs') return;
    if (!replyToTurnId) return;
    const replyToMessage = messages.find(msg => String(msg.turn_id) === String(replyToTurnId));
    if (!replyToMessage) { setError('Reply target not found for this turn.'); return; }
    if (!isBackwardLinkAllowed(currentMessageId, replyToMessage.id)) { setError('You can only link a turn to an earlier turn.'); return; }
    setSuggestedRelation({ fppId: replyToMessage.id, sppId: currentMessageId });
    setSuggestedRelationType('');
    setSelectedRelationId(null);
  }, [annotationMode, messages, isBackwardLinkAllowed]);

  /**
   * Confirm and persist the reply-link suggested adjacency pair.
   */
  const handleConfirmSuggestedRelation = useCallback(async () => {
    if (!suggestedRelation || !suggestedRelationType) return;
    if (!isBackwardLinkAllowed(suggestedRelation.sppId, suggestedRelation.fppId)) {
      setError('You can only link a turn to an earlier turn.');
      return;
    }
    setIsSubmitting(true);
    try {
      await adjacencyPairsApi.createAdjacencyPair(projectId, roomId, {
        from_message_id: suggestedRelation.sppId, to_message_id: suggestedRelation.fppId, relation_type: suggestedRelationType
      });
      await refreshAdjacencyPairs();
      setSuggestedRelation(null);
      setSuggestedRelationType('');
    } catch (err) {
      setError(parseApiError(err));
    } finally {
      setIsSubmitting(false);
    }
  }, [suggestedRelation, suggestedRelationType, isBackwardLinkAllowed, projectId, roomId, refreshAdjacencyPairs]);

  // ── Interaction handlers ──────────────────────────────────────────────────────
  /**
   * Toggle highlighting for all turns from the clicked user.  Clears any
   * active thread highlight so only one type of highlight is active at a time.
   * @param {string} userId
   */
  const handleUserClick = (userId) => {
    setHighlightedUserId(highlightedUserId === userId ? null : userId);
    setHighlightedThreadId(null);
  };

  /**
   * Toggle highlighting for all turns in the clicked thread.  Clears any
   * active user highlight.
   * @param {string} threadId
   */
  const handleThreadClick = (threadId) => {
    setHighlightedThreadId(highlightedThreadId === threadId ? null : threadId);
    setHighlightedUserId(null);
  };

  /**
   * Highlight the reply chain when the reply indicator is hovered.  Resolves
   * `replyToTurnId` to a message object, then highlights both the current
   * message and its reply target by storing their IDs in `replyHoverIds`.
   * @param {number} currentMessageId
   * @param {string|number} replyToTurnId
   */
  const handleReplyHover = (currentMessageId, replyToTurnId) => {
    if (!replyToTurnId) { setReplyHoverIds(null); return; }
    const replyToMessage = messages.find(msg => String(msg.turn_id) === String(replyToTurnId));
    if (!replyToMessage) { setReplyHoverIds(null); return; }
    setReplyHoverIds(new Set([String(currentMessageId), String(replyToMessage.id)]));
  };

  /**
   * Scroll a specific message into view and briefly apply a highlight CSS
   * class to draw the user's attention to it.  Used when clicking a preview
   * row in `SmartThreadCard`.
   * @param {number} messageId
   */
  const handleMessageSelect = (messageId) => {
    const el = document.querySelector(`[data-message-id="${messageId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('message-selected');
      setTimeout(() => el.classList.remove('message-selected'), 2000);
    }
  };

  /**
   * Fire-and-forget backend sync for the current read-status map.  Errors are
   * logged but not surfaced to the user because the primary store is
   * `localStorage`; the backend is a secondary persistence layer.
   * @param {Object.<number, boolean>} statusMap - Map of `{messageId: isRead}`.
   */
  const syncReadStatusToBackend = useCallback((statusMap) => {
    if (annotationMode !== 'adjacency_pairs') return;
    projectsApi.updateReadStatus(projectId, roomId, statusMap).catch(err => {
      console.error('Failed to sync read status to backend:', err);
    });
  }, [annotationMode, projectId, roomId]);

  /**
   * Toggle the read flag for a single turn and sync the updated map to the
   * backend.
   * @param {number} messageId
   */
  const handleReadToggle = useCallback((messageId) => {
    setReadStatus(prev => {
      const next = { ...prev, [messageId]: !prev[messageId] };
      syncReadStatusToBackend(next);
      return next;
    });
  }, [syncReadStatusToBackend]);

  /**
   * Open the "mark all as read / unread" confirmation modal.  The `nextValue`
   * is derived from `allRead` so the button toggles correctly.
   */
  const handleMarkAllAsRead = () => {
    if (messages.length === 0) return;
    setConfirmMarkAll({ open: true, nextValue: !allRead });
  };

  /**
   * Apply the bulk read/unread toggle confirmed by the user.  Builds a new
   * status map with all messages set to `confirmMarkAll.nextValue`, syncs to
   * the backend, and closes the confirmation modal.
   */
  const applyMarkAll = useCallback(() => {
    const nextStatus = {};
    messages.forEach(msg => { nextStatus[msg.id] = confirmMarkAll.nextValue; });
    setReadStatus(nextStatus);
    syncReadStatusToBackend(nextStatus);
    setConfirmMarkAll({ open: false, nextValue: false });
  }, [messages, confirmMarkAll.nextValue, syncReadStatusToBackend]);

  // ── Derived state for adjacency canvas ───────────────────────────────────────
  const { linesWithLanes, relationsWidth, laneGap } = useMemo(
    () => buildAdjacencyLines(adjacencyPairs, messagePositions, relationTypeColors, abbreviateRelationType),
    [adjacencyPairs, messagePositions, relationTypeColors, abbreviateRelationType]
  );

  const selectedRelation = useMemo(
    () => adjacencyPairs.find(p => p.id === selectedRelationId) || null,
    [adjacencyPairs, selectedRelationId]
  );

  const suggestedFpp = useMemo(
    () => suggestedRelation ? messages.find(m => m.id === suggestedRelation.fppId) || null : null,
    [messages, suggestedRelation]
  );

  const suggestedSpp = useMemo(
    () => suggestedRelation ? messages.find(m => m.id === suggestedRelation.sppId) || null : null,
    [messages, suggestedRelation]
  );

  const hoveredRelation = useMemo(
    () => adjacencyPairs.find(p => p.id === hoveredRelationId) || null,
    [adjacencyPairs, hoveredRelationId]
  );

  const hoveredRelations = useMemo(
    () => hoveredMessageId
      ? adjacencyPairs.filter(p => p.from_message_id === hoveredMessageId || p.to_message_id === hoveredMessageId)
      : [],
    [adjacencyPairs, hoveredMessageId]
  );

  const hoveredRelationIds = useMemo(() => new Set(hoveredRelations.map(p => p.id)), [hoveredRelations]);

  const hoveredLinkedIds = useMemo(
    () => hoveredRelations.reduce((acc, p) => { acc.add(String(p.from_message_id)); acc.add(String(p.to_message_id)); return acc; }, new Set()),
    [hoveredRelations]
  );

  const shouldFocusRelations = hoveredMessageId && hoveredRelationIds.size > 0;
  const activeRelation = selectedRelation || hoveredRelation;

  const activeLinkedIds = useMemo(() => {
    if (shouldFocusRelations) return hoveredLinkedIds;
    if (activeRelation) return new Set([String(activeRelation.from_message_id), String(activeRelation.to_message_id)]);
    return null;
  }, [shouldFocusRelations, hoveredLinkedIds, activeRelation]);

  // ── Render ────────────────────────────────────────────────────────────────────
  if (loading) return <div className="loading">Loading chat room...</div>;

  return (
    <div className="annotator-chat-room">
      {/* Header */}
      <div className="chat-room-header">
        <button onClick={() => navigate(`/projects/${projectId}`)} className="back-button">
          ← Back to Project
        </button>
        <h2>{annotationMode === 'adjacency_pairs' ? (chatRoomName || 'Annotation') : 'Chat Disentanglement Annotation'}</h2>
        <div className="header-controls">
          <button
            className="layout-toggle-btn"
            onClick={() => setShowInstructions(!showInstructions)}
            title={showInstructions ? 'Hide help' : 'Show help'}
          >
            ?
          </button>
          <div className="stats">
            {annotationMode === 'adjacency_pairs' ? (
              <>
                <span className="stat-item">{statistics.totalMessages} turns</span>
                <span className="stat-item">{adjacencyPairs.length} relations</span>
              </>
            ) : (
              <>
                <span className="stat-item">{statistics.totalMessages} turns</span>
                <span className="stat-item">{statistics.totalThreads} threads</span>
                <span className="stat-item progress-stat">{statistics.annotationPercentage}% annotated</span>
              </>
            )}
          </div>
          {annotationMode === 'adjacency_pairs' && (
            <button
              className="completion-button"
              onClick={handleMarkAllAsRead}
              disabled={isCompletionSaving || totalMessagesCount === 0}
            >
              {allRead ? 'Mark all as unread' : 'Mark all as read'}
            </button>
          )}
        </div>
      </div>

      {/* Error modal */}
      {error && (
        <Modal isOpen onClose={() => setError(null)} title="" size="small" showCloseButton={false}>
          <div className="warning-modal">
            <ErrorMessage type="warning" title="Warning" message={error} />
            <button className="action-button" onClick={() => setError(null)}>OK</button>
          </div>
        </Modal>
      )}

      {/* Instructions panel */}
      {showInstructions && <InstructionsPanel annotationMode={annotationMode} statistics={statistics} />}

      {/* Main content */}
      <div className={`chat-room-content ${annotationMode === 'adjacency_pairs' ? 'adjacency-only' : ''}`}>
        <div className={`messages-container ${annotationMode === 'adjacency_pairs' ? 'adjacency-only' : ''}`}>
          <div
            className={[
              'messages-content',
              annotationMode === 'adjacency_pairs' ? 'adjacency-layout' : '',
              shouldFocusRelations ? 'relation-focus-dimmed' : '',
              selectedRelation ? 'relation-dimmed' : '',
              hoveredRelation ? 'relation-hover-dimmed' : '',
              replyHoverIds ? 'reply-dimmed' : '',
              hoveredUserId ? 'user-hover-dimmed' : '',
            ].filter(Boolean).join(' ')}
            ref={messagesContentRef}
            style={{ '--relations-width': `${relationsWidth}px` }}
          >
            {/* Adjacency pairs SVG canvas */}
            {annotationMode === 'adjacency_pairs' && (
              <AdjacencyRelationsCanvas
                linesWithLanes={linesWithLanes}
                relationsWidth={relationsWidth}
                laneGap={laneGap}
                messagesScrollHeight={messagesScrollHeight}
                selectedRelationId={selectedRelationId}
                hoveredRelationIds={hoveredRelationIds}
                shouldFocusRelations={shouldFocusRelations}
                dragSourceMessageId={dragSourceMessageId}
                dragHoverMessageId={dragHoverMessageId}
                messagePositions={messagePositions}
                onRelationClick={(id) => { setSelectedRelationId(id); setSuggestedRelation(null); }}
                onRelationHover={(id) => setHoveredRelationId(id)}
                onRelationHoverEnd={() => setHoveredRelationId(null)}
                onCanvasClick={() => setSelectedRelationId(null)}
              />
            )}

            {/* Messages list */}
            <div className="messages-list">
              {messages.map(message => {
                const messageAnnotations = annotationsMap[message.id] || [];
                const messageThreadId = messageAnnotations.length > 0 ? messageAnnotations[0].thread_id : null;
                return (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    annotations={messageAnnotations}
                    existingThreads={allThreads}
                    currentUserUsername={currentUser?.username}
                    onAnnotationCreate={(threadName) => handleCreateAnnotation(message.id, threadName)}
                    onAnnotationDelete={(annotationId) => handleDeleteAnnotation(message.id, annotationId)}
                    isAnnotating={isSubmitting}
                    isUserHighlighted={highlightedUserId === message.user_id}
                    isThreadHighlighted={!!(highlightedThreadId && messageAnnotations.some(a => a.thread_id === highlightedThreadId))}
                    onUserClick={handleUserClick}
                    onThreadClick={handleThreadClick}
                    data-message-id={message.id}
                    threadColor={messageThreadId ? threadColors[messageThreadId] : null}
                    threadColors={threadColors}
                    relationMode={annotationMode === 'adjacency_pairs'}
                    onPairDragStart={handlePairDragStart}
                    onPairDrop={handlePairDrop}
                    onPairDragOver={(id) => setDragHoverMessageId(id)}
                    onPairSelect={(id) => setPairSourceMessageId(prev => prev === id ? null : id)}
                    onPairContextMenu={handlePairContextMenu}
                    isPairSource={pairSourceMessageId === message.id}
                    isPairTarget={dragHoverMessageId === message.id}
                    isRelationLinked={activeLinkedIds ? activeLinkedIds.has(String(message.id)) : false}
                    isReplyLinked={replyHoverIds ? replyHoverIds.has(String(message.id)) : false}
                    isUserHoverLinked={hoveredUserId ? hoveredUserId === message.user_id : false}
                    onReplyHover={(replyToTurnId) => handleReplyHover(message.id, replyToTurnId)}
                    onReplyHoverEnd={() => setReplyHoverIds(null)}
                    onReplyClick={(replyToTurnId) => handleReplyClick(message.id, replyToTurnId)}
                    onUserHover={(uid) => setHoveredUserId(uid)}
                    onUserHoverEnd={() => setHoveredUserId(null)}
                    onMessageHover={(mid) => setHoveredMessageId(mid)}
                    onMessageHoverEnd={() => setHoveredMessageId(null)}
                    showReadToggle={annotationMode === 'adjacency_pairs'}
                    isRead={Boolean(readStatus[message.id])}
                    onReadToggle={() => handleReadToggle(message.id)}
                  />
                );
              })}
            </div>
          </div>
        </div>

        {/* Threads sidebar (disentanglement only) */}
        {annotationMode !== 'adjacency_pairs' && (
          <div className="threads-sidebar">
            <h3>Chat Threads</h3>
            {allThreads.length === 0 ? (
              <p className="no-threads">No threads created yet. Start by adding threads to messages on the left.</p>
            ) : (
              <div className="threads-overview">
                <p className="threads-count">{allThreads.length} threads found:</p>
                <div className="threads-list">
                  {allThreads.map(threadId => (
                    <SmartThreadCard
                      key={threadId}
                      threadId={threadId}
                      threadDetails={threadDetails[threadId]}
                      messages={messages}
                      isHighlighted={highlightedThreadId === threadId}
                      onThreadClick={handleThreadClick}
                      onMessageSelect={handleMessageSelect}
                      threadColor={threadColors[threadId]}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Relation type selection modal (drag-and-drop) */}
      <Modal
        isOpen={showPairModal}
        onClose={() => { setShowPairModal(false); setPendingPair(null); setDragSourceMessageId(null); setDragHoverMessageId(null); }}
        title="Select Relation Type"
        size="small"
      >
        {relationTypes.length === 0 ? (
          <p>No relation types configured for this project.</p>
        ) : (
          <div className="relation-type-modal-list">
            {relationTypes.map(type => (
              <button key={type} className="relation-type-button" onClick={() => handleCreateAdjacencyPair(type)} disabled={isSubmitting}>
                {type}
              </button>
            ))}
          </div>
        )}
      </Modal>

      {/* Right-click context menu */}
      {contextMenu.visible && (
        <div className="pair-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
          <div className="pair-context-title">Link to</div>
          {relationTypes.length === 0 ? (
            <div className="pair-context-empty">No relation types configured</div>
          ) : (
            relationTypes.map(type => (
              <button
                key={type}
                className="pair-context-item"
                onClick={() => handleCreateAdjacencyPairDirect(type, contextMenu.targetMessageId)}
                disabled={isSubmitting}
              >
                <span className="pair-context-color" style={{ backgroundColor: relationTypeColors[type] || '#6B7280' }} />
                {type}
              </button>
            ))
          )}
        </div>
      )}

      {/* Mark-all confirmation modal */}
      <Modal
        isOpen={confirmMarkAll.open}
        onClose={() => setConfirmMarkAll({ open: false, nextValue: false })}
        title="Are you sure?"
        size="small"
      >
        <p>All previous marks will be cleared.</p>
        <div className="modal-actions">
          <button className="action-button" onClick={() => setConfirmMarkAll({ open: false, nextValue: false })}>Cancel</button>
          <button className="action-button danger" onClick={applyMarkAll}>
            {confirmMarkAll.nextValue ? 'Mark all as read' : 'Mark all as unread'}
          </button>
        </div>
      </Modal>

      {/* Suggested relation editor */}
      <SuggestedRelationEditor
        suggestedFpp={suggestedFpp}
        suggestedSpp={suggestedSpp}
        suggestedRelationType={suggestedRelationType}
        relationTypes={relationTypes}
        isSubmitting={isSubmitting}
        onClose={() => { setSuggestedRelation(null); setSuggestedRelationType(''); }}
        onTypeChange={setSuggestedRelationType}
        onConfirm={handleConfirmSuggestedRelation}
      />

      {/* Selected relation editor */}
      <SelectedRelationEditor
        selectedRelation={selectedRelation}
        messages={messages}
        relationTypes={relationTypes}
        isSubmitting={isSubmitting}
        onClose={() => setSelectedRelationId(null)}
        onUpdate={handleUpdateAdjacencyPair}
        onDelete={handleDeleteAdjacencyPair}
      />

      {/* Scroll-to-top button */}
      {showScrollToTop && (
        <button className="scroll-to-top-btn" onClick={scrollToTop} title="Scroll to top">↑</button>
      )}
    </div>
  );
};

export default AnnotatorChatRoomPage;
