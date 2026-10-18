// Aggregate in PostgreSQL: no requester, assignee, description or comment data
// leaves the database. One statement gives totals/breakdowns the same snapshot.
const SUMMARY_SQL = `
  WITH grouped AS (
    SELECT r.status, c.name AS category, COUNT(*)::int AS count,
      COUNT(*) FILTER (WHERE r.status NOT IN ('resolved','closed','rejected')
        AND r.target_resolution_date < (CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Johannesburg')::date)::int AS overdue
    FROM service_requests r JOIN categories c ON c.id=r.category_id
    GROUP BY r.status, c.name
  ), status_counts AS (
    SELECT status, SUM(count)::int AS count FROM grouped GROUP BY status
  ), category_counts AS (
    SELECT category, SUM(count)::int AS count FROM grouped GROUP BY category
  )
  SELECT json_build_object(
    'open', COALESCE(SUM(count) FILTER (WHERE status NOT IN ('resolved','closed','rejected')),0)::int,
    'overdue', COALESCE(SUM(overdue),0)::int,
    'completed', COALESCE(SUM(count) FILTER (WHERE status IN ('resolved','closed')),0)::int,
    'byStatus', COALESCE((SELECT json_agg(json_build_object('status',status,'count',count)
      ORDER BY array_position(ARRAY['submitted','accepted','assigned','in_progress','on_hold','resolved','closed','rejected'],status))
      FROM status_counts),'[]'::json),
    'byCategory', COALESCE((SELECT json_agg(json_build_object('category',category,'count',count)
      ORDER BY category) FROM category_counts),'[]'::json)
  ) AS summary FROM grouped
`;
module.exports = { SUMMARY_SQL };
