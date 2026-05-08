import React from 'react';

// Accessible sortable table header. Renders a real <th> (preserving its
// columnheader semantics + aria-sort for screen readers) with an inner
// <button type="button"> as the keyboard/click target so activation has
// real button semantics rather than a role override on the cell itself.
//
// Props:
//   onSort   — required, fired on click and Enter/Space (button default).
//   active   — optional, true when this column is the current sort key.
//   direction— optional, 'asc' | 'desc' — current sort direction.
//   ...rest  — any other th props (className, style, title, children, etc.)
export default function SortableTh({
  onSort,
  active = false,
  direction,
  style,
  children,
  ...rest
}) {
  const ariaSort = !active ? 'none' : (direction === 'asc' ? 'ascending' : 'descending');
  return (
    <th
      {...rest}
      aria-sort={ariaSort}
      style={{ cursor: 'pointer', ...style }}
    >
      <button
        type="button"
        onClick={onSort}
        className="sortable-th-button"
        style={{
          background: 'none',
          border: 0,
          padding: 0,
          margin: 0,
          font: 'inherit',
          color: 'inherit',
          cursor: 'pointer',
          textAlign: 'inherit',
          width: '100%',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        {children}
      </button>
    </th>
  );
}
