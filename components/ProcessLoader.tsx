import React from 'react';

const DOTS = 8;

/** Teal center-and-dots loader shown while a month’s crop area is loading. */
const ProcessLoader: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <div
      className={`process-loader relative h-[72px] w-[72px] ${className}`}
      role="status"
      aria-label="Processing"
    >
      <span className="process-loader-core absolute left-1/2 top-1/2 h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full" />
      {Array.from({ length: DOTS }, (_, index) => (
        <span
          key={index}
          className="process-loader-orbit absolute left-1/2 top-1/2 h-3.5 w-3.5"
          style={{
            transform: `translate(-50%, -50%) rotate(${index * (360 / DOTS)}deg) translateY(-28px)`,
          }}
        >
          <span
            className="process-loader-dot block h-3.5 w-3.5 rounded-full bg-[#0f9f8f]"
            style={{ animationDelay: `${index * 0.12}s` }}
          />
        </span>
      ))}
    </div>
  );
};

export default ProcessLoader;
