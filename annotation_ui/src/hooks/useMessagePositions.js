/**
 * @fileoverview Custom hook for tracking per-message vertical positions within a scrollable container.
 *
 * `useMessagePositions` is used by `AdjacencyRelationsCanvas` to know where to
 * draw the end-points of the curved Bézier relation lines.  Because the
 * container can scroll and the window can resize, positions are kept current by
 * listening to both events and batching the measurement via `requestAnimationFrame`
 * to avoid layout thrashing.
 */
import { useState, useCallback, useRef, useEffect } from 'react';

/**
 * Tracks the vertical center-Y position (relative to the container's scroll-top)
 * of every element inside `containerRef` that carries a `data-message-id` attribute.
 *
 * @param {React.RefObject<HTMLElement>} containerRef - Ref to the scrollable container element.
 * @returns {{
 *   messagePositions: Object.<string, number>,
 *   messagesScrollHeight: number,
 *   requestPositionUpdate: Function
 * }}
 * - `messagePositions` — map of `{[messageId]: centerY}` in container-scroll space.
 * - `messagesScrollHeight` — `scrollHeight` of the container; used by the SVG canvas
 *   to size itself correctly.
 * - `requestPositionUpdate` — call this after programmatic DOM changes (e.g. after
 *   annotations load) to force a re-measurement outside of the scroll/resize events.
 */
export const useMessagePositions = (containerRef) => {
  const [messagePositions, setMessagePositions] = useState({});
  const [messagesScrollHeight, setMessagesScrollHeight] = useState(0);
  /** Stores the pending rAF handle so repeated triggers only fire once per frame. */
  const rafRef = useRef(null);

  /**
   * Measure the center-Y of every `[data-message-id]` element within the container.
   * Center-Y is expressed relative to the container's top edge plus `scrollTop`
   * so that it remains stable as the user scrolls.
   */
  const updateMessagePositions = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const nodes = container.querySelectorAll('[data-message-id]');
    const positions = {};
    nodes.forEach((node) => {
      const rect = node.getBoundingClientRect();
      // Add scrollTop so that the position is in the container's logical coordinate
      // space rather than the viewport, keeping lines stable during scrolling.
      const centerY = rect.top - containerRect.top + rect.height / 2 + container.scrollTop;
      const id = node.getAttribute('data-message-id');
      if (id) positions[id] = centerY;
    });
    setMessagePositions(positions);
    setMessagesScrollHeight(container.scrollHeight);
  }, [containerRef]);

  /**
   * Schedule a position measurement on the next animation frame.
   * Cancels any already-pending measurement to avoid redundant work when
   * scroll events fire in rapid succession.
   */
  const requestPositionUpdate = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      updateMessagePositions();
    });
  }, [updateMessagePositions]);

  /** Re-measure when the container scrolls. */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleScroll = () => requestPositionUpdate();
    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [containerRef, requestPositionUpdate]);

  /** Re-measure when the window resizes (elements may shift). */
  useEffect(() => {
    const handleResize = () => requestPositionUpdate();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [requestPositionUpdate]);

  return { messagePositions, messagesScrollHeight, requestPositionUpdate };
};
