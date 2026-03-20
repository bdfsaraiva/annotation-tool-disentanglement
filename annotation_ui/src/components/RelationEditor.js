import React from 'react';

/**
 * Panel shown when the user selects an existing adjacency-pair relation.
 * Allows changing the relation type or deleting it.
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
 * Panel shown when a reply-link suggest a new adjacency pair.
 * The user selects the relation type and confirms creation.
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
