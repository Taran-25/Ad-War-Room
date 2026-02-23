const BOLD_KEYWORDS = [
  'Proven Performer', 'Hook Strength', 'CTA', 'Gap Opportunity',
  'Active Ads', 'Days Running', 'Video Script', 'Unmet Need',
  'Weekly Brief', 'Sentiment', 'Creative Trends', 'Messaging Shift',
  'Threat Level', 'Opportunity', 'Insight', 'Direct', 'Indirect',
];

export function boldify(text) {
  if (!text || typeof text !== 'string') return text;
  let result = text;
  BOLD_KEYWORDS.forEach(keyword => {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'gi');
    result = result.replace(regex, '<strong>$1</strong>');
  });
  return result;
}

export function BoldText({ text, className }) {
  if (!text) return null;
  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: boldify(text) }}
    />
  );
}
