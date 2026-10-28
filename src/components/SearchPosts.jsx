// src/components/SearchPosts.jsx
import { useState, useMemo, useEffect } from 'react';
import { cardTint } from '../utils/cardTint.js';
import { scoreTier } from '../utils/scoreTier.js';

/**
 * @typedef {{
 *   url: string;
 *   frontmatter?: {
 *     title?: string;
 *     description?: string;
 *     writer?: string;
 *     category?: string | string[];
 *     categories?: string | string[];
 *     thumbnail?: string;
 *     postColor?: string;
 *   };
 *   dateStr?: string;
 *   score?: number | null;
 * }} SearchPost
 */

/** @param {{ posts?: SearchPost[]; limit?: number }} props */
export default function SearchPosts({ posts = /** @type {SearchPost[]} */ ([]), limit = 50 }) {
  // ➊ Seed from URL
  const getInitialQ = () => {
    if (typeof window === 'undefined') return '';
    return new URL(window.location.href).searchParams.get('q') || '';
  };
  const [q, setQ] = useState(getInitialQ().slice(0, 100));

  // ➋ Sync URL bar
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (q) params.set('q', q);
    else params.delete('q');
    const newUrl =
      window.location.pathname +
      (params.toString() ? `?${params.toString()}` : '') +
      window.location.hash;
    window.history.replaceState(null, '', newUrl);
  }, [q]);

  // ➌ Filter & slice (now includes `writer` + categories)
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const scored = posts
      .map((p, idx) => ({ ...p, _idx: idx }))
      .filter((p) => {
        const fm = p.frontmatter || {};
        const title = (fm.title || '').toLowerCase();
        const desc  = (fm.description || '').toLowerCase();
        const writ  = (fm.writer || '').toLowerCase();
        const cats  = normalizeCats(fm).join(' ');
        return (
          !term ||
          title.includes(term) ||
          desc.includes(term) ||
          writ.includes(term) ||
          cats.includes(term)
        );
      })
      .map((p) => {
        const title = (p.frontmatter?.title || '').toLowerCase();
        const titleHit = term && title.includes(term) ? 1 : 0;
        return { ...p, _score: titleHit };
      })
      .sort((a, b) => {
        if (b._score !== a._score) return b._score - a._score;
        return a._idx - b._idx; // preserve original order when scores tie
      })
      .slice(0, limit)
      .map(({ _idx, _score, ...rest }) => rest);
    return scored;
  }, [q, posts, limit]);

  // ➍ Highlight helper disabled (returns plain text)
  const highlightText = (text) => text;

  return (
    <div className="search-container">
      <form
        className="search-form"
        role="search"
        onSubmit={(e) => e.preventDefault()}
      >
        <input
          type="search"
          placeholder="🔎 Search posts…"
          aria-label="Search posts"
          value={q}
          maxLength={100}
          onChange={(e) => setQ(e.currentTarget.value.slice(0, 100))}
          className="search-input"
        />
      </form>

      <div className="search-count">
        Showing {filtered.length} of {posts.length} posts
      </div>

      {/* Same markup as AprilPostCard.astro, so results match the home and Stories cards. */}
      <div className="april-post-grid search-results">
        {filtered.map((p) => {
          const fm = p.frontmatter || {};
          const hasThumb = Boolean(fm.thumbnail);
          const tint = hasThumb ? null : cardTint(fm.postColor);
          return (
            <div
              className={`april-post-card${hasThumb ? '' : ' april-post-card--no-thumb'}${tint ? ' april-post-card--tinted' : ''}`}
              style={tint ? { '--card-tint': tint } : undefined}
              key={p.url}
            >
              <a href={p.url} className={`april-post-card-link${hasThumb ? ' april-post-card-link--overlay' : ''}`}>
                {p.score != null && <ScoreRing score={p.score} />}
                {hasThumb && (
                  <div className="april-post-card-thumb">
                    <img src={fm.thumbnail} alt={fm.title ?? ''} loading="lazy" decoding="async" />
                  </div>
                )}
                <div className="april-post-card-info">
                  <div className="april-post-card-title">{highlightText(fm.title ?? '', q)}</div>
                </div>
              </a>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && <p className="no-results">No results found.</p>}
    </div>
  );
}

/* Helpers */

// The same rating ring as ScoreBadge.astro (styles in scoreBadge.css).
function ScoreRing({ score }) {
  const { text, fill, tier, label } = scoreTier(score);
  return (
    <span className={`score-ring score-ring--${tier}`} style={{ '--fill': fill }} role="img" aria-label={label}>
      <span className="score-ring-value" aria-hidden="true">{text ?? '–'}</span>
      {text && <span className="score-ring-max" aria-hidden="true">/10</span>}
    </span>
  );
}
function normalizeCats(frontmatter) {
  const raw = frontmatter?.category ?? frontmatter?.categories ?? [];
  if (Array.isArray(raw)) return raw.map(String).map((s) => s.toLowerCase());
  if (typeof raw === 'string') return [raw.toLowerCase()];
  return [];
}
