# Test fixtures

| File | Source |
|---|---|
| `onemap-search-bishan.json`, `onemap-search-postal.json` | **Real** OneMap public search responses, fetched without a token on 2026-11-17 (note the `"error": "Authentication token missing..."` field on a 200). |
| `lta-bus-arrival-v3.json` | **Synthetic**, built from the LTA DataMall user guide's BusArrival v3 format. |
| `lta-train-alerts-disrupted.json`, `lta-train-alerts-normal.json` | **Synthetic**, from the documented TrainServiceAlerts format (assumed shape, verify with a real key). |
| `onemap-revgeocode.json` | **Synthetic**, from the OneMap revgeocode docs (assumed field names, verify with a real token). |
| `onemap-revgeocode-estate.json` | **Synthetic** (QA-73): an estate-only entry first (no block/postal), then two blocks with postal codes (one duplicated). |
| `onemap-route.json` | **Synthetic**, trimmed OpenTripPlanner-style shape; the Worker passes it through byte-for-byte. |
| `lta-facilities-maintenance-v2.json` (also `fixtures/`) | **Synthetic**, in the `v2/FacilitiesMaintenance` shape from the LTA DataMall API guide v6.11 §2.23 (`value[]` of Line, StationCode, StationName, LiftID?, LiftDesc). |
| `../../fixtures/lta-train-alerts-disrupted.json`, `lta-train-alerts-minor.json` | **Synthetic** fixture-mode replies (`?fixture=disrupted|minor`). |
| `recorded/` | Written by `npm run record:lta` (owner-run with the real key, M3 AC 40). Not committed until the owner records them. |
