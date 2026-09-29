#ifndef IPTVD_STATUS_H
#define IPTVD_STATUS_H
#include "common.h"

/* 7-line "/" text page (byte-compatible with srcbox_bridge) */
void status_page(dbuf *out);
/* JSON status (iptvd extension) */
void status_json(dbuf *out);

#endif
