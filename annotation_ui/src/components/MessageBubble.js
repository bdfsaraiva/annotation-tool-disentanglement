/**
 * @fileoverview Core chat-message display and annotation widget.
 *
 * `MessageBubble` renders a single chat turn with its metadata (turn number,
 * user, optional reply indicator) and annotation controls.  It supports two
 * annotation modes that share the same component:
 *
 * **Disentanglement mode** (`relationMode = false`):
 * - Displays a thread indicator badge and an "Add / Change Thread" button.
 * - Expands an inline text input with an autocomplete chip list of existing
 *   threads.  Submitting replaces any prior annotation for the current user
 *   (delete-then-create to enforce one-annotation-per-user-per-message).
 * - Shows an optional "Read" checkbox when `showReadToggle` is true.
 *
 * **Adjacency-pairs mode** (`relationMode = true`):
 * - The bubble becomes draggable; drag-and-drop events propagate to the parent
 *   via `onPairDragStart` / `onPairDrop` / `onPairDragOver`.
 * - Click selects the bubble as pair source; right-click opens the relation
 *   type context menu via `onPairContextMenu`.
 * - Thread annotation controls are hidden.
 *
 * The `data-message-id` attribute on the root element is read by
 * `useMessagePositions` to determine SVG arc endpoints for the relation canvas.
 */
import React, { useState } from 'react';
import './MessageBubble.css';

/**
 * Chat-turn widget with inline annotation controls.
 *
 * @param {Object} props
 * @param {Object} props.message - Message record from the API.
 * @param {number} props.message.id - Database ID (used as `data-message-id`).
 * @param {string|number} props.message.turn_id - Raw turn identifier; may be a
 *   composite string — the numeric suffix is extracted for display.
 * @param {string} props.message.user_id - Speaker identifier displayed in the header.
 * @param {string} props.message.turn_text - Full message body.
 * @param {string|number|null} [props.message.reply_to_turn] - Turn reference
 *   for the reply-chain indicator (checked against several field aliases).
 * @param {Object[]} [props.annotations=[]] - All annotations on this message
 *   from all annotators; the component isolates the current user's entry.
 * @param {Function} props.onAnnotationCreate - Called with a thread-name string
 *   to create a new annotation.
 * @param {Function} props.onAnnotationDelete - Called with an annotation ID to
 *   remove the current user's existing annotation before reassigning.
 * @param {string[]} [props.existingThreads=[]] - All thread labels in the room,
 *   used to populate the autocomplete chip list.
 * @param {string} props.currentUserUsername - Username of the logged-in
 *   annotator; used to find and isolate the user's own annotation.
 * @param {boolean} props.isAnnotating - When `true`, disables the add-thread
 *   button to prevent concurrent submission.
 * @param {boolean} [props.isUserHighlighted=false] - Applies `user-highlighted`
 *   CSS class to visually group all turns from the same user.
 * @param {boolean} [props.isThreadHighlighted=false] - Applies
 *   `thread-highlighted` CSS class when the message belongs to a selected thread.
 * @param {Function} [props.onUserClick] - Called with `user_id` when the User
 *   badge is clicked.
 * @param {Function} [props.onThreadClick] - (Unused in current render; reserved
 *   for future thread-badge click handling.)
 * @param {string|null} [props.threadColor=null] - CSS colour applied as border
 *   and tinted background when the message is annotated.
 * @param {Object} [props.threadColors={}] - Map of `{threadId: colour}` for
 *   colouring the autocomplete chips.
 * @param {boolean} [props.relationMode=false] - Switches the bubble into
 *   adjacency-pairs interaction mode.
 * @param {Function} [props.onPairDragStart] - Called with `message.id` when a
 *   drag operation begins in relation mode.
 * @param {Function} [props.onPairDrop] - Called with `message.id` when another
 *   bubble is dropped onto this one.
 * @param {Function} [props.onPairDragOver] - Called with `message.id` during
 *   a drag-over event.
 * @param {Function} [props.onPairSelect] - Called with `message.id` on click in
 *   relation mode (selects as pair source).
 * @param {Function} [props.onPairContextMenu] - Called with `(message.id, event)`
 *   on right-click in relation mode.
 * @param {boolean} [props.isPairSource=false] - Applies `pair-source` class.
 * @param {boolean} [props.isPairTarget=false] - Applies `pair-target` class.
 * @param {boolean} [props.isRelationLinked=false] - Highlights when this turn
 *   participates in the selected adjacency-pair relation.
 * @param {boolean} [props.isReplyLinked=false] - Highlights when this turn is
 *   part of the hovered reply chain.
 * @param {boolean} [props.isUserHoverLinked=false] - Highlights turns from the
 *   same user while hovering the user badge.
 * @param {Function} [props.onReplyHover] - Called with the reply-to turn ID
 *   when the reply indicator is hovered.
 * @param {Function} [props.onReplyHoverEnd] - Called when hover leaves the
 *   reply indicator.
 * @param {Function} [props.onReplyClick] - Called with the reply-to turn ID
 *   when the indicator is clicked.
 * @param {Function} [props.onUserHover] - Called with `user_id` on user badge hover.
 * @param {Function} [props.onUserHoverEnd] - Called when hover leaves the user badge.
 * @param {Function} [props.onMessageHover] - Called with `message.id` on hover
 *   in relation mode.
 * @param {Function} [props.onMessageHoverEnd] - Called when hover ends in
 *   relation mode.
 * @param {Object[]} [props.adjacencyPairsOutgoing=[]] - Outgoing pair records
 *   (currently used by parent for SVG canvas; not rendered inside the bubble).
 * @param {Object[]} [props.adjacencyPairsIncoming=[]] - Incoming pair records
 *   (same note as above).
 * @param {Function} [props.onPairDelete] - Called to delete an adjacency pair.
 * @param {boolean} [props.showReadToggle=false] - When `true`, renders a "Read"
 *   checkbox in the header.
 * @param {boolean} [props.isRead=false] - Controlled checked state for the
 *   read toggle.
 * @param {Function} [props.onReadToggle] - Called when the read checkbox changes.
 */
const MessageBubble = ({
  message,
  annotations = [],
  onAnnotationCreate,
  onAnnotationDelete,
  existingThreads = [],
  currentUserUsername,
  isAnnotating,
  isUserHighlighted = false,
  isThreadHighlighted = false,
  onUserClick,
  onThreadClick,
  threadColor = null,
  threadColors = {},
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
  onReplyClick,
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

  // Isolate the current user's annotation; each user may have at most one
  // annotation per message (enforced by handleThreadSubmit's delete-then-create).
  const currentUserAnnotation = annotations.find(ann => ann.annotator_username === currentUserUsername);

  // The reply reference may arrive under different field names depending on
  // API version; prefer the most specific name and fall back gracefully.
  const replyToValue =
    message.reply_to_turn ??
    message.reply_to ??
    message.reply_to_id ??
    null;

  /**
   * Extract a clean display turn number from a potentially composite turn ID.
   * e.g., "VAC_R10_001" → "1", "42" → "42".
   *
   * @param {string|number|null} turnId
   * @returns {string}
   */
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

  /**
   * Propagate a user-badge click to the parent so it can toggle highlighting
   * for all turns from the same user.
   */
  const handleUserClick = () => {
    if (onUserClick && message.user_id) {
      onUserClick(message.user_id);
    }
  };

  /**
   * Assign this message to a thread.
   *
   * Implements a delete-then-create upsert: if the current user already has an
   * annotation on this message, it is deleted before the new one is created.
   * This guarantees at most one annotation per user per message.
   *
   * @param {string} threadName - The thread label to assign.
   */
  const handleThreadSubmit = async (threadName) => {
    if (!threadName.trim()) return;

    try {
      setError(null);

      // Delete the existing annotation first so the backend unique constraint
      // is not violated when the new record is inserted.
      if (currentUserAnnotation) {
        await onAnnotationDelete(currentUserAnnotation.id);
      }

      // Create the replacement annotation.
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

  // Collect thread IDs already on this message so they can be excluded from
  // the autocomplete chip list (no point offering threads already assigned).
  const messageThreads = annotations.map(ann => ann.thread_id);
  const availableThreads = existingThreads.filter(thread => !messageThreads.includes(thread));

  // Build the CSS class list dynamically; falsy values are filtered out before
  // joining so the className string never contains stray spaces or empty tokens.
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

  /**
   * Initiate a drag-and-drop relation creation.  Encodes the source message ID
   * in the drag payload so the drop target can identify the pair source.
   * @param {React.DragEvent} e
   */
  const handleDragStart = (e) => {
    if (!relationMode || !onPairDragStart) return;
    e.dataTransfer.setData('text/plain', String(message.id));
    onPairDragStart(message.id);
  };

  /**
   * Accept a dropped bubble, notifying the parent of the intended pair target.
   * `preventDefault()` is required to allow the drop.
   * @param {React.DragEvent} e
   */
  const handleDrop = (e) => {
    if (!relationMode || !onPairDrop) return;
    e.preventDefault();
    onPairDrop(message.id);
  };

  /**
   * Allow the bubble to be a valid drop target and notify the parent so it
   * can update hover-highlighting during the drag.
   * @param {React.DragEvent} e
   */
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
            onClick={(e) => {
              e.stopPropagation();
              if (onReplyClick) {
                onReplyClick(replyToValue);
              }
            }}
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

