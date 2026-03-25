/**
 * @fileoverview SVG canvas for rendering curved adjacency-pair relation arcs.
 *
 * Exports two items:
 *
 * 1. `buildAdjacencyLines` — a pure function that transforms a flat list of
 *    adjacency-pair records into positioned, lane-assigned line descriptors
 *    ready for SVG rendering.  It is exported separately so the parent
 *    component can obtain `relationsWidth` before the canvas element is
 *    rendered (the width is needed to set a CSS custom property on the
 *    message-list container).
 *
 * 2. `AdjacencyRelationsCanvas` (default export) — an SVG-based component that
 *    consumes the output of `buildAdjacencyLines` and draws cubic Bézier arcs
 *    for each relation.  A dashed grey line is overlaid during an active
 *    drag-and-drop to preview the prospective relation.
 *
 * Lane assignment strategy:
 * Relations are sorted by their topmost Y coordinate, then placed into the
 * first lane whose last-occupied Y is strictly above the current relation's
 * start Y.  This greedy interval-scheduling approach minimises the total number
 * of lanes (and therefore canvas width) without any backtracking.
 *
 * Bézier curve depth:
 * Curve depth is proportional to the vertical span of the relation (35% of
 * span), capped to keep control points inside the SVG viewport.  Short
 * relations appear nearly straight while long ones curve significantly.
 */
import React, { useMemo } from 'react';

/** Horizontal gap in pixels between adjacent relation lanes. */
const LANE_GAP = 14;
/** Minimum canvas width reserved for the rightmost lane position. */
const LANE_BASE = 70;

/**
 * Convert a list of adjacency pairs into pre-computed line descriptors for
 * the SVG canvas.
 *
 * @param {Object[]} adjacencyPairs - Array of pair records from the API.
 * @param {number} adjacencyPairs[].id - Unique pair ID.
 * @param {number} adjacencyPairs[].from_message_id - SPP message ID.
 * @param {number} adjacencyPairs[].to_message_id - FPP message ID.
 * @param {string} adjacencyPairs[].relation_type - Relation label string.
 * @param {Object.<string, number>} messagePositions - Map of `{messageId: centerY}`
 *   in container-scroll space, produced by `useMessagePositions`.
 * @param {Object.<string, string>} relationTypeColors - Map of
 *   `{relationType: cssColour}` used to colour the arc.
 * @param {Function} abbreviateRelationType - Function from relation-type string
 *   to a short display label rendered on hover/selection.
 * @returns {{
 *   linesWithLanes: Array<Object>,
 *   relationsWidth: number,
 *   laneGap: number
 * }}
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
 * SVG canvas that renders curved Bézier arcs for adjacency-pair relations.
 *
 * Consumes pre-computed `linesWithLanes` from `buildAdjacencyLines` so the
 * lane layout is stable across re-renders that don't change the data.  The
 * SVG height tracks `messagesScrollHeight` so arcs drawn to messages near the
 * bottom of a long conversation are not clipped.
 *
 * @param {Object} props
 * @param {Array<Object>} props.linesWithLanes - Line descriptors from
 *   `buildAdjacencyLines`, each with `{ id, fromY, toY, color, label, lane }`.
 * @param {number} props.relationsWidth - Total pixel width of the SVG canvas.
 * @param {number} props.laneGap - Horizontal gap between lanes (passed through
 *   from `buildAdjacencyLines` so the `x` calculation is consistent).
 * @param {number} props.messagesScrollHeight - `scrollHeight` of the message
 *   container; used as the SVG `height` attribute.
 * @param {number|null} props.selectedRelationId - ID of the currently selected
 *   relation; its arc is rendered thicker and always shows a label.
 * @param {Set<number>} props.hoveredRelationIds - Set of IDs that are hovered
 *   (e.g., when hovering a message bubble that participates in relations).
 * @param {boolean} props.shouldFocusRelations - When `true`, arcs in
 *   `hoveredRelationIds` receive the `focused` class and show their label.
 * @param {number|null} props.dragSourceMessageId - Message ID currently being
 *   dragged; used to draw the dashed preview arc.
 * @param {number|null} props.dragHoverMessageId - Message ID currently under
 *   the drag pointer; forms the other end of the preview arc.
 * @param {Object.<string, number>} props.messagePositions - Center-Y map for
 *   resolving the preview arc endpoints.
 * @param {Function} props.onRelationClick - Called with a relation `id` when
 *   an arc is clicked.
 * @param {Function} props.onRelationHover - Called with a relation `id` on
 *   mouse-enter.
 * @param {Function} props.onRelationHoverEnd - Called on mouse-leave.
 * @param {Function} props.onCanvasClick - Called when the SVG background is
 *   clicked (used to deselect the current relation).
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
          // Curvatura proporcional ao span: ligações próximas ficam quase retas,
          // ligações longas curvam progressivamente. Cap em 80% de x para não
          // sair fora do SVG.
          const span = Math.abs(line.toY - line.fromY);
          // Curve depth scales with the span so short relations stay nearly
          // straight while long ones bow outward.  The cap at (x − 4) prevents
          // control points from overflowing the left edge of the SVG viewport.
          const curveDepth = Math.min(x - 4, span * 0.35);
          const curveOut = x - curveDepth;
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
