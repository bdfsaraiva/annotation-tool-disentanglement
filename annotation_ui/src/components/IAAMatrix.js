/**
 * @fileoverview Pairwise inter-annotator agreement (IAA) matrix component.
 *
 * Renders a symmetric N×N heat-map table where each cell shows the agreement
 * score between two annotators.  The colour scale runs from red (low) through
 * yellow (medium) to green (high) using HSL interpolation on the 0–120 hue
 * range.  Self-comparison cells on the diagonal are shown in a fixed dark
 * green.
 *
 * Two display modes are supported:
 * - **Disentanglement** (`isAdjPairs = false`): cells display a percentage
 *   accuracy derived from the Hungarian-algorithm one-to-one thread matching.
 * - **Adjacency pairs** (`isAdjPairs = true`): cells display the combined IAA
 *   score (LinkF1 × TypeAcc formula) and hover tooltips expose the component
 *   metrics (Link F1, Type Accuracy, agreed link count, alpha weight).
 */
import React from 'react';
import './IAAMatrix.css';

/**
 * Symmetric heat-map matrix of pairwise IAA scores.
 *
 * @param {Object} props
 * @param {Array<Object>} props.pairwiseAccuracies - Array of pair objects
 *   returned by the IAA API endpoint.  Each object must contain at minimum
 *   `annotator_1_id`, `annotator_2_id`, and `accuracy` (0–100).  In
 *   adjacency-pairs mode the objects additionally carry `_link_f1`,
 *   `_type_accuracy`, `_agreed_links`, `_alpha`, and optionally
 *   `_combined_iaa`.
 * @param {Array<{id: number, username: string}>} props.annotators - Ordered
 *   list of annotators whose IDs appear in `pairwiseAccuracies`.  The matrix
 *   row and column order follows this array.
 * @param {boolean} [props.isAdjPairs=false] - When `true`, renders the matrix
 *   in adjacency-pairs mode with 0–1 score display and richer tooltips.
 */
const IAAMatrix = ({ pairwiseAccuracies, annotators, isAdjPairs = false }) => {
    // Build a bidirectional lookup map so getPair() runs in O(1) regardless of
    // which direction (annotator_1 vs annotator_2) the pair was stored.
    const accuracyMap = new Map();
    pairwiseAccuracies.forEach(pair => {
        const key1 = `${pair.annotator_1_id}-${pair.annotator_2_id}`;
        const key2 = `${pair.annotator_2_id}-${pair.annotator_1_id}`;
        accuracyMap.set(key1, pair);
        accuracyMap.set(key2, pair);
    });

    /**
     * Look up the pair object for two annotators, returning a synthetic
     * `{accuracy:100, _self:true}` sentinel for the diagonal.
     *
     * @param {number} annotatorId1
     * @param {number} annotatorId2
     * @returns {Object|null} Pair data or `null` if no data exists.
     */
    const getPair = (annotatorId1, annotatorId2) => {
        if (annotatorId1 === annotatorId2) return { accuracy: 100, _self: true };
        return accuracyMap.get(`${annotatorId1}-${annotatorId2}`) || null;
    };

    /**
     * Return the numeric accuracy (0–100) between two annotators, or `null`
     * when no data is available.
     *
     * @param {number} annotatorId1
     * @param {number} annotatorId2
     * @returns {number|null}
     */
    const getAccuracy = (annotatorId1, annotatorId2) => {
        const pair = getPair(annotatorId1, annotatorId2);
        return pair ? pair.accuracy : null;
    };

    /**
     * Map an accuracy value to a background colour.
     *
     * Uses HSL interpolation on the 0–120 hue range (red → green).  The
     * luminance is kept at 38 % so white text remains readable on all cells.
     * Self-comparison cells use a fixed dark green (#2e7d32).  Cells with no
     * data fall back to the CSS tertiary background variable.
     *
     * @param {number|null} accuracy - 0–100 or `null`.
     * @returns {string} CSS colour value.
     */
    const getColor = (accuracy) => {
        if (accuracy === null) return 'var(--background-color-tertiary, #f0f0f0)';
        if (accuracy === 100) return '#2e7d32'; // self-cell: solid dark green
        const hue = (accuracy / 100) * 120; // 0=red → 120=green
        return `hsl(${hue}, 65%, 38%)`;
    };

    /**
     * Return the text colour for a matrix cell.  All coloured cells use white;
     * empty (no-data) cells fall back to the secondary text CSS variable.
     *
     * @param {number|null} accuracy
     * @returns {string} CSS colour value.
     */
    const getTextColor = (accuracy) => {
        if (accuracy === null) return 'var(--text-color-secondary, #888)';
        return '#ffffff'; // white text on all coloured cells
    };

    return (
        <div className="iaa-matrix">
            <table className="matrix-table">
                <thead>
                    <tr>
                        <th className="matrix-header-empty"></th>
                        {annotators.map(annotator => (
                            <th key={annotator.id} className="matrix-header">
                                <div className="annotator-header">
                                    <span className="annotator-name">{annotator.username}</span>
                                </div>
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {annotators.map(rowAnnotator => (
                        <tr key={rowAnnotator.id}>
                            <td className="matrix-row-header">
                                <div className="annotator-header">
                                    <span className="annotator-name">{rowAnnotator.username}</span>
                                </div>
                            </td>
                            {annotators.map(colAnnotator => {
                                const pair = getPair(rowAnnotator.id, colAnnotator.id);
                                const accuracy = pair ? pair.accuracy : null;
                                const isUpperTriangle = annotators.findIndex(a => a.id === rowAnnotator.id) <
                                                       annotators.findIndex(a => a.id === colAnnotator.id);
                                const isSelf = rowAnnotator.id === colAnnotator.id;

                                let tooltipText;
                                if (isSelf) {
                                    tooltipText = `${rowAnnotator.username} (self)`;
                                } else if (pair && isAdjPairs) {
                                    tooltipText = [
                                        `${rowAnnotator.username} vs ${colAnnotator.username}`,
                                        `Combined IAA : ${(pair._combined_iaa ?? pair._link_f1)?.toFixed(3)}  (α=${pair._alpha})`,
                                        `Link F1      : ${pair._link_f1?.toFixed(3)}`,
                                        `Type Accuracy: ${pair._type_accuracy?.toFixed(3)}`,
                                        `Agreed links : ${pair._agreed_links}`,
                                    ].join('\n');
                                } else if (accuracy !== null) {
                                    tooltipText = `${rowAnnotator.username} vs ${colAnnotator.username}: ${accuracy.toFixed(1)}%`;
                                } else {
                                    tooltipText = 'No data available';
                                }

                                let displayValue = null;
                                if (!isSelf && accuracy !== null) {
                                    displayValue = isAdjPairs
                                        ? (pair.accuracy / 100).toFixed(3)
                                        : `${accuracy.toFixed(1)}%`;
                                }

                                return (
                                    <td
                                        key={colAnnotator.id}
                                        className={`matrix-cell ${isSelf ? 'self-cell' : ''} ${isUpperTriangle ? 'upper-triangle' : ''}`}
                                        style={{
                                            backgroundColor: getColor(accuracy),
                                            color: getTextColor(accuracy)
                                        }}
                                        title={tooltipText}
                                    >
                                        {isSelf ? (
                                            <span className="self-indicator">—</span>
                                        ) : displayValue !== null ? (
                                            <span className="accuracy-value">{displayValue}</span>
                                        ) : (
                                            <span className="no-data">—</span>
                                        )}
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
            
            <div className="matrix-legend">
                <h4>Legend</h4>
                <div className="legend-items">
                    <div className="legend-item">
                        <div className="legend-color" style={{ backgroundColor: 'hsl(0,65%,38%)' }}></div>
                        <span>Low (0–50%)</span>
                    </div>
                    <div className="legend-item">
                        <div className="legend-color" style={{ backgroundColor: 'hsl(60,65%,38%)' }}></div>
                        <span>Medium (50–75%)</span>
                    </div>
                    <div className="legend-item">
                        <div className="legend-color" style={{ backgroundColor: 'hsl(100,65%,38%)' }}></div>
                        <span>High (75–100%)</span>
                    </div>
                    <div className="legend-item">
                        <div className="legend-color" style={{ backgroundColor: '#2e7d32' }}></div>
                        <span>Self-comparison</span>
                    </div>
                </div>
                <p className="legend-note">
                    <strong>Note:</strong> {isAdjPairs
                        ? 'Cells show Combined IAA (0–1). Hover for Link F1, Type Accuracy, and agreed link count.'
                        : 'Higher percentages indicate better agreement on thread assignments.'}
                </p>
            </div>
        </div>
    );
};

export default IAAMatrix; 
