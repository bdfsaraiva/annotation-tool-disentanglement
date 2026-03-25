/**
 * @fileoverview Custom hook for a scroll-to-top button trigger within a scrollable container.
 */
import { useState, useCallback, useEffect } from 'react';

/**
 * Tracks whether the container has been scrolled past a pixel threshold and
 * provides a `scrollToTop` function that smoothly returns it to the top.
 *
 * Intended use: show a "back to top" button when `showScrollToTop` is `true`
 * and call `scrollToTop` when it is clicked.
 *
 * @param {React.RefObject<HTMLElement>} containerRef - Ref to the scrollable element.
 * @param {number} [threshold=300] - Scroll distance (px) after which the button appears.
 * @returns {{ showScrollToTop: boolean, scrollToTop: Function }}
 * - `showScrollToTop` — `true` when the container has scrolled more than `threshold` px.
 * - `scrollToTop` — Smoothly scrolls the container back to the top.
 */
export const useScrollToTop = (containerRef, threshold = 300) => {
  const [showScrollToTop, setShowScrollToTop] = useState(false);

  /** Show the button whenever the user has scrolled past the threshold. */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleScroll = () => {
      setShowScrollToTop(container.scrollTop > threshold);
    };
    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [containerRef, threshold]);

  /**
   * Smoothly scroll the container back to the top.
   * Uses `scrollTo` with `behavior: 'smooth'` for a polished animation.
   */
  const scrollToTop = useCallback(() => {
    if (containerRef.current) {
      containerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [containerRef]);

  return { showScrollToTop, scrollToTop };
};
