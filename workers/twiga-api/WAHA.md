# WAHA integration retired

TWIGA no longer uses WAHA. The WAHA routes, webhook handlers, business-session database schema and dashboard QR/pairing interface have been removed from the active TWIGA Worker and application.

The supported social-media connection and publishing gateway is Chat33. See [CHAT33.md](./CHAT33.md).

This repository change cannot stop or delete any WAHA container that may already exist in a Cloudflare account outside this repository. After the new release is deployed and verified, remove any old WAHA container, database, public hostname and unused `WAHA_BASE_URL` / `WAHA_API_KEY` Worker secrets manually. Do not delete a resource that is still shared by another application.
