-- Composite index to serve org-scoped, occurredAt-ordered reads (the recent-100
-- movements list and the live movement tail) with an index seek instead of
-- filtering by organisationId and then sorting a large result set by occurredAt.
CREATE INDEX "StockMovement_organisationId_occurredAt_idx" ON "StockMovement"("organisationId", "occurredAt");
