DELETE FROM events
WHERE card_id IN (
  SELECT id
  FROM cards
  WHERE owner IN ('system', 'bootstrap')
    AND title IN (
      'Wire admin allowlists',
      'Crabbox manual attach path',
      'Review stale PR recovery',
      'Live API smoke',
      'Unique token API smoke',
      'Post-fix API smoke',
      'Ship smoke test'
    )
);

DELETE FROM cards
WHERE owner IN ('system', 'bootstrap')
  AND title IN (
    'Wire admin allowlists',
    'Crabbox manual attach path',
    'Review stale PR recovery',
    'Live API smoke',
    'Unique token API smoke',
    'Post-fix API smoke',
    'Ship smoke test'
  );
