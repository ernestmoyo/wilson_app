-- 010: the lifecycle phases a certified handler is certified for.
--
-- The certified-handler certificate tab lists substances as
-- Name | Classes | Lifecycles. Name and hazard class already live on the
-- substance node (HSLocation → Substance); the lifecycles column did not.
-- Nullable, additive: location jobs never fill it.

ALTER TABLE substance ADD COLUMN IF NOT EXISTS lifecycles text;
