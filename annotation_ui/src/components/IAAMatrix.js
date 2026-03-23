import React from 'react';
import './IAAMatrix.css';

const IAAMatrix = ({ pairwiseAccuracies, annotators, isAdjPairs = false }) => {
    // Create a lookup map for quick access to accuracy scores
    const accuracyMap = new Map();
    pairwiseAccuracies.forEach(pair => {
        const key1 = `${pair.annotator_1_id}-${pair.annotator_2_id}`;
        const key2 = `${pair.annotator_2_id}-${pair.annotator_1_id}`;
        accuracyMap.set(key1, pair);
        accuracyMap.set(key2, pair);
    });

    // Helper function to get accuracy between two annotators
    const getPair = (annotatorId1, annotatorId2) => {
        if (annotatorId1 === annotatorId2) return { accuracy: 100, _self: true };
        return accuracyMap.get(`${annotatorId1}-${annotatorId2}`) || null;
    };

    const getAccuracy = (annotatorId1, annotatorId2) => {
        const pair = getPair(annotatorId1, annotatorId2);
        return pair ? pair.accuracy : null;
    };

    // Color scale: dark enough for white text to be readable
    const getColor = (accuracy) => {
        if (accuracy === null) return 'var(--background-color-tertiary, #f0f0f0)';
        if (accuracy === 100) return '#2e7d32'; // self-cell: solid dark green
        const hue = (accuracy / 100) * 120; // 0=red → 120=green
        return `hsl(${hue}, 65%, 38%)`;
    };

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
