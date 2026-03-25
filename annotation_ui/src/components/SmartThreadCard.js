/**
 * @fileoverview Compact thread summary card used in the disentanglement sidebar.
 *
 * Renders a colour-coded card for a single annotation thread.  The header is
 * always visible and shows the thread label and turn count.  On hover, a
 * preview panel expands to list every turn in the thread; clicking a preview
 * row fires `onMessageSelect` to scroll the main chat pane to that turn.
 *
 * Turn IDs may be composite strings (e.g. "room_42_turn_7"); `getNumericTurnId`
 * extracts only the final numeric segment for a clean display value.
 */
import React, { useState } from 'react';
import './SmartThreadCard.css';

/**
 * Colour-coded card summarising one disentanglement thread.
 *
 * @param {Object} props
 * @param {string} props.threadId - The thread label used as the card title.
 * @param {Object} props.threadDetails - Aggregated thread metadata.
 * @param {number[]} props.threadDetails.messages - IDs of turns assigned to
 *   this thread.
 * @param {Set<string>} props.threadDetails.annotators - Usernames of annotators
 *   who contributed to this thread.
 * @param {Object[]} props.threadDetails.annotations - Raw annotation records
 *   (used externally; not rendered directly by this component).
 * @param {Object[]} props.messages - Full list of chat-room message objects
 *   (used to resolve turn content from the IDs in `threadDetails.messages`).
 * @param {boolean} props.isHighlighted - When `true`, applies the
 *   `highlighted` CSS class to visually distinguish the selected thread.
 * @param {Function} props.onThreadClick - Called with `threadId` when the card
 *   body is clicked; typically used to toggle thread highlighting.
 * @param {Function} [props.onMessageSelect] - Called with a message `id` when
 *   the user clicks a preview row; typically scrolls the chat pane to that turn.
 * @param {string} [props.threadColor='#6B7280'] - CSS colour applied to the
 *   card border and header background.
 */
const SmartThreadCard = ({
  threadId,
  threadDetails,
  messages,
  isHighlighted,
  onThreadClick,
  onMessageSelect,
  threadColor = '#6B7280'
}) => {
  const [isHovered, setIsHovered] = useState(false);

  if (!threadDetails) return null;

  const { messages: messageIds, annotators, annotations } = threadDetails;
  const messageCount = messageIds.length;
  const annotatorsList = Array.from(annotators);

  // Resolve message objects and sort chronologically.  `turn_id` may be a
  // composite string, so the sort extracts the trailing numeric segment.
  const threadMessages = messages.filter(msg =>
    messageIds.includes(msg.id)
  ).sort((a, b) => {
    const aTurnStr = String(a.turn_id || a.id);
    const bTurnStr = String(b.turn_id || b.id);
    // Extract all digit runs and compare by the last one (the actual sequence number).
    const aMatches = aTurnStr.match(/\d+/g);
    const bMatches = bTurnStr.match(/\d+/g);
    const aTurn = aMatches ? parseInt(aMatches[aMatches.length - 1], 10) : a.id;
    const bTurn = bMatches ? parseInt(bMatches[bMatches.length - 1], 10) : b.id;
    return aTurn - bTurn;
  });

  /**
   * Propagate the thread-click event to the parent handler.
   */
  const handleCardClick = () => {
    onThreadClick(threadId);
  };

  /**
   * Handle a click on a preview message row.  Stops propagation so the parent
   * card click handler is not also triggered, then calls `onMessageSelect`.
   *
   * @param {number} messageId - Database ID of the clicked message.
   * @param {React.SyntheticEvent} event - The click event.
   */
  const handleMessageClick = (messageId, event) => {
    event.stopPropagation();
    if (onMessageSelect) {
      onMessageSelect(messageId);
    }
  };

  /**
   * Extract a clean display turn number from a potentially composite `turn_id`.
   *
   * Turn IDs may include room or session prefixes (e.g. "room_3_turn_007").
   * This helper extracts the last numeric segment and strips leading zeros,
   * producing a compact label like "7".
   *
   * @param {string|number|null} turnId - Raw turn identifier from the message object.
   * @returns {string} Display-friendly turn number, or `'N/A'` when absent.
   */
  const getNumericTurnId = (turnId) => {
    if (!turnId) return 'N/A';
    const turnIdStr = String(turnId);
    // Collect all digit runs; the last one is the actual sequential turn number.
    const matches = turnIdStr.match(/\d+/g);
    if (matches && matches.length > 0) {
      // parseInt removes leading zeros before converting back to string.
      return parseInt(matches[matches.length - 1], 10).toString();
    }
    return turnIdStr;
  };

  const cardClasses = [
    'smart-thread-card',
    isHighlighted ? 'highlighted' : '',
    isHovered ? 'hovered' : ''
  ].filter(Boolean).join(' ');

  return (
    <div 
      className={cardClasses}
      onClick={handleCardClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        borderColor: threadColor,
        '--thread-color': threadColor
      }}
    >
      <div 
        className="thread-card-header"
        style={{ 
          backgroundColor: threadColor
        }}
      >
        <h4 className="thread-title">{threadId}</h4>
        <div className="thread-stats">
          <span className="message-count">{messageCount} turns</span>
        </div>
      </div>
      
      {isHovered && (
        <div className="thread-preview">
          <div className="preview-messages">
            {threadMessages.map((message, index) => (
              <div 
                key={message.id}
                className="preview-message"
                onClick={(e) => handleMessageClick(message.id, e)}
                title="Click to scroll to this turn"
              >
                <div className="preview-header">
                  <span className="preview-turn">Turn {getNumericTurnId(message.turn_id)}</span>
                  <span className="preview-user">User {message.user_id}</span>
                </div>
                <div className="preview-content">
                  {message.turn_text ? 
                    (message.turn_text.length > 100 ? 
                      message.turn_text.substring(0, 100) + '...' : 
                      message.turn_text
                    ) : 
                    'No content'
                  }
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SmartThreadCard; 