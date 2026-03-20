import { useState, useCallback, useRef, useEffect } from 'react';

/**
 * Tracks the vertical center-position of each message element inside a scrollable
 * container. Used by the adjacency-pairs SVG canvas to draw relation lines.
 */
export const useMessagePositions = (containerRef) => {
  const [messagePositions, setMessagePositions] = useState({});
  const [messagesScrollHeight, setMessagesScrollHeight] = useState(0);
  const rafRef = useRef(null);

  const updateMessagePositions = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const nodes = container.querySelectorAll('[data-message-id]');
    const positions = {};
    nodes.forEach((node) => {
      const rect = node.getBoundingClientRect();
      const centerY = rect.top - containerRect.top + rect.height / 2 + container.scrollTop;
      const id = node.getAttribute('data-message-id');
      if (id) positions[id] = centerY;
    });
    setMessagePositions(positions);
    setMessagesScrollHeight(container.scrollHeight);
  }, [containerRef]);

  const requestPositionUpdate = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      updateMessagePositions();
    });
  }, [updateMessagePositions]);

  // Track scroll inside container
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleScroll = () => requestPositionUpdate();
    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [containerRef, requestPositionUpdate]);

  // Track window resize
  useEffect(() => {
    const handleResize = () => requestPositionUpdate();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [requestPositionUpdate]);

  return { messagePositions, messagesScrollHeight, requestPositionUpdate };
};
