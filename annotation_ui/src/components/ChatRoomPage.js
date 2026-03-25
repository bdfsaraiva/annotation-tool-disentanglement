/**
 * @fileoverview Generic chat-room view (legacy/shared base).
 *
 * Fetches chat room metadata, all messages, and all annotations for each
 * message (one parallel promise per message), then builds a `threadTags` map
 * aggregating per-thread statistics (message count, annotator count).  Renders
 * message bubbles in a scrollable list alongside a `ThreadMenu` sidebar for
 * each discovered thread.
 *
 * Note: The main annotation workflows use the more specialised
 * `AnnotatorChatRoomPage` and `AdminChatRoomView` components.  This component
 * may serve as a simple read-only view or a development reference.
 */
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { projects, annotations } from '../utils/api';
import MessageBubble from './MessageBubble';
import ThreadMenu from './ThreadMenu';
import './ChatRoomPage.css';

/**
 * Chat room page that loads messages and annotations then renders an annotated
 * conversation view with a thread summary sidebar.
 */
const ChatRoomPage = () => {
  const { projectId, chatRoomId } = useParams();
  const navigate = useNavigate();
  const [chatRoom, setChatRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageAnnotations, setMessageAnnotations] = useState({});
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [annotationInProgress, setAnnotationInProgress] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [threadTags, setThreadTags] = useState({});

  useEffect(() => {
    fetchChatRoomData();
  }, [projectId, chatRoomId]);

  /**
   * Load chat room metadata, messages, and per-message annotations in sequence,
   * then aggregate thread statistics into `threadTags`.
   *
   * Annotation loading issues N parallel requests (one per message).  The
   * `annotator_count` field is derived by counting unique entries in a
   * transient `Set` that is deleted before the thread is stored in state.
   */
  const fetchChatRoomData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch chat room details
      const chatRoomData = await projects.getChatRoom(projectId, chatRoomId);
      setChatRoom(chatRoomData);

      // Fetch messages
      const messagesResponse = await projects.getChatMessages(projectId, chatRoomId);
      const messagesData = messagesResponse.messages || [];
      setMessages(messagesData);

      // Fetch annotations for all messages
      const annotationsPromises = messagesData.map(message => 
        annotations.getMessageAnnotations(projectId, message.id)
      );
      const annotationsResults = await Promise.all(annotationsPromises);

      // Process annotations and create thread tags
      const newMessageAnnotations = {};
      const newThreadTags = {};

      annotationsResults.forEach((messageAnnotations, index) => {
        const messageId = messagesData[index].id;
        newMessageAnnotations[messageId] = messageAnnotations;

        // Process thread tags
        messageAnnotations.forEach(annotation => {
          if (!newThreadTags[annotation.thread_id]) {
            newThreadTags[annotation.thread_id] = {
              id: annotation.thread_id,
              message_count: 1,
              annotators: new Set([annotation.annotator_username]),
              tags: [],
              created_at: annotation.created_at
            };
          } else {
            newThreadTags[annotation.thread_id].message_count++;
            newThreadTags[annotation.thread_id].annotators.add(annotation.annotator_username);
          }
        });
      });

      // Convert annotator Sets to counts
      Object.values(newThreadTags).forEach(thread => {
        thread.annotator_count = thread.annotators.size;
        delete thread.annotators;
      });

      setMessageAnnotations(newMessageAnnotations);
      setThreadTags(newThreadTags);
    } catch (err) {
      console.error('Error fetching chat room data:', err);
      setError(err.response?.data?.detail || err.message || 'Failed to load chat room data');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Toggle user-turn highlighting.  Clicking the same user a second time
   * deselects them.
   * @param {string} userId
   */
  const handleUserClick = (userId) => {
    setSelectedUserId(prevUserId => prevUserId === userId ? null : userId);
  };

  const handleBackToProject = () => {
    navigate(`/admin/projects/${projectId}`);
  };

  /**
   * Create a new annotation and optimistically update local state.
   *
   * Sets an in-progress flag for the specific message to disable its controls
   * while the request is in flight.  On success, appends the new annotation to
   * `messageAnnotations` and increments the relevant thread's message count.
   *
   * @param {number} messageId
   * @param {string} tag - Thread label to assign.
   */
  const handleAnnotationCreate = async (messageId, tag) => {
    try {
      setAnnotationInProgress(prev => ({ ...prev, [messageId]: true }));
      const newAnnotation = await annotations.createAnnotation(projectId, messageId, { 
        message_id: messageId,
        thread_id: tag
      });
      
      setMessageAnnotations(prev => ({
        ...prev,
        [messageId]: [...(prev[messageId] || []), newAnnotation]
      }));

      // Update thread tags
      setThreadTags(prev => {
        const newTags = { ...prev };
        if (!newTags[tag]) {
          newTags[tag] = {
            id: tag,
            message_count: 1,
            annotator_count: 1,
            tags: [],
            created_at: new Date().toISOString()
          };
        } else {
          newTags[tag].message_count++;
        }
        return newTags;
      });
    } catch (err) {
      console.error('Error creating annotation:', err);
      setError(err.response?.data?.detail || err.message || 'Failed to create annotation');
      throw err;
    } finally {
      setAnnotationInProgress(prev => ({ ...prev, [messageId]: false }));
    }
  };

  /**
   * Delete an annotation and synchronise local state.
   *
   * Removes the annotation from `messageAnnotations` and decrements the
   * thread's message count, deleting the thread entry entirely when the count
   * reaches zero.
   *
   * @param {number} messageId
   * @param {number} annotationId
   */
  const handleAnnotationDelete = async (messageId, annotationId) => {
    try {
      await annotations.deleteAnnotation(projectId, messageId, annotationId);
      
      setMessageAnnotations(prev => {
        const updatedAnnotations = prev[messageId].filter(ann => ann.id !== annotationId);
        return {
          ...prev,
          [messageId]: updatedAnnotations
        };
      });

      // Update thread tags
      setThreadTags(prev => {
        const newTags = { ...prev };
        const annotation = messageAnnotations[messageId].find(ann => ann.id === annotationId);
        if (annotation && newTags[annotation.thread_id]) {
          newTags[annotation.thread_id].message_count--;
          if (newTags[annotation.thread_id].message_count === 0) {
            delete newTags[annotation.thread_id];
          }
        }
        return newTags;
      });
    } catch (err) {
      console.error('Error deleting annotation:', err);
      setError(err.response?.data?.detail || err.message || 'Failed to delete annotation');
    }
  };

  const handleTagEdit = async (threadId, newTags) => {
    try {
      // Update all messages with this thread ID
      const messagesToUpdate = Object.entries(messageAnnotations)
        .filter(([_, annotations]) => annotations.some(ann => ann.thread_id === threadId))
        .map(([messageId, _]) => messageId);

      // Update thread tags
      setThreadTags(prev => {
        const newThreadTags = { ...prev };
        if (newThreadTags[threadId]) {
          newThreadTags[threadId].tags = newTags;
        }
        return newThreadTags;
      });
    } catch (err) {
      console.error('Error updating thread tags:', err);
      setError(err.response?.data?.detail || err.message || 'Failed to update thread tags');
    }
  };

  if (loading) return <div className="loading">Loading chat room data...</div>;
  if (error) return <div className="error">{error}</div>;
  if (!chatRoom) return <div className="error">Chat room not found</div>;

  return (
    <div className="chat-room-page">
      <div className="chat-room-header">
        <button onClick={handleBackToProject} className="back-button">
          ← Back to Project
        </button>
        <h2>{chatRoom.name}</h2>
        <p className="chat-room-description">{chatRoom.description}</p>
      </div>

      <div className="chat-room-content">
        <div className="messages-section">
          <div className="chat-room-stats">
            <span>Total Turns: {messages.length}</span>
            {selectedUserId && (
              <span>Selected User: {selectedUserId}</span>
            )}
          </div>

          <div className="messages-container">
            {messages.map(message => (
              <MessageBubble
                key={message.id}
                message={message}
                annotations={messageAnnotations[message.id] || []}
                onAnnotationCreate={(tag) => handleAnnotationCreate(message.id, tag)}
                onAnnotationDelete={(annotationId) => handleAnnotationDelete(message.id, annotationId)}
                isUserSelected={selectedUserId === message.user_id}
                onUserClick={handleUserClick}
                isAnnotating={annotationInProgress[message.id]}
              />
            ))}
          </div>
        </div>

        <div className="thread-menu-section">
          {Object.entries(threadTags).map(([threadId, thread]) => (
            <ThreadMenu
              key={threadId}
              thread={thread}
              onTagEdit={handleTagEdit}
              isLoading={loading}
              error={error}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default ChatRoomPage; 
