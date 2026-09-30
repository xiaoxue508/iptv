#ifndef IPTVD_UPLINK_H
#define IPTVD_UPLINK_H
#include "common.h"

/* upstream_interface feature (empty g.upstream_interface = off).
   uplink_ensure() binds our source IP to the interface and programs a
   source-based rule (pref 1000 -> table 1001, single default via the
   interface gateway) so ALL traffic from this app - and from any other app
   bound to the same address, e.g. r2h - leaves via that interface no matter
   the destination. No per-subnet route lists, no external scripts. */
void uplink_ensure(int log_changes);   /* idempotent; start + every ~60s */
const char *uplink_ip(void);           /* current source IP or "" */

#endif
