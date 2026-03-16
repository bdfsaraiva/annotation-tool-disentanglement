import React, { useState } from 'react';
import './MessageBubble.css';

const MessageBubble = ({ 
  message, 
  annotations = [], 
  onAnnotationCreate, 
  onAnnotationDelete,
  existingThreads = [],
  currentUserUsername,
  isAnnotating,
  // New props for highlighting functionality
  isUserHighlighted = false,
  isThreadHighlighted = false,
  onUserClick,
  onThreadClick,
  // New props for thread colors
  threadColor = null,
  threadColors = {},
  // Adjacency pairs mode
  relationMode = false,
  onPairDragStart,
  onPairDrop,
  onPairDragOver,
  onPairSelect,
  onPairContextMenu,
  isPairSource = false,
  isPairTarget = false,
  isRelationLinked = false,
  isReplyLinked = false,
  isUserHoverLinked = false,
  onReplyHover,
  onReplyHoverEnd,
  onUserHover,
  onUserHoverEnd,
  onMessageHover,
  onMessageHoverEnd,
  adjacencyPairsOutgoing = [],
  adjacencyPairsIncoming = [],
  onPairDelete,
  showReadToggle = false,
  isRead = false,
  onReadToggle
}) => {
  const [expanded, setExpanded] = useState(false);
  const [showThreadInput, setShowThreadInput] = useState(false);
  const [threadInput, setThreadInput] = useState('');
  const [error, setError] = useState(null);
  const maxLength = 300;

  const toggleExpand = () => {
    setExpanded(!expanded);
  };

  const displayText = message && message.turn_text
    ? (expanded ? message.turn_text : message.turn_text.slice(0, maxLength))
    : 'No message content';

  const shouldShowExpandButton = message?.turn_text && message.turn_text.length > maxLength;

  // Find current user's annotation on this message
  const currentUserAnnotation = annotations.find(ann => ann.annotator_username === currentUserUsername);

  const replyToValue =
    message.reply_to_turn ??
    message.reply_to ??
    message.reply_to_id ??
    null;

  // Extract numeric part from turn_id (e.g., "VAC_R10_001" -> "001")
  const getNumericTurnId = (turnId) => {
    if (turnId === null || typeof turnId === 'undefined') return 'N/A';
    const turnIdStr = String(turnId);
    // Get ALL numbers and take the LAST one (the actual turn number)
    const matches = turnIdStr.match(/\d+/g);
    if (matches && matches.length > 0) {
      // Return the last number found, converted to integer to remove leading zeros
      return parseInt(matches[matches.length - 1], 10).toString();
    }
    return turnIdStr;
  };

  // Handle user ID click to highlight all messages from same user
  const handleUserClick = () => {
    if (onUserClick && message.user_id) {
      onUserClick(message.user_id);
    }
  };

  const handleThreadSubmit = async (threadName) => {
    if (!threadName.trim()) return;
    
    try {
      setError(null);
      
      // If user already has an annotation on this message, delete it first
      if (currentUserAnnotation) {
        await onAnnotationDelete(currentUserAnnotation.id);
      }
      
      // Then create the new annotation
      await onAnnotationCreate(threadName.trim());
      setThreadInput('');
      setShowThreadInput(false);
    } catch (err) {
      console.error('Error creating annotation:', err);
      setError('Failed to add thread. Please try again.');
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleThreadSubmit(threadInput);
    } else if (e.key === 'Escape') {
      setShowThreadInput(false);
      setThreadInput('');
      setError(null);
    }
  };

  const handleThreadSelect = (threadName) => {
    handleThreadSubmit(threadName);
  };

  // Get unique threads from existing annotations
  const messageThreads = annotations.map(ann => ann.thread_id);
  
  // Filter existing threads to show only ones not already on this message
  const availableThreads = existingThreads.filter(thread => !messageThreads.includes(thread));

  // Determine bubble classes for highlighting
  const bubbleClasses = [
    'message-bubble',
    expanded ? 'expanded' : '',
    isAnnotating ? 'annotating' : '',
    isUserHighlighted ? 'user-highlighted' : '',
    isThreadHighlighted ? 'thread-highlighted' : '',
    annotations.length > 0 ? 'has-annotations' : '',
    relationMode ? 'relation-mode' : '',
    isPairSource ? 'pair-source' : '',
    isPairTarget ? 'pair-target' : '',
    isRelationLinked ? 'relation-linked' : '',
    isReplyLinked ? 'reply-linked' : '',
    isUserHoverLinked ? 'user-hover-linked' : ''
  ].filter(Boolean).join(' ');

  const handleDragStart = (e) => {
    if (!relationMode || !onPairDragStart) return;
    e.dataTransfer.setData('text/plain', String(message.id));
    onPairDragStart(message.id);
  };

  const handleDrop = (e) => {
    if (!relationMode || !onPairDrop) return;
    e.preventDefault();
    onPairDrop(message.id);
  };

  const handleDragOver = (e) => {
    if (!relationMode) return;
    e.preventDefault();
    if (onPairDragOver) {
      onPairDragOver(message.id);
    }
  };

  return (
    <div 
      className={bubbleClasses}
      data-message-id={message.id}
      draggable={relationMode}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onMouseEnter={() => {
        if (relationMode && onMessageHover) {
          onMessageHover(message.id);
        }
      }}
      onMouseLeave={() => {
        if (relationMode && onMessageHoverEnd) {
          onMessageHoverEnd();
        }
      }}
      onClick={() => {
        if (relationMode && onPairSelect) {
          onPairSelect(message.id);
        }
      }}
      onContextMenu={(e) => {
        if (relationMode && onPairContextMenu) {
          onPairContextMenu(message.id, e);
        }
      }}
      style={{
        ...threadColor ? { 
          border: `3px solid ${threadColor}`,
          backgroundColor: `${threadColor}15`, // More visible background tint
          boxShadow: `0 2px 8px ${threadColor}40` // Colored shadow for more prominence
        } : {},
      }}>
      
      <div className="message-header">
        <span className="turn-id">
          <span className="turn-id-label">Turn</span>
          <span className="turn-id-value">{getNumericTurnId(message.turn_id)}</span>
        </span>
        <span 
          className="user-id"
          onClick={handleUserClick}
          onMouseEnter={() => onUserHover && onUserHover(message.user_id)}
          onMouseLeave={() => onUserHoverEnd && onUserHoverEnd()}
//          title={`Click to highlight all turns from ${message.user_id}`}
        >
          <span className="user-id-label">User</span>
          <span className="user-id-value">{message.user_id}</span>
        </span>
        {replyToValue !== null && replyToValue !== undefined && replyToValue !== '' && (
          <span
            className="reply-to"
            onMouseEnter={() => onReplyHover && onReplyHover(replyToValue)}
            onMouseLeave={() => onReplyHoverEnd && onReplyHoverEnd()}
//            title="Hover to highlight reply chain"
          >
            <span className="reply-to-label">↪</span>
            <span className="reply-to-value">{getNumericTurnId(replyToValue)}</span>
          </span>
        )}
        <div className="message-header-actions">
          {showReadToggle && (
            <label
              className="read-flag"
              onClick={(e) => e.stopPropagation()}
            >
              <input
                type="checkbox"
                checked={isRead}
                onChange={(e) => {
                  e.stopPropagation();
                  if (onReadToggle) onReadToggle();
                }}
              />
              <span>Read</span>
            </label>
          )}
          {/* Thread indicator for annotated messages */}
          {threadColor && currentUserAnnotation && (
            <span 
              className="thread-indicator"
              style={{ 
                backgroundColor: threadColor
              }}
              title={`Thread: ${currentUserAnnotation.thread_id}`}
            >
              {currentUserAnnotation.thread_id}
            </span>
          )}
          {!relationMode && (
            <button 
              className="add-thread-button header"
              onClick={() => setShowThreadInput(!showThreadInput)}
              disabled={isAnnotating}
            >
              {showThreadInput ? 'Cancel' : currentUserAnnotation ? 'Change Thread' : '+ Add Thread'}
            </button>
          )}
        </div>
      </div>

      <div className="message-content">
        {displayText}
        {!expanded && shouldShowExpandButton && '...'}
      </div>

      {shouldShowExpandButton && (
        <div className="see-more-container">
          <button className="see-all-button" onClick={toggleExpand}>
            {expanded ? 'See less' : 'See more'}
          </button>
        </div>
      )}

      {!relationMode && (
        <div className="thread-section">
          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          {showThreadInput && (
            <div className="thread-input-section">
              <input
                type="text"
                value={threadInput}
                onChange={(e) => setThreadInput(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder={currentUserAnnotation ? 
                  `Change from "${currentUserAnnotation.thread_id}" to...` : 
                  "Type thread name and press Enter..."
                }
                className="thread-input"
                autoFocus
              />
              <div className="input-hint">
                {currentUserAnnotation ? 
                  'Press Enter to change thread, Escape to cancel' :
                  'Press Enter to add, Escape to cancel'
                }
              </div>
              
              {availableThreads.length > 0 && (
                <div className="existing-threads">
                  <div className="existing-threads-label">Or select existing thread:</div>
                  <div className="thread-chips">
                    {availableThreads.map(thread => (
                      <button
                        key={thread}
                        className="thread-chip"
                        style={{ 
                          backgroundColor: threadColors[thread] || '#6B7280'
                        }}
                        onClick={() => handleThreadSelect(thread)}
                      >
                        {thread}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MessageBubble;

