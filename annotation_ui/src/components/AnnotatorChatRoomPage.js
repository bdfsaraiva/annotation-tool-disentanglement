import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { projects as projectsApi, annotations as annotationsApi, adjacencyPairs as adjacencyPairsApi, auth } from '../utils/api';
import MessageBubble from './MessageBubble';
import SmartThreadCard from './SmartThreadCard';
import Modal from './Modal';
import ErrorMessage from './ErrorMessage';
import './AnnotatorChatRoomPage.css';

const parseApiError = (error) => {
  if (error.response?.data?.detail) {
    return error.response.data.detail;
  }
  return error.message || 'An unexpected error occurred';
};

// Thread background colors - simple palette, text colors handled by CSS
const THREAD_COLORS = [
  '#3B82F6', // Blue
  '#8B5CF6', // Purple  
  '#EF4444', // Red
  '#10B981', // Green
  '#F59E0B', // Orange
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#84CC16', // Lime
  '#92400E', // Brown
  '#6B7280', // Gray
  '#7C3AED', // Violet
  '#DC2626', // Rose
];

const RELATION_COLORS = [
  '#2563EB', // Blue
  '#16A34A', // Green
  '#DC2626', // Red
  '#9333EA', // Purple
  '#F59E0B', // Amber
  '#0EA5E9', // Sky
  '#14B8A6', // Teal
  '#F97316', // Orange
];

const AnnotatorChatRoomPage = () => {
  const { projectId, roomId } = useParams();
  const navigate = useNavigate();
  const messagesContentRef = useRef(null);
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
  
  // New state for enhanced functionality
  const [highlightedUserId, setHighlightedUserId] = useState(null);
  const [hoveredUserId, setHoveredUserId] = useState(null);
  const [highlightedThreadId, setHighlightedThreadId] = useState(null);
  const [showInstructions, setShowInstructions] = useState(false);
  const [showScrollToTop, setShowScrollToTop] = useState(false);
  const [dragSourceMessageId, setDragSourceMessageId] = useState(null);
  const [dragHoverMessageId, setDragHoverMessageId] = useState(null);
  const [pairSourceMessageId, setPairSourceMessageId] = useState(null);
  const [pendingPair, setPendingPair] = useState(null);
  const [showPairModal, setShowPairModal] = useState(false);
  const [relationTypeColors, setRelationTypeColors] = useState({});
  const [messagePositions, setMessagePositions] = useState({});
  const [messagesScrollHeight, setMessagesScrollHeight] = useState(0);
  const [selectedRelationId, setSelectedRelationId] = useState(null);
  const [hoveredRelationId, setHoveredRelationId] = useState(null);
  const [hoveredMessageId, setHoveredMessageId] = useState(null);
  const [replyHoverIds, setReplyHoverIds] = useState(null);
  const [suggestedRelation, setSuggestedRelation] = useState(null);
  const [suggestedRelationType, setSuggestedRelationType] = useState('');
  const [confirmMarkAll, setConfirmMarkAll] = useState({ open: false, nextValue: false });
  const [contextMenu, setContextMenu] = useState({
    visible: false,
    x: 0,
    y: 0,
    targetMessageId: null
  });
  const [statistics, setStatistics] = useState({
    totalMessages: 0,
    annotatedMessages: 0,
    unannotatedMessages: 0,
    annotationPercentage: 0,
    totalThreads: 0,
    messagesPerThread: {},
    annotatorsPerThread: {}
  });

  const getReadStorageKey = useCallback((userId) => {
    return `adjpairs-read:${projectId}:${roomId}:${userId}`;
  }, [projectId, roomId]);

  // Scroll to top function
  const scrollToTop = () => {
    if (messagesContentRef.current) {
      messagesContentRef.current.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    }
  };

  // Assign colors to threads
  const assignThreadColors = useCallback((threads) => {
    const colors = {};
    threads.forEach((threadId, index) => {
      colors[threadId] = THREAD_COLORS[index % THREAD_COLORS.length];
    });
    setThreadColors(colors);
  }, []);

  const assignRelationTypeColors = useCallback((types) => {
    const colors = {};
    types.forEach((type, index) => {
      colors[type] = RELATION_COLORS[index % RELATION_COLORS.length];
    });
    setRelationTypeColors(colors);
  }, []);

  const processAnnotations = (annotationsData) => {
    const newAnnotationsMap = {};
    const threadsSet = new Set();
    const newThreadDetails = {};

    annotationsData.forEach(annotation => {
      // Group annotations by message ID
      if (!newAnnotationsMap[annotation.message_id]) {
        newAnnotationsMap[annotation.message_id] = [];
      }
      newAnnotationsMap[annotation.message_id].push(annotation);

      // Collect all unique threads
      threadsSet.add(annotation.thread_id);

      // Build thread details
      if (!newThreadDetails[annotation.thread_id]) {
        newThreadDetails[annotation.thread_id] = {
          id: annotation.thread_id,
          messages: [],
          annotators: new Set(),
          annotations: []
        };
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

  // Calculate enhanced statistics
  const calculateStatistics = useCallback((messagesData, annotationsData) => {
    const totalMessages = messagesData.length;
    const annotatedMessageIds = new Set(annotationsData.map(ann => ann.message_id));
    const annotatedMessages = annotatedMessageIds.size;
    const unannotatedMessages = totalMessages - annotatedMessages;
    const annotationPercentage = totalMessages > 0 ? Math.round((annotatedMessages / totalMessages) * 100) : 0;

    // Thread-specific statistics
    const threadsSet = new Set(annotationsData.map(ann => ann.thread_id));
    const totalThreads = threadsSet.size;
    
    const messagesPerThread = {};
    const annotatorsPerThread = {};
    
    annotationsData.forEach(annotation => {
      const threadId = annotation.thread_id;
      
      if (!messagesPerThread[threadId]) {
        messagesPerThread[threadId] = new Set();
      }
      messagesPerThread[threadId].add(annotation.message_id);
      
      if (!annotatorsPerThread[threadId]) {
        annotatorsPerThread[threadId] = new Set();
      }
        annotatorsPerThread[threadId].add(annotation.annotator_username);
    });

    // Convert sets to counts
    Object.keys(messagesPerThread).forEach(threadId => {
      messagesPerThread[threadId] = messagesPerThread[threadId].size;
      annotatorsPerThread[threadId] = annotatorsPerThread[threadId].size;
    });

    setStatistics({
      totalMessages,
      annotatedMessages,
      unannotatedMessages,
      annotationPercentage,
      totalThreads,
      messagesPerThread,
      annotatorsPerThread
    });
  }, []);

  const abbreviateRelationType = useCallback((relationType) => {
    if (!relationType) return '';
    const words = relationType.split(/[\s_-]+/).filter(Boolean);
    if (words.length === 1) {
      return words[0].slice(0, 3).toUpperCase();
    }
    return words.map((word) => word[0]).join('').slice(0, 4).toUpperCase();
  }, []);

  const updateMessagePositions = useCallback(() => {
    const container = messagesContentRef.current;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const nodes = container.querySelectorAll('[data-message-id]');
    const positions = {};
    nodes.forEach((node) => {
      const rect = node.getBoundingClientRect();
      const centerY = rect.top - containerRect.top + rect.height / 2 + container.scrollTop;
      const id = node.getAttribute('data-message-id');
      if (id) {
        positions[id] = centerY;
      }
    });
    setMessagePositions(positions);
    setMessagesScrollHeight(container.scrollHeight);
  }, []);

  const rafRef = useRef(null);
  const requestPositionUpdate = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }
    rafRef.current = requestAnimationFrame(() => {
      updateMessagePositions();
    });
  }, [updateMessagePositions]);

  // Scroll position tracking
  useEffect(() => {
    const messagesContainer = messagesContentRef.current;
    if (!messagesContainer) return;

    const handleScroll = () => {
      const scrollTop = messagesContainer.scrollTop;
      const scrollThreshold = 300; // Show button after scrolling 300px
      setShowScrollToTop(scrollTop > scrollThreshold);
      requestPositionUpdate();
    };

    messagesContainer.addEventListener('scroll', handleScroll);
    return () => messagesContainer.removeEventListener('scroll', handleScroll);
  }, [requestPositionUpdate]);

  const fetchChatRoomData = useCallback(async () => {
    // Guard clause to prevent fetching with invalid IDs
    if (isNaN(parseInt(projectId, 10)) || isNaN(parseInt(roomId, 10))) {
      setError("Invalid Project or Chat Room ID.");
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
        projectsApi.getChatRoomCompletion(projectId, roomId)
      ];

      if (projectData.annotation_type === 'adjacency_pairs') {
        requests.push(adjacencyPairsApi.getChatRoomPairs(projectId, roomId));
      } else {
        requests.push(annotationsApi.getChatRoomAnnotations(projectId, roomId));
      }

      const [chatRoomData, messagesResponse, userData, completionData, thirdPayload] = await Promise.all(requests);
      
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
        setStatistics((prev) => ({
          ...prev,
          totalMessages: messagesResponse.total ?? messagesData.length
        }));
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
  }, [projectId, roomId, calculateStatistics]);

  useEffect(() => {
    fetchChatRoomData();
  }, [fetchChatRoomData]);

  useEffect(() => {
    requestPositionUpdate();
  }, [messages, adjacencyPairs, requestPositionUpdate]);

  useEffect(() => {
    requestPositionUpdate();
  }, [showInstructions, annotationMode, requestPositionUpdate]);

  const syncCompletionStatus = useCallback(async (nextValue) => {
    setIsCompletionSaving(true);
    try {
      await projectsApi.updateChatRoomCompletion(projectId, roomId, nextValue);
      setIsCompleted(nextValue);
    } catch (err) {
      console.error('Error updating completion status:', err);
      setError(parseApiError(err));
    } finally {
      setIsCompletionSaving(false);
    }
  }, [projectId, roomId]);

  useEffect(() => {
    if (annotationMode !== 'adjacency_pairs' || !currentUser) return;
    const key = getReadStorageKey(currentUser.id);
    const storedRaw = window.localStorage.getItem(key);
    let nextStatus = {};
    let hasStored = false;
    if (storedRaw) {
      try {
        const parsed = JSON.parse(storedRaw);
        if (parsed && typeof parsed === 'object') {
          nextStatus = parsed;
          hasStored = true;
        }
      } catch (err) {
        console.warn('Failed to parse read status storage:', err);
      }
    }
    if (!hasStored && isCompleted && messages.length > 0) {
      const allRead = {};
      messages.forEach((msg) => {
        allRead[msg.id] = true;
      });
      nextStatus = allRead;
    }
    setReadStatus(nextStatus);
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

  useEffect(() => {
    const handleResize = () => requestPositionUpdate();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [requestPositionUpdate]);

  useEffect(() => {
    if (!contextMenu.visible) return;
    const handleClickOutside = () => setContextMenu({ visible: false, x: 0, y: 0, targetMessageId: null });
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [contextMenu.visible]);

  const handleCreateAnnotation = async (messageId, threadName) => {
    setIsSubmitting(true);
    try {
      await annotationsApi.createAnnotation(projectId, messageId, { 
        message_id: messageId, 
        thread_id: threadName 
      });

      // Refresh annotations to get the updated data
      const annotationsData = await annotationsApi.getChatRoomAnnotations(projectId, roomId);
      processAnnotations(annotationsData);
      calculateStatistics(messages, annotationsData);

    } catch (err) {
      console.error('Error creating annotation:', err);
      throw new Error(parseApiError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteAnnotation = async (messageId, annotationId) => {
    setIsSubmitting(true);
    try {
      await annotationsApi.deleteAnnotation(projectId, messageId, annotationId);

      // Refresh annotations to get the updated data
      const annotationsData = await annotationsApi.getChatRoomAnnotations(projectId, roomId);
      processAnnotations(annotationsData);
      calculateStatistics(messages, annotationsData);

    } catch (err) {
      console.error('Error deleting annotation:', err);
      throw new Error(parseApiError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const refreshAdjacencyPairs = useCallback(async () => {
    const pairs = await adjacencyPairsApi.getChatRoomPairs(projectId, roomId);
    setAdjacencyPairs(pairs);
    return pairs;
  }, [projectId, roomId]);


  const handlePairDragStart = (messageId) => {
    setDragSourceMessageId(messageId);
    setPairSourceMessageId(messageId);
  };

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

  const handlePairDragOver = (messageId) => {
    setDragHoverMessageId(messageId);
  };

  const handlePairSourceSelect = (messageId) => {
    setPairSourceMessageId((prev) => prev === messageId ? null : messageId);
  };

  const handlePairContextMenu = (messageId, event) => {
    if (annotationMode !== 'adjacency_pairs') return;
    event.preventDefault();
    if (!pairSourceMessageId || pairSourceMessageId === messageId) {
      setPairSourceMessageId(messageId);
      return;
    }
    setContextMenu({
      visible: true,
      x: event.clientX,
      y: event.clientY,
      targetMessageId: messageId
    });
  };

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
        from_message_id: pairSourceMessageId,
        to_message_id: targetMessageId,
        relation_type: relationType
      });
      await refreshAdjacencyPairs();
    } catch (err) {
      console.error('Error creating adjacency pair:', err);
      setError(parseApiError(err));
    } finally {
      setIsSubmitting(false);
      setContextMenu({ visible: false, x: 0, y: 0, targetMessageId: null });
    }
  };

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
        from_message_id: pendingPair.from,
        to_message_id: pendingPair.to,
        relation_type: relationType
      });
      await refreshAdjacencyPairs();
    } catch (err) {
      console.error('Error creating adjacency pair:', err);
      setError(parseApiError(err));
    } finally {
      setIsSubmitting(false);
      setPendingPair(null);
      setShowPairModal(false);
      setDragSourceMessageId(null);
      setDragHoverMessageId(null);
    }
  };

  const handleDeleteAdjacencyPair = async (pairId) => {
    setIsSubmitting(true);
    try {
      await adjacencyPairsApi.deleteAdjacencyPair(projectId, roomId, pairId);
      await refreshAdjacencyPairs();
      if (selectedRelationId === pairId) {
        setSelectedRelationId(null);
      }
    } catch (err) {
      console.error('Error deleting adjacency pair:', err);
      setError(parseApiError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateAdjacencyPair = async (pair, relationType) => {
    if (!pair || pair.relation_type === relationType) return;
    setIsSubmitting(true);
    try {
      await adjacencyPairsApi.deleteAdjacencyPair(projectId, roomId, pair.id);
      await adjacencyPairsApi.createAdjacencyPair(projectId, roomId, {
        from_message_id: pair.from_message_id,
        to_message_id: pair.to_message_id,
        relation_type: relationType
      });
      const pairs = await refreshAdjacencyPairs();
      const updated = pairs.find((p) =>
        p.from_message_id === pair.from_message_id &&
        p.to_message_id === pair.to_message_id &&
        p.relation_type === relationType
      );
      setSelectedRelationId(updated ? updated.id : null);
    } catch (err) {
      console.error('Error updating adjacency pair:', err);
      setError(parseApiError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle user click highlighting
  const handleUserClick = (userId) => {
    setHighlightedUserId(highlightedUserId === userId ? null : userId);
    setHighlightedThreadId(null); // Clear thread highlighting
  };

  const handleUserHover = (userId) => {
    setHoveredUserId(userId);
  };

  const handleUserHoverEnd = () => {
    setHoveredUserId(null);
  };

  // Handle thread click highlighting
  const handleThreadClick = (threadId) => {
    setHighlightedThreadId(highlightedThreadId === threadId ? null : threadId);
    setHighlightedUserId(null); // Clear user highlighting
  };

  const handleReplyHover = (currentMessageId, replyToTurnId) => {
    if (!replyToTurnId) {
      setReplyHoverIds(null);
      return;
    }
    const replyToMessage = messages.find((msg) => String(msg.turn_id) === String(replyToTurnId));
    if (!replyToMessage) {
      setReplyHoverIds(null);
      return;
    }
    setReplyHoverIds(new Set([String(currentMessageId), String(replyToMessage.id)]));
  };

  const clearReplyHover = () => {
    setReplyHoverIds(null);
  };

  // Handle message selection from hover card
  const handleMessageSelect = (messageId) => {
    // Scroll to the message bubble
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (messageElement) {
      messageElement.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'center' 
      });
      // Add a temporary highlight effect
      messageElement.classList.add('message-selected');
      setTimeout(() => {
        messageElement.classList.remove('message-selected');
      }, 2000);
    }
  };

  const handleReadToggle = useCallback((messageId) => {
    setReadStatus((prev) => {
      const next = { ...prev, [messageId]: !prev[messageId] };
      return next;
    });
  }, []);

  const handleMarkAllAsRead = () => {
    if (messages.length === 0) return;
    setConfirmMarkAll({ open: true, nextValue: !allRead });
  };

  const applyMarkAll = useCallback(() => {
    const nextStatus = {};
    messages.forEach((msg) => {
      nextStatus[msg.id] = confirmMarkAll.nextValue;
    });
    setReadStatus(nextStatus);
    setConfirmMarkAll({ open: false, nextValue: false });
  }, [messages, confirmMarkAll.nextValue]);

  const adjacencyLines = useMemo(() => {
    return adjacencyPairs.map((pair) => {
      const fromY = messagePositions[String(pair.from_message_id)];
      const toY = messagePositions[String(pair.to_message_id)];
      if (fromY == null || toY == null) return null;
      const color = relationTypeColors[pair.relation_type] || '#6B7280';
      const label = abbreviateRelationType(pair.relation_type);
      return {
        id: pair.id,
        fromId: pair.from_message_id,
        toId: pair.to_message_id,
        fromY,
        toY,
        color,
        label
      };
    }).filter(Boolean);
  }, [adjacencyPairs, messagePositions, relationTypeColors, abbreviateRelationType]);

  const { lineWithLanes, relationsWidth, laneGap } = useMemo(() => {
    const laneGapValue = 14;
    const laneBase = 70;
    const sortedLines = [...adjacencyLines].sort((a, b) => {
      const aStart = Math.min(a.fromY, a.toY);
      const bStart = Math.min(b.fromY, b.toY);
      if (aStart !== bStart) return aStart - bStart;
      const aEnd = Math.max(a.fromY, a.toY);
      const bEnd = Math.max(b.fromY, b.toY);
      return aEnd - bEnd;
    });
    const laneEnds = [];
    const linesWithLanes = sortedLines.map((line) => {
      const start = Math.min(line.fromY, line.toY);
      const end = Math.max(line.fromY, line.toY);
      let laneIndex = 0;
      while (laneIndex < laneEnds.length && start <= laneEnds[laneIndex]) {
        laneIndex += 1;
      }
      if (laneIndex === laneEnds.length) {
        laneEnds.push(end);
      } else {
        laneEnds[laneIndex] = end;
      }
      return { ...line, lane: laneIndex };
    });
    const maxLane = laneEnds.length > 0 ? laneEnds.length - 1 : 0;
    const width = laneBase + laneGapValue * (maxLane + 1);
    return { lineWithLanes: linesWithLanes, relationsWidth: width, laneGap: laneGapValue };
  }, [adjacencyLines]);

  const messageIndexMap = useMemo(() => {
    const map = {};
    messages.forEach((msg, idx) => {
      map[msg.id] = idx;
    });
    return map;
  }, [messages]);

  const isBackwardLinkAllowed = useCallback((fromId, toId) => {
    if (fromId == null || toId == null) return true;
    const fromIndex = messageIndexMap[fromId];
    const toIndex = messageIndexMap[toId];
    if (fromIndex == null || toIndex == null) return true;
    return toIndex < fromIndex;
  }, [messageIndexMap]);

  const handleReplyClick = useCallback((currentMessageId, replyToTurnId) => {
    if (annotationMode !== 'adjacency_pairs') return;
    if (!replyToTurnId) return;
    const replyToMessage = messages.find((msg) => String(msg.turn_id) === String(replyToTurnId));
    if (!replyToMessage) {
      setError('Reply target not found for this turn.');
      return;
    }
    if (!isBackwardLinkAllowed(currentMessageId, replyToMessage.id)) {
      setError('You can only link a turn to an earlier turn.');
      return;
    }
    setSuggestedRelation({ fppId: replyToMessage.id, sppId: currentMessageId });
    setSuggestedRelationType('');
    setSelectedRelationId(null);
  }, [annotationMode, messages, isBackwardLinkAllowed]);

  const handleConfirmSuggestedRelation = useCallback(async () => {
    if (!suggestedRelation || !suggestedRelationType) return;
    if (!isBackwardLinkAllowed(suggestedRelation.sppId, suggestedRelation.fppId)) {
      setError('You can only link a turn to an earlier turn.');
      return;
    }
    setIsSubmitting(true);
    try {
      await adjacencyPairsApi.createAdjacencyPair(projectId, roomId, {
        from_message_id: suggestedRelation.sppId,
        to_message_id: suggestedRelation.fppId,
        relation_type: suggestedRelationType
      });
      await refreshAdjacencyPairs();
      setSuggestedRelation(null);
      setSuggestedRelationType('');
    } catch (err) {
      console.error('Error creating suggested adjacency pair:', err);
      setError(parseApiError(err));
    } finally {
      setIsSubmitting(false);
    }
  }, [
    suggestedRelation,
    suggestedRelationType,
    isBackwardLinkAllowed,
    projectId,
    roomId,
    refreshAdjacencyPairs
  ]);

  const dragPreviewLine = useMemo(() => {
    if (!dragSourceMessageId || !dragHoverMessageId || dragSourceMessageId === dragHoverMessageId) return null;
    const fromY = messagePositions[String(dragSourceMessageId)];
    const toY = messagePositions[String(dragHoverMessageId)];
    if (fromY == null || toY == null) return null;
    return { fromY, toY, x: relationsWidth - 12 };
  }, [dragSourceMessageId, dragHoverMessageId, messagePositions, relationsWidth]);

  const selectedRelation = useMemo(
    () => adjacencyPairs.find((pair) => pair.id === selectedRelationId) || null,
    [adjacencyPairs, selectedRelationId]
  );
  const suggestedFpp = useMemo(() => {
    if (!suggestedRelation) return null;
    return messages.find((msg) => msg.id === suggestedRelation.fppId) || null;
  }, [messages, suggestedRelation]);
  const suggestedSpp = useMemo(() => {
    if (!suggestedRelation) return null;
    return messages.find((msg) => msg.id === suggestedRelation.sppId) || null;
  }, [messages, suggestedRelation]);
  const hoveredRelation = useMemo(
    () => adjacencyPairs.find((pair) => pair.id === hoveredRelationId) || null,
    [adjacencyPairs, hoveredRelationId]
  );
  const activeRelation = selectedRelation || hoveredRelation;
  const hoveredRelations = useMemo(() => {
    return hoveredMessageId
      ? adjacencyPairs.filter(
          (pair) =>
            pair.from_message_id === hoveredMessageId || pair.to_message_id === hoveredMessageId
        )
      : [];
  }, [adjacencyPairs, hoveredMessageId]);
  const hoveredRelationIds = useMemo(() => new Set(hoveredRelations.map((pair) => pair.id)), [hoveredRelations]);
  const hoveredLinkedIds = useMemo(() => {
    return hoveredRelations.reduce((acc, pair) => {
      acc.add(String(pair.from_message_id));
      acc.add(String(pair.to_message_id));
      return acc;
    }, new Set());
  }, [hoveredRelations]);
  const shouldFocusRelations = hoveredMessageId && hoveredRelationIds.size > 0;

  const activeLinkedIds = useMemo(() => {
    if (shouldFocusRelations) return hoveredLinkedIds;
    if (activeRelation) {
      return new Set([String(activeRelation.from_message_id), String(activeRelation.to_message_id)]);
    }
    return null;
  }, [shouldFocusRelations, hoveredLinkedIds, activeRelation]);

  if (loading) return <div className="loading">Loading chat room...</div>;
  return (
    <div className="annotator-chat-room">
      <div className="chat-room-header">
        <button onClick={() => navigate(`/projects/${projectId}`)} className="back-button">
          ← Back to Project
        </button>
        <h2>{annotationMode === 'adjacency_pairs' ? (chatRoomName || 'Annotation') : 'Chat Disentanglement Annotation'}</h2>
        <div className="header-controls">
          <button 
            className="layout-toggle-btn"
            onClick={() => setShowInstructions(!showInstructions)}
            title={showInstructions ? "Hide help" : "Show help"}
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
                <span className="stat-item progress-stat">
                  {statistics.annotationPercentage}% annotated
                </span>
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
      {error && (
        <Modal
          isOpen={true}
          onClose={() => setError(null)}
          title=""
          size="small"
          showCloseButton={false}
        >
          <div className="warning-modal">
            <ErrorMessage type="warning" title="Warning" message={error} />
            <button className="action-button" onClick={() => setError(null)}>
              OK
            </button>
          </div>
        </Modal>
      )}
      {showInstructions && (
        <div className="instruction-panel">
          <div className="manual-content">
            {annotationMode === 'adjacency_pairs' && (
              <>
                <div className="manual-section">
                  <h4>Adjacency Pairs Task</h4>
                  <p>
                    Your task is to link turns that form an adjacency pair. Drag one turn onto another to create a relation.
                  </p>
                </div>

                <div className="manual-section">
                  <h4>How to Annotate</h4>
                  <ol>
                    <li>Drag a source turn onto a target turn</li>
                    <li>Select the relation type from the list</li>
                    <li>Repeat for all relevant pairs</li>
                  </ol>
                </div>

                <div className="manual-section">
                  <h4>Tips</h4>
                  <ul>
                    <li>Click a turn to select it as source, then right-click another to link</li>
                    <li>Right-click a target turn to pick a relation type</li>
                    <li>A turn can have multiple outgoing and incoming relations</li>
                  </ul>
                </div>
              </>
            )}

            {annotationMode !== 'adjacency_pairs' && (
              <>
                <div className="manual-section">
                  <h4>Chat Disentanglement Task</h4>
                  <p>
                    Your task is to read chat interactions <strong>turn by turn</strong> and identify which <strong>thread</strong> each turn belongs to.
                    This process helps separate entangled conversations in group chats.
                  </p>
                </div>

                <div className="manual-section">
                  <h4>Key Definitions</h4>
                  <ul>
                    <li><strong>Turn:</strong> A set of sentences sent by the same participant (what you see as message bubbles)</li>
                    <li><strong>Thread:</strong> A group of interconnected turns that share reply relations or the same topic</li>
                    <li><strong>Chat Room:</strong> The entire conversation with all participants</li>
                  </ul>
                </div>

                <div className="manual-section">
                  <h4>How to Annotate</h4>
                  <ol>
                    <li><strong>Click "Add Thread"</strong> on any turn to assign it to a thread</li>
                    <li><strong>Thread naming:</strong> You can use any labels (0, 1, 2, A, B, "topic1", etc.) - what matters is <strong>grouping turns consistently</strong></li>
                    <li><strong>Group related turns</strong> - turns about the same topic should have the same thread identifier</li>
                    <li><strong>Create new threads</strong> when topics change or new discussions emerge</li>
                    <li><strong>Focus on logical grouping</strong> - the system measures agreement based on which turns you group together, not the specific names you use</li>
                  </ol>
                </div>

                <div className="manual-section">
                  <h4>Annotation Guidelines</h4>
                  <div className="guideline-grid">
                    <div className="guideline-item">
                      <strong>1. Check Reply Relationships</strong>
                      <p>If a turn replies to another, they usually belong to the same thread (unless topic changes)</p>
                    </div>
                    <div className="guideline-item">
                      <strong>2. Track User Sequences</strong>
                      <p>Click <span className="highlight-example user-highlight">User IDs</span> to see all turns from the same user</p>
                    </div>
                    <div className="guideline-item">
                      <strong>3. Read Turn Content</strong>
                      <p>Check if the message relates to previous threads by topic</p>
                    </div>
                    <div className="guideline-item">
                      <strong>4. Moderator Messages</strong>
                      <p>Group administrative/encouragement messages into a single meta-thread</p>
                    </div>
                    <div className="guideline-item">
                      <strong>5. Short Responses</strong>
                      <p>"Yes", "I agree", "Exactly" -> link to the thread they're responding to</p>
                    </div>
                    <div className="guideline-item">
                      <strong>6. Unclear Messages</strong>
                      <p>If you can't understand due to errors or can't connect to previous turns -> create new thread</p>
                    </div>
                  </div>
                </div>

                <div className="manual-section">
                  <h4>Visual Helpers</h4>
                  <ul>
                    <li><strong>Thread Colors:</strong> Each thread has a unique color for easy identification</li>
                    <li><strong>User Highlighting:</strong> Click user IDs to highlight all their turns</li>
                    <li><strong>Thread Cards:</strong> Click thread cards on the right to highlight thread turns</li>
                    <li><strong>Progress Tracking:</strong> See your annotation progress below</li>
                  </ul>
                </div>

                <div className="manual-section">
                  <h4>How Agreement is Measured</h4>
                  <div className="agreement-explanation">
                    <p>
                      <strong>Important:</strong> The system uses the <strong>Hungarian algorithm</strong> to calculate inter-annotator agreement. 
                      This means it measures how well annotators group the same turns together, regardless of what labels they use.
                    </p>
                    <div className="example-box">
                      <strong>Example:</strong><br/>
                      - Annotator A: turns 1-5 -> "Thread 0", turns 6-10 -> "Thread 1"<br/>
                      - Annotator B: turns 1-5 -> "Topic A", turns 6-10 -> "Topic B"<br/>
                      - Annotator C: turns 1-5 -> "5", turns 6-10 -> "7"<br/>
                      <span className="result">Result: <strong>100% agreement!</strong> All grouped the same turns together</span>
                    </div>
                  </div>
                </div>

                <div className="progress-details">
                  <div className="progress-bar">
                    <div 
                      className="progress-fill"
                      style={{ width: `${statistics.annotationPercentage}%` }}
                    ></div>
                  </div>
                  <div className="progress-text">
                    {statistics.annotatedMessages} of {statistics.totalMessages} turns annotated 
                    ({statistics.unannotatedMessages} remaining)
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
       )}
      <div className={`chat-room-content ${annotationMode === 'adjacency_pairs' ? 'adjacency-only' : ''}`}>
        <div className={`messages-container ${annotationMode === 'adjacency_pairs' ? 'adjacency-only' : ''}`}>
          <div
            className={`messages-content ${annotationMode === 'adjacency_pairs' ? 'adjacency-layout' : ''} ${shouldFocusRelations ? 'relation-focus-dimmed' : ''} ${selectedRelation ? 'relation-dimmed' : ''} ${hoveredRelation ? 'relation-hover-dimmed' : ''} ${replyHoverIds ? 'reply-dimmed' : ''} ${hoveredUserId ? 'user-hover-dimmed' : ''}`}
            ref={messagesContentRef}
            style={{ '--relations-width': `${relationsWidth}px` }}
          >
            {annotationMode === 'adjacency_pairs' && (
              <div className="relations-column" style={{ width: `${relationsWidth}px` }}>
                <svg
                  className="relations-svg"
                  width={relationsWidth}
                  height={messagesScrollHeight || 0}
                  viewBox={`0 0 ${relationsWidth} ${messagesScrollHeight || 0}`}
                  onClick={() => setSelectedRelationId(null)}
                >
                  <defs>
                    <marker
                      id="arrowhead"
                      markerWidth="10"
                      markerHeight="7"
                      refX="8"
                      refY="3.5"
                      orient="auto"
                    >
                      <polygon points="0 0, 10 3.5, 0 7" fill="currentColor" />
                    </marker>
                  </defs>
                  {lineWithLanes.map((line) => {
                    const x = relationsWidth - 12 - line.lane * laneGap;
                    const curveOut = x - 34;
                    const isSelected = selectedRelationId === line.id;
                    const isFocused = shouldFocusRelations && hoveredRelationIds.has(line.id);
                    const showLabel = isFocused || isSelected;
                    const labelY = (line.fromY + line.toY) / 2;
                    return (
                      <g key={line.id}>
                        <path
                          d={`M ${x} ${line.fromY} C ${curveOut} ${line.fromY}, ${curveOut} ${line.toY}, ${x} ${line.toY}`}
                          stroke={line.color}
                          strokeWidth={isSelected ? '3' : '2'}
                          fill="none"
                          className={`relation-line ${isSelected ? 'selected' : ''} ${isFocused ? 'focused' : ''}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedRelationId(line.id);
                            setSuggestedRelation(null);
                          }}
                          onMouseEnter={() => setHoveredRelationId(line.id)}
                          onMouseLeave={() => setHoveredRelationId(null)}
                        />
                        {showLabel && (
                          <text
                            x={x - 12}
                            y={labelY}
                            className={`relation-label ${isSelected ? 'selected' : ''} ${isFocused ? 'focused' : ''}`}
                            fill={line.color}
                            textAnchor="end"
                            dominantBaseline="middle"
                          >
                            {line.label}
                          </text>
                        )}
                      </g>
                    );
                  })}
                  {dragPreviewLine && (
                    <path
                      d={`M ${dragPreviewLine.x} ${dragPreviewLine.fromY} L ${dragPreviewLine.x} ${dragPreviewLine.toY}`}
                      stroke="#94A3B8"
                      strokeWidth="2"
                      fill="none"
                      strokeDasharray="4 4"
                    />
                  )}
                </svg>
              </div>
            )}
            <div className="messages-list">
              {messages.map(message => {
                const messageAnnotations = annotationsMap[message.id] || [];
                const isUserHighlighted = highlightedUserId === message.user_id;
                const isThreadHighlighted = highlightedThreadId && 
                  messageAnnotations.some(ann => ann.thread_id === highlightedThreadId);
                // Get thread color for this message
                const messageThreadId = messageAnnotations.length > 0 ? messageAnnotations[0].thread_id : null;
                const threadColor = messageThreadId ? threadColors[messageThreadId] : null;

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
                    isUserHighlighted={isUserHighlighted}
                    isThreadHighlighted={isThreadHighlighted}
                    onUserClick={handleUserClick}
                    onThreadClick={handleThreadClick}
                    data-message-id={message.id}
                    threadColor={threadColor}
                    threadColors={threadColors}
                    relationMode={annotationMode === 'adjacency_pairs'}
                    onPairDragStart={handlePairDragStart}
                    onPairDrop={handlePairDrop}
                    onPairDragOver={handlePairDragOver}
                    onPairSelect={handlePairSourceSelect}
                    onPairContextMenu={handlePairContextMenu}
                    isPairSource={pairSourceMessageId === message.id}
                    isPairTarget={dragHoverMessageId === message.id}
                    isRelationLinked={
                      activeLinkedIds ? activeLinkedIds.has(String(message.id)) : false
                    }
                    isReplyLinked={
                      replyHoverIds ? replyHoverIds.has(String(message.id)) : false
                    }
                    isUserHoverLinked={hoveredUserId ? hoveredUserId === message.user_id : false}
                    onReplyHover={(replyToTurnId) => handleReplyHover(message.id, replyToTurnId)}
                    onReplyHoverEnd={clearReplyHover}
                    onReplyClick={(replyToTurnId) => handleReplyClick(message.id, replyToTurnId)}
                    onUserHover={handleUserHover}
                    onUserHoverEnd={handleUserHoverEnd}
                    onMessageHover={(messageId) => setHoveredMessageId(messageId)}
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

        {annotationMode !== 'adjacency_pairs' && (
          <div className="threads-sidebar">
            <h3>Chat Threads</h3>
            {allThreads.length === 0 ? (
              <p className="no-threads">
                No threads created yet. Start by adding threads to messages on the left.
              </p>
            ) : (
              <div className="threads-overview">
                <p className="threads-count">{allThreads.length} threads found:</p>
                <div className="threads-list">
                  {allThreads.map(threadId => {
                    const thread = threadDetails[threadId];
                    const isHighlighted = highlightedThreadId === threadId;
                    const threadColor = threadColors[threadId];
                    
                    return (
                      <SmartThreadCard
                        key={threadId}
                        threadId={threadId}
                        threadDetails={thread}
                        messages={messages}
                        isHighlighted={isHighlighted}
                        onThreadClick={handleThreadClick}
                        onMessageSelect={handleMessageSelect}
                        threadColor={threadColor}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      <Modal
        isOpen={showPairModal}
        onClose={() => {
          setShowPairModal(false);
          setPendingPair(null);
          setDragSourceMessageId(null);
          setDragHoverMessageId(null);
        }}
        title="Select Relation Type"
        size="small"
      >
        {relationTypes.length === 0 ? (
          <p>No relation types configured for this project.</p>
        ) : (
          <div className="relation-type-modal-list">
            {relationTypes.map((type) => (
              <button
                key={type}
                className="relation-type-button"
                onClick={() => handleCreateAdjacencyPair(type)}
                disabled={isSubmitting}
              >
                {type}
              </button>
            ))}
          </div>
        )}
      </Modal>
      {contextMenu.visible && (
        <div
          className="pair-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <div className="pair-context-title">Link to</div>
          {relationTypes.length === 0 ? (
            <div className="pair-context-empty">No relation types configured</div>
          ) : (
            relationTypes.map((type) => (
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
      <Modal
        isOpen={confirmMarkAll.open}
        onClose={() => setConfirmMarkAll({ open: false, nextValue: false })}
        title="Are you sure?"
        size="small"
      >
        <p>All previous marks will be cleared.</p>
        <div className="modal-actions">
          <button
            className="action-button"
            onClick={() => setConfirmMarkAll({ open: false, nextValue: false })}
          >
            Cancel
          </button>
          <button
            className="action-button danger"
            onClick={applyMarkAll}
          >
            {confirmMarkAll.nextValue ? 'Mark all as read' : 'Mark all as unread'}
          </button>
        </div>
      </Modal>
      {suggestedRelation && (
        <div className="relation-editor suggested-relation">
          <div className="relation-editor-header">
            <div className="relation-editor-title">Suggested relation</div>
            <button
              className="relation-editor-close"
              onClick={() => {
                setSuggestedRelation(null);
                setSuggestedRelationType('');
              }}
            >
              Close
            </button>
          </div>
          <div className="relation-editor-body">
            <div className="relation-editor-turn">
              <div className="relation-editor-label">FPP</div>
              <div className="relation-editor-text">
                {suggestedFpp?.turn_text || 'Unavailable'}
              </div>
            </div>
            <div className="relation-editor-turn">
              <div className="relation-editor-label">SPP</div>
              <div className="relation-editor-text">
                {suggestedSpp?.turn_text || 'Unavailable'}
              </div>
            </div>
            <div className="relation-editor-controls">
              <label className="relation-editor-label">Relation Type</label>
              <select
                className="relation-editor-select"
                value={suggestedRelationType}
                onChange={(e) => setSuggestedRelationType(e.target.value)}
                disabled={isSubmitting || relationTypes.length === 0}
                required
              >
                <option value="" disabled>Select a relation label</option>
                {relationTypes.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
              <div className="relation-editor-actions">
                <button
                  className="relation-editor-confirm"
                  onClick={handleConfirmSuggestedRelation}
                  disabled={isSubmitting || !suggestedRelationType || relationTypes.length === 0}
                >
                  Confirm relation
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {selectedRelation && (
        <div className="relation-editor">
          <div className="relation-editor-header">
            <div className="relation-editor-title">Relation</div>
            <button
              className="relation-editor-close"
              onClick={() => setSelectedRelationId(null)}
            >
              Close
            </button>
          </div>
          <div className="relation-editor-body">
            <div className="relation-editor-turn">
              <div className="relation-editor-label">FPP</div>
              <div className="relation-editor-text">
                {messages.find((m) => m.id === selectedRelation.to_message_id)?.turn_text || 'Unavailable'}
              </div>
            </div>
            <div className="relation-editor-turn">
              <div className="relation-editor-label">SPP</div>
              <div className="relation-editor-text">
                {messages.find((m) => m.id === selectedRelation.from_message_id)?.turn_text || 'Unavailable'}
              </div>
            </div>
            <div className="relation-editor-controls">
              <label className="relation-editor-label">Relation Type</label>
              <select
                className="relation-editor-select"
                value={selectedRelation.relation_type}
                onChange={(e) => handleUpdateAdjacencyPair(selectedRelation, e.target.value)}
                disabled={isSubmitting}
              >
                {relationTypes.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
              <button
                className="relation-editor-delete"
                onClick={() => handleDeleteAdjacencyPair(selectedRelation.id)}
                disabled={isSubmitting}
              >
                Delete Relation
              </button>
            </div>
          </div>
        </div>
      )}
      {showScrollToTop && (
        <button className="scroll-to-top-btn" onClick={scrollToTop} title="Scroll to top">
          ?
        </button>
      )}
    </div>
  );
};

export default AnnotatorChatRoomPage;























