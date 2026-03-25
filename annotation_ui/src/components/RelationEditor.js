/**
 * @fileoverview Adjacency-pair relation editor panels.
 *
 * Exports two sibling components that are rendered in the chat-room sidebar
 * whenever an adjacency-pair relation is selected or suggested:
 *
 * - `SelectedRelationEditor` — shown when the user clicks an existing arc on
 *   the canvas; lets the annotator change the relation type or delete the pair.
 * - `SuggestedRelationEditor` — shown after a drag-and-drop or reply-link
 *   interaction creates a pending (unsaved) pair; lets the annotator pick a
 *   relation type and confirm creation.
 *
 * Both panels render `null` when no relevant selection is active, so the
 * parent can mount them unconditionally and rely on this guard.
 */
import React from 'react';

/**
 * Editor panel for an existing adjacency-pair relation.
 *
 * Displays the FPP (First-Pair Part) and SPP (Second-Pair Part) turn texts
 * resolved from the `messages` list, a relation-type selector, and a delete
 * button.  All interactive controls are disabled while `isSubmitting` is true.
 *
 * @param {Object} props
 * @param {Object|null} props.selectedRelation - The relation record to edit, or
 *   `null` (renders nothing).
 * @param {number} props.selectedRelation.id - Database ID used for deletion.
 * @param {number} props.selectedRelation.to_message_id - ID of the FPP message.
 * @param {number} props.selectedRelation.from_message_id - ID of the SPP message.
 * @param {string} props.selectedRelation.relation_type - Currently assigned label.
 * @param {Object[]} props.messages - Full list of room messages used to look up
 *   turn text by ID.
 * @param {string[]} props.relationTypes - Available relation-type options for the
 *   dropdown.
 * @param {boolean} props.isSubmitting - Disables controls during async operations.
 * @param {Function} props.onClose - Called when the "Close" button is clicked.
 * @param {Function} props.onUpdate - Called with `(relation, newType)` when the
 *   type select changes.
 * @param {Function} props.onDelete - Called with `relation.id` when the delete
 *   button is clicked.
 */
export const SelectedRelationEditor = ({
  selectedRelation,
  messages,
  relationTypes,
  isSubmitting,
  onClose,
  onUpdate,
  onDelete,
}) => {
  if (!selectedRelation) return null;

  const fppText = messages.find((m) => m.id === selectedRelation.to_message_id)?.turn_text || 'Unavailable';
  const sppText = messages.find((m) => m.id === selectedRelation.from_message_id)?.turn_text || 'Unavailable';

  return (
    <div className="relation-editor">
      <div className="relation-editor-header">
        <div className="relation-editor-title">Relation</div>
        <button className="relation-editor-close" onClick={onClose}>Close</button>
      </div>
      <div className="relation-editor-body">
        <div className="relation-editor-turn">
          <div className="relation-editor-label">FPP</div>
          <div className="relation-editor-text">{fppText}</div>
        </div>
        <div className="relation-editor-turn">
          <div className="relation-editor-label">SPP</div>
          <div className="relation-editor-text">{sppText}</div>
        </div>
        <div className="relation-editor-controls">
          <label className="relation-editor-label">Relation Type</label>
          <select
            className="relation-editor-select"
            value={selectedRelation.relation_type}
            onChange={(e) => onUpdate(selectedRelation, e.target.value)}
            disabled={isSubmitting}
          >
            {relationTypes.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
          <button
            className="relation-editor-delete"
            onClick={() => onDelete(selectedRelation.id)}
            disabled={isSubmitting}
          >
            Delete Relation
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Editor panel for a pending (not yet saved) adjacency-pair suggestion.
 *
 * Shown after a drag-and-drop event or reply-link interaction proposes a new
 * FPP→SPP link.  The annotator selects a relation type from the dropdown and
 * confirms; the confirm button is disabled until a type is chosen and no
 * submission is in flight.  Renders `null` when both `suggestedFpp` and
 * `suggestedSpp` are falsy.
 *
 * @param {Object} props
 * @param {Object|null} props.suggestedFpp - Message object for the First-Pair
 *   Part of the proposed relation.
 * @param {Object|null} props.suggestedSpp - Message object for the Second-Pair
 *   Part of the proposed relation.
 * @param {string} props.suggestedRelationType - Currently selected type label
 *   (may be an empty string before the user picks one).
 * @param {string[]} props.relationTypes - Available relation-type options.
 * @param {boolean} props.isSubmitting - Disables controls during async operations.
 * @param {Function} props.onClose - Called when the "Close" button is clicked.
 * @param {Function} props.onTypeChange - Called with the newly selected type
 *   string whenever the dropdown value changes.
 * @param {Function} props.onConfirm - Called with no arguments when the
 *   "Confirm relation" button is clicked.
 */
export const SuggestedRelationEditor = ({
  suggestedFpp,
  suggestedSpp,
  suggestedRelationType,
  relationTypes,
  isSubmitting,
  onClose,
  onTypeChange,
  onConfirm,
}) => {
  if (!suggestedFpp && !suggestedSpp) return null;
  return (
  <div className="relation-editor suggested-relation">
    <div className="relation-editor-header">
      <div className="relation-editor-title">Suggested relation</div>
      <button className="relation-editor-close" onClick={onClose}>Close</button>
    </div>
    <div className="relation-editor-body">
      <div className="relation-editor-turn">
        <div className="relation-editor-label">FPP</div>
        <div className="relation-editor-text">{suggestedFpp?.turn_text || 'Unavailable'}</div>
      </div>
      <div className="relation-editor-turn">
        <div className="relation-editor-label">SPP</div>
        <div className="relation-editor-text">{suggestedSpp?.turn_text || 'Unavailable'}</div>
      </div>
      <div className="relation-editor-controls">
        <label className="relation-editor-label">Relation Type</label>
        <select
          className="relation-editor-select"
          value={suggestedRelationType}
          onChange={(e) => onTypeChange(e.target.value)}
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
            onClick={onConfirm}
            disabled={isSubmitting || !suggestedRelationType || relationTypes.length === 0}
          >
            Confirm relation
          </button>
        </div>
      </div>
    </div>
  </div>
  );
};
