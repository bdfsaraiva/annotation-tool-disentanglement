import React, { useMemo } from 'react';

const LANE_GAP = 14;
const LANE_BASE = 70;

/**
 * Converts adjacency pairs + message positions into positioned line descriptors,
 * assigns non-overlapping lanes, and calculates total canvas width.
 * Call this in the parent component so relationsWidth can be used for CSS variables.
 */
export const buildAdjacencyLines = (adjacencyPairs, messagePositions, relationTypeColors, abbreviateRelationType) => {
  const rawLines = adjacencyPairs.map((pair) => {
    const fromY = messagePositions[String(pair.from_message_id)];
    const toY = messagePositions[String(pair.to_message_id)];
    if (fromY == null || toY == null) return null;
    return {
      id: pair.id,
      fromY,
      toY,
      color: relationTypeColors[pair.relation_type] || '#6B7280',
      label: abbreviateRelationType(pair.relation_type),
    };
  }).filter(Boolean);

  const sorted = [...rawLines].sort((a, b) => {
    const aStart = Math.min(a.fromY, a.toY);
    const bStart = Math.min(b.fromY, b.toY);
    if (aStart !== bStart) return aStart - bStart;
    return Math.max(a.fromY, a.toY) - Math.max(b.fromY, b.toY);
  });

  const laneEnds = [];
  const linesWithLanes = sorted.map((line) => {
    const start = Math.min(line.fromY, line.toY);
    const end = Math.max(line.fromY, line.toY);
    let laneIndex = 0;
    while (laneIndex < laneEnds.length && start <= laneEnds[laneIndex]) laneIndex++;
    if (laneIndex === laneEnds.length) laneEnds.push(end);
    else laneEnds[laneIndex] = end;
    return { ...line, lane: laneIndex };
  });

  const maxLane = laneEnds.length > 0 ? laneEnds.length - 1 : 0;
  const relationsWidth = LANE_BASE + LANE_GAP * (maxLane + 1);
  return { linesWithLanes, relationsWidth, laneGap: LANE_GAP };
};

/**
 * Renders the SVG canvas that shows curved adjacency-pair lines.
 * Expects pre-computed `linesWithLanes` and `relationsWidth` from buildAdjacencyLines().
 */
const AdjacencyRelationsCanvas = ({
  linesWithLanes,
  relationsWidth,
  laneGap,
  messagesScrollHeight,
  selectedRelationId,
  hoveredRelationIds,
  shouldFocusRelations,
  dragSourceMessageId,
  dragHoverMessageId,
  messagePositions,
  onRelationClick,
  onRelationHover,
  onRelationHoverEnd,
  onCanvasClick,
}) => {
  const dragPreviewLine = useMemo(() => {
    if (!dragSourceMessageId || !dragHoverMessageId || dragSourceMessageId === dragHoverMessageId) return null;
    const fromY = messagePositions[String(dragSourceMessageId)];
    const toY = messagePositions[String(dragHoverMessageId)];
    if (fromY == null || toY == null) return null;
    return { fromY, toY, x: relationsWidth - 12 };
  }, [dragSourceMessageId, dragHoverMessageId, messagePositions, relationsWidth]);

  return (
    <div className="relations-column" style={{ width: `${relationsWidth}px` }}>
      <svg
        className="relations-svg"
        width={relationsWidth}
        height={messagesScrollHeight || 0}
        viewBox={`0 0 ${relationsWidth} ${messagesScrollHeight || 0}`}
        onClick={onCanvasClick}
      >
        <defs>
          <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="8" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="currentColor" />
          </marker>
        </defs>

        {linesWithLanes.map((line) => {
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
                onClick={(e) => { e.stopPropagation(); onRelationClick(line.id); }}
                onMouseEnter={() => onRelationHover(line.id)}
                onMouseLeave={onRelationHoverEnd}
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
  );
};

export default AdjacencyRelationsCanvas;
