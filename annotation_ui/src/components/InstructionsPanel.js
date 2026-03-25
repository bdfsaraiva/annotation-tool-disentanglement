/**
 * @fileoverview Read-only instructions panel shown in the chat-room sidebar.
 *
 * Renders task-specific annotation guidance and, for the disentanglement mode,
 * a real-time progress bar derived from the `statistics` prop.  The panel
 * branches on `annotationMode` to show either adjacency-pairs or
 * disentanglement instructions without any shared wrapper duplication.
 */
import React from 'react';

/**
 * Displays contextual annotation instructions and (for disentanglement) live
 * progress statistics in the chat-room sidebar.
 *
 * @param {Object} props
 * @param {'disentanglement'|'adjacency_pairs'} props.annotationMode - Determines
 *   which set of instructions is rendered.
 * @param {Object} props.statistics - Annotation progress counters; only consumed
 *   in `'disentanglement'` mode.
 * @param {number} props.statistics.annotationPercentage - 0–100 value used to
 *   set the progress-bar fill width.
 * @param {number} props.statistics.annotatedMessages - Count of turns that have
 *   at least one annotation.
 * @param {number} props.statistics.totalMessages - Total number of turns in the
 *   chat room.
 * @param {number} props.statistics.unannotatedMessages - Turns still needing
 *   annotation (`totalMessages - annotatedMessages`).
 */
const InstructionsPanel = ({ annotationMode, statistics }) => (
  <div className="instruction-panel">
    <div className="manual-content">
      {annotationMode === 'adjacency_pairs' ? (
        <>
          <div className="manual-section">
            <h4>Adjacency Pairs Task</h4>
            <p>Your task is to link turns that form an adjacency pair. Drag one turn onto another to create a relation.</p>
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
      ) : (
        <>
          <div className="manual-section">
            <h4>Chat Disentanglement Task</h4>
            <p>
              Your task is to read chat interactions <strong>turn by turn</strong> and identify which <strong>thread</strong> each
              turn belongs to. This process helps separate entangled conversations in group chats.
            </p>
          </div>
          <div className="manual-section">
            <h4>Key Definitions</h4>
            <ul>
              <li><strong>Turn:</strong> A set of sentences sent by the same participant</li>
              <li><strong>Thread:</strong> A group of interconnected turns that share reply relations or the same topic</li>
              <li><strong>Chat Room:</strong> The entire conversation with all participants</li>
            </ul>
          </div>
          <div className="manual-section">
            <h4>How to Annotate</h4>
            <ol>
              <li><strong>Click "Add Thread"</strong> on any turn to assign it to a thread</li>
              <li><strong>Thread naming:</strong> Use any labels — what matters is <strong>grouping turns consistently</strong></li>
              <li><strong>Group related turns</strong> — turns about the same topic should share the same thread identifier</li>
              <li><strong>Create new threads</strong> when topics change or new discussions emerge</li>
            </ol>
          </div>
          <div className="manual-section">
            <h4>Annotation Guidelines</h4>
            <div className="guideline-grid">
              <div className="guideline-item">
                <strong>1. Check Reply Relationships</strong>
                <p>If a turn replies to another, they usually belong to the same thread</p>
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
                <p>"Yes", "I agree", "Exactly" → link to the thread they're responding to</p>
              </div>
              <div className="guideline-item">
                <strong>6. Unclear Messages</strong>
                <p>If you can't connect to previous turns → create a new thread</p>
              </div>
            </div>
          </div>
          <div className="manual-section">
            <h4>How Agreement is Measured</h4>
            <div className="agreement-explanation">
              <p>
                <strong>Important:</strong> The system uses the <strong>Hungarian algorithm</strong> to calculate
                inter-annotator agreement. It measures how well annotators group the same turns together,
                regardless of label names.
              </p>
              <div className="example-box">
                <strong>Example:</strong><br />
                - Annotator A: turns 1-5 → "Thread 0", turns 6-10 → "Thread 1"<br />
                - Annotator B: turns 1-5 → "Topic A", turns 6-10 → "Topic B"<br />
                <span className="result">Result: <strong>100% agreement!</strong></span>
              </div>
            </div>
          </div>
          <div className="progress-details">
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${statistics.annotationPercentage}%` }} />
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
);

export default InstructionsPanel;
