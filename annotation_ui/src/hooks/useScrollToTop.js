import { useState, useCallback, useEffect } from 'react';

/**
 * Tracks whether the container has been scrolled past a threshold and
 * provides a scroll-to-top function.
 */
export const useScrollToTop = (containerRef, threshold = 300) => {
  const [showScrollToTop, setShowScrollToTop] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleScroll = () => {
      setShowScrollToTop(container.scrollTop > threshold);
    };
    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [containerRef, threshold]);

  const scrollToTop = useCallback(() => {
    if (containerRef.current) {
      containerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [containerRef]);

  return { showScrollToTop, scrollToTop };
};
