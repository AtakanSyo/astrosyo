import { Pause, Play } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { trackEvent } from '../../../lib/analytics/trackEvent.js';

export default function SimStage({
  id,
  aspect = '16 / 9',
  containerRef,
  canvasRef,
  paused,
  onToggle,
  showPause = true,
  extraControls = null,
  autoplayOnView = true,
  autoplayThreshold = 0.25,
  className = '',
  style = {},
  children = null,
}) {
  const hasControls = showPause || extraControls;
  const stageClass = className ? `sim-stage centered_flex ${className}` : 'sim-stage centered_flex';
  const hasAutoPlayedRef = useRef(false);
  const hasEverPlayedRef = useRef(false);

  useEffect(() => {
    if (!paused) hasEverPlayedRef.current = true;
  }, [paused]);

  useEffect(() => {
    if (!autoplayOnView) return undefined;
    if (!containerRef?.current) return undefined;
    if (hasAutoPlayedRef.current) return undefined;
    // Only autoplay on first entry, never after a user has started/paused manually.
    if (hasEverPlayedRef.current) return undefined;
    if (!paused) return undefined;
    if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') return undefined;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return undefined;

    const el = containerRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        if (hasAutoPlayedRef.current) return;

        if (paused && typeof onToggle === 'function') {
          hasAutoPlayedRef.current = true;
          observer.disconnect();
          onToggle();
        }
      },
      { threshold: autoplayThreshold },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [autoplayOnView, autoplayThreshold, containerRef, onToggle, paused]);

	const handleClick = () => {
	  trackEvent(paused ? `sim-${id}-play` : `sim-${id}-pause`);

  onToggle?.();
};

  return (
    <div
      className={stageClass}
      id={`stage-${id}`}
      ref={containerRef}
      style={{ aspectRatio: aspect, width: '100%', ...style }}
    >
      <canvas id={id} ref={canvasRef} />

      {hasControls && (
        <div className="sim-controls-row centered_flex">
          {showPause && (
            <button
              id={`pause-${id}`}
              className="pill sim-controls-inline"
              type="button"
              aria-pressed={!paused}
              onClick={handleClick}
            >
              {paused ? (
                <Play size={16} strokeWidth={1.8} aria-hidden="true" />
              ) : (
                <Pause size={16} strokeWidth={1.8} aria-hidden="true" />
              )}
            </button>
          )}
        </div>
      )}
      <div className="sim-controls-row-2">
        {extraControls}
      </div>

      {children}
    </div>
  );
}
