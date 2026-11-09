import { useRef, type TouchEvent } from "react";

export function useSwipeNavigation(onPrevious: () => void, onNext: () => void) {
  const start = useRef<{ x: number; y: number } | null>(null);

  function onTouchStart(event: TouchEvent) {
    if (event.touches.length !== 1) { start.current = null; return; }
    start.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
  }

  function onTouchEnd(event: TouchEvent) {
    if (!start.current || event.changedTouches.length !== 1) return;
    const deltaX = event.changedTouches[0].clientX - start.current.x;
    const deltaY = event.changedTouches[0].clientY - start.current.y;
    start.current = null;
    if (Math.abs(deltaX) < 55 || Math.abs(deltaX) < Math.abs(deltaY) * 1.35) return;
    if (deltaX > 0) onPrevious();
    else onNext();
  }

  return { onTouchStart, onTouchEnd, onTouchCancel: () => { start.current = null; } };
}
