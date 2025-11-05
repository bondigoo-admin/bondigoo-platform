import React from 'react';

const Highlight = ({ text, match }) => {
  if (!match || !text) {
    return <>{text}</>;
  }

  const escapedMatch = match.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escapedMatch})`, 'gi'));

  return (
    <span>
      {parts.map((part, index) =>
        part.toLowerCase() === match.toLowerCase() ? (
          <strong key={index} className="font-bold text-slate-900 bg-amber-200 dark:text-slate-900 dark:bg-amber-400 rounded-sm px-[2px] py-[1px]">
            {part}
          </strong>
        ) : (
          part
        )
      )}
    </span>
  );
};

export default Highlight;