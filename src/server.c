#include "server.h"
#include "cache.h"
#include "catchup.h"
#include "common.h"
#include "epgxml.h"
#include "platform.h"
#include "playlist.h"
#include "status.h"
#include "uplink.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>
#include <errno.h>
#include <pthread.h>
#include <unistd.h>
#include <sys/stat.h>
#include <sys/socket.h>
#include <sys/time.h>
#include <netinet/in.h>

#ifndef IPTVD_VERSION
#define IPTVD_VERSION "0.1.0"
#endif

/* ---------------- low level ---------------- */

static int write_all(int fd, const void *d, size_t n)
{
    const char *p = d;
    while (n) {
        ssize_t w = send(fd, p, n, 0);
        if (w <= 0) return -1;
        p += w;
        n -= (size_t)w;
    }
    return 0;
}

static const char *reason(int code)
{
    switch (code) {
    case 200: return "OK";
    case 302: return "Found";
    case 400: return "Bad Request";
    case 403: return "Forbidden";
    case 404: return "Not Found";
    case 500: return "Internal Server Error";
    case 501: return "Unsupported method";
    case 502: return "Bad Gateway";
    case 503: return "Service Unavailable";
    default:  return "Error";
    }
}

static void send_resp(int fd, int code, const char *ctype, const dbuf *body,
                      int head, const char *hdr_extra)
{
    dbuf h;
    dbuf_init(&h);
    dbuf_addf(&h, "HTTP/1.1 %d %s\r\nContent-Type: %s\r\nContent-Length: %zu\r\n",
              code, reason(code), ctype, body->len);
    if (hdr_extra) dbuf_add(&h, hdr_extra);
    dbuf_add(&h, "Connection: close\r\n\r\n");
    write_all(fd, h.p ? h.p : "", h.len);
    if (!head && body->len) write_all(fd, body->p, body->len);
    dbuf_free(&h);
}

/* ---------------- query parsing (urllib.parse.parse_qs first value) -------- */

static char *unquote_plus(const char *v, size_t n)
{
    char *o = xmalloc(n + 1);
    size_t k = 0;
    for (size_t i = 0; i < n; i++) {
        if (v[i] == '+') {
            o[k++] = ' ';
        } else if (v[i] == '%' && i + 2 < n &&
                   isxdigit((unsigned char)v[i + 1]) &&
                   isxdigit((unsigned char)v[i + 2])) {
            char hx[3] = { v[i + 1], v[i + 2], 0 };
            o[k++] = (char)strtol(hx, NULL, 16);
            i += 2;
        } else {
            o[k++] = v[i];
        }
    }
    o[k] = 0;
    return o;
}

static char *qget(const char *query, const char *key)
{
    if (!query) return NULL;
    size_t klen = strlen(key);
    const char *p = query;
    while (*p) {
        const char *amp = strchr(p, '&');
        size_t seg = amp ? (size_t)(amp - p) : strlen(p);
        const char *eq = seg ? memchr(p, '=', seg) : NULL;
        size_t k2 = eq ? (size_t)(eq - p) : seg;
        if (k2 == klen && !memcmp(p, key, klen)) {
            if (!eq) return xstrdup("");
            return unquote_plus(eq + 1, seg - k2 - 1);
        }
        if (!amp) break;
        p = amp + 1;
    }
    return NULL;
}

/* ---------------- routing (srcbox_bridge.Handler.route) ------------------- */

static void route(int fd, int head, const char *path, const char *query,
                  int loopback)
{
    dbuf body;
    dbuf_init(&body);
    int code = 200;
    const char *ctype = "text/plain; charset=utf-8";
    dbuf extra;
    dbuf_init(&extra);

    if (!strcmp(path, "/") || !strcmp(path, "/status")) {
        status_page(&body);
    } else if (!strcmp(path, "/status.json")) {
        status_json(&body);
        ctype = "application/json; charset=utf-8";
    } else if (!strcmp(path, "/playlist.m3u")) {
        int nm = 0, nf = 0, nu = 0;
        ctype = "audio/x-mpegurl";
        if (playlist_build(1, &body, &nm, &nf, &nu) != 0) code = 500;
    } else if (!strcmp(path, "/full.m3u")) {
        int nm = 0, nf = 0, nu = 0;
        ctype = "audio/x-mpegurl";
        if (playlist_build(0, &body, &nm, &nf, &nu) != 0) code = 500;
    } else if (!strcmp(path, "/epg.xml")) {
        if (!epgxml_ready()) {
            logmsg("epg.xml requested before first build, waiting...");
            epgxml_wait_ready(g.xmltv_wait_s);
        }
        size_t len;
        char *data = read_file(g.epg_file, &len);
        if (!data) {
            code = 503;
            dbuf_add(&body, "EPG building, retry in a moment");
        } else {
            dbuf_addn(&body, data, len);
            free(data);
            ctype = "application/x-mpegtv+xml";
        }
    } else if (!strcmp(path, "/c")) {
        char *ch = qget(query, "ch");
        char *s = qget(query, "s");
        char *u = qget(query, "u");
        dbuf redir;
        dbuf_init(&redir);
        char err[2048];
        err[0] = 0;
        code = catchup_handle(ch, s, u, &redir, err, sizeof err);
        if (code == 200) {
            code = 302;
            dbuf_add(&body, "redirect");
            dbuf_addf(&extra, "Location: %s\r\nCache-Control: no-store\r\n",
                      redir.p ? redir.p : "");
        } else {
            dbuf_add(&body, err);
        }
        dbuf_free(&redir);
        free(ch);
        free(s);
        free(u);
    } else if (!strcmp(path, "/api")) {
        /* local control endpoint for luci-app-iptvd (loopback only) */
        ctype = "application/json; charset=utf-8";
        if (!loopback) {
            code = 403;
            dbuf_add(&body, "{\"ok\":0,\"error\":\"loopback only\"}");
        } else {
            char *act = qget(query, "action");
            if (!act) {
                code = 400;
                dbuf_add(&body, "{\"ok\":0,\"error\":\"missing action\"}");
            } else if (!strcmp(act, "relogin")) {
                int rc = cache_ensure_session();
                dbuf_addf(&body, "{\"ok\":%d}", rc == 0 ? 1 : 0);
            } else if (!strcmp(act, "refresh")) {
                int rc = cache_refresh_channels(1);
                dbuf_addf(&body, "{\"ok\":%d}", rc == 1 ? 1 : 0);
            } else if (!strcmp(act, "epg")) {
                epgxml_kick();
                dbuf_add(&body, "{\"ok\":1,\"accepted\":1}");
            } else {
                code = 400;
                dbuf_add(&body, "{\"ok\":0,\"error\":\"unknown action\"}");
            }
            free(act);
        }
    } else {
        code = 404;
        dbuf_add(&body, "not found");
    }

    send_resp(fd, code, ctype, &body, head, extra.len ? extra.p : NULL);
    dbuf_free(&body);
    dbuf_free(&extra);
}

/* ---------------- connection handling ---------------- */

static int read_request(int fd, char *buf, size_t cap)
{
    size_t n = 0;
    buf[0] = 0;
    while (n + 1 < cap) {
        ssize_t r = recv(fd, buf + n, cap - 1 - n, 0);
        if (r <= 0) break;
        n += (size_t)r;
        buf[n] = 0;
        if (strstr(buf, "\r\n\r\n") || strstr(buf, "\n\n")) break;
    }
    return (int)n;
}

static int conn_is_loopback(int fd)
{
    struct sockaddr_in sa;
    socklen_t sl = sizeof sa;
    if (getpeername(fd, (struct sockaddr *)&sa, &sl) != 0) return 0;
    return sa.sin_family == AF_INET &&
           ntohl(sa.sin_addr.s_addr) == INADDR_LOOPBACK;
}

static void handle_conn(int fd)
{
    char buf[8192];
    if (read_request(fd, buf, sizeof buf) <= 0) return;

    char *sp1 = strchr(buf, ' ');
    if (!sp1) return;
    char *target = sp1 + 1;
    char *sp2 = strchr(target, ' ');
    if (!sp2) return;
    *sp2 = 0;

    char *qm = strchr(target, '?');
    const char *query = NULL;
    if (qm) { *qm = 0; query = qm + 1; }

    int head;
    if (!strncmp(buf, "GET ", 4)) head = 0;
    else if (!strncmp(buf, "HEAD ", 5)) head = 1;
    else {
        dbuf b;
        dbuf_init(&b);
        dbuf_add(&b, "Unsupported method");
        send_resp(fd, 501, "text/plain; charset=utf-8", &b, 0, NULL);
        dbuf_free(&b);
        return;
    }
    route(fd, head, target, query, conn_is_loopback(fd));
}

static void *conn_thread(void *arg)
{
    int fd = (int)(intptr_t)arg;
    handle_conn(fd);
    close(fd);
    return NULL;
}

/* ---------------- background workers ---------------- */

static void *epg_thread(void *arg)
{
    (void)arg;
    epgxml_worker_loop();
    return NULL;
}

static void *channels_thread(void *arg)
{
    (void)arg;
    for (;;) {
        cache_refresh_channels(0);
        sleep(g.worker_s > 0 ? g.worker_s : 120);
    }
    return NULL;
}

/* re-programs uplink rule/table; the ISP can swap the DHCP gateway or the
   whole address block at any time (100.72.x -> 10.156.17.x -> 10.156.22.x) */
static void *uplink_thread(void *arg)
{
    (void)arg;
    for (;;) {
        sleep(60);
        uplink_ensure(1);
    }
    return NULL;
}

/* keepalive (was /root/iptv_ka.sh on a 1-min cron): ping the uplink gateway
   from the bound source.  ping -c3 all-lost = 1 failure, KA_THRESHOLD
   consecutive failures (~3 min) -> bounce the logical interface once.
   Success resets; an address/gateway change (DHCP) invalidates the counter.
   No evidence snapshot: logmsg only (syslog/logread is the fallback). */
#define KA_THRESHOLD 3

static int ka_ping(const char *src, const char *dst, int count)
{
    char cmd[160];
    snprintf(cmd, sizeof cmd, "ping -c%d -W1 -I %s %s >/dev/null 2>&1",
             count, src, dst);
    return system(cmd) == 0;
}

static void *ka_thread(void *arg)
{
    (void)arg;
    int fails = 0, idle_logged = 0;
    char last_src[32] = "", last_gw[32] = "";
    for (;;) {
        sleep(60);
        const char *src = uplink_ip();
        char gw[32];
        if (!src[0] || uplink_gw(gw, sizeof gw) != 0) {
            if (!idle_logged) {
                idle_logged = 1;
                logmsg("ka: no uplink addr/gw, keepalive idle");
            }
            fails = 0;
            last_src[0] = last_gw[0] = 0;
            continue;
        }
        idle_logged = 0;
        if (strcmp(last_src, src) || strcmp(last_gw, gw)) {
            snprintf(last_src, sizeof last_src, "%s", src);
            snprintf(last_gw, sizeof last_gw, "%s", gw);
            fails = 0;
        }
        if (ka_ping(src, gw, 3)) {
            fails = 0;
            continue;
        }
        if (++fails < KA_THRESHOLD) {
            logmsg("ka: gw ping lost %d/%d, no bounce yet", fails, KA_THRESHOLD);
            continue;
        }
        fails = 0;
        if (!g.bounce_iface[0] || !uplink_dev_ok(g.bounce_iface)) {
            logmsg("ka: gw ping lost %d consecutive times, bounce_iface '%s' "
                   "invalid, not bouncing", KA_THRESHOLD, g.bounce_iface);
            continue;
        }
        logmsg("ka: gw ping lost %d consecutive times, bouncing %s",
               KA_THRESHOLD, g.bounce_iface);
        char cmd[80];
        snprintf(cmd, sizeof cmd, "ifdown %s", g.bounce_iface);
        system(cmd);
        sleep(1);
        snprintf(cmd, sizeof cmd, "ifup %s", g.bounce_iface);
        system(cmd);
        sleep(7);
        uplink_ensure(1);
        src = uplink_ip();
        if (!src[0] || uplink_gw(gw, sizeof gw) != 0) {
            logmsg("ka: bounce done, uplink addr/gw not back yet (dhcp pending)");
            continue;
        }
        snprintf(last_src, sizeof last_src, "%s", src);
        snprintf(last_gw, sizeof last_gw, "%s", gw);
        if (ka_ping(src, gw, 2))
            logmsg("ka: bounce ok, gw %s reachable from %s", gw, src);
        else
            logmsg("ka: bounce failed, gw %s still unreachable", gw);
    }
    return NULL;
}

/* ---------------- main loop ---------------- */

int server_run(void)
{
    mkdir_p(g.cache_dir);
    mkdir_p(g.data_dir);
    status_init();
    cache_load_disk();
    plat_load_session(g.session);

    {
        struct stat st;
        if (stat(g.epg_file, &st) == 0) epgxml_mark_ready();
    }

    pthread_t t1, t2;
    if (pthread_create(&t1, NULL, epg_thread, NULL) == 0) pthread_detach(t1);
    if (pthread_create(&t2, NULL, channels_thread, NULL) == 0) pthread_detach(t2);
    {
        pthread_t t3;
        if (pthread_create(&t3, NULL, uplink_thread, NULL) == 0) pthread_detach(t3);
    }
    {
        pthread_t t4;
        if (pthread_create(&t4, NULL, ka_thread, NULL) == 0) pthread_detach(t4);
    }

    logmsg("srcbox_bridge on :%d (epg=%s, channels ttl=%ds)",
           g.port, g.epg_file, g.ttl_channels);

    int ls = socket(AF_INET, SOCK_STREAM, 0);
    if (ls < 0) { logmsg("socket: %s", strerror(errno)); return -1; }
    int on = 1;
    setsockopt(ls, SOL_SOCKET, SO_REUSEADDR, &on, sizeof on);
    struct sockaddr_in sa;
    memset(&sa, 0, sizeof sa);
    sa.sin_family = AF_INET;
    sa.sin_addr.s_addr = htonl(INADDR_ANY);
    sa.sin_port = htons((unsigned short)g.port);
    if (bind(ls, (struct sockaddr *)&sa, sizeof sa) != 0) {
        logmsg("bind :%d failed: %s", g.port, strerror(errno));
        close(ls);
        return -1;
    }
    listen(ls, 16);

    for (;;) {
        int fd = accept(ls, NULL, NULL);
        if (fd < 0) {
            if (errno == EINTR) continue;
            logmsg("accept: %s", strerror(errno));
            continue;
        }
        struct timeval tv = { 10, 0 };
        setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof tv);
        setsockopt(fd, SOL_SOCKET, SO_SNDTIMEO, &tv, sizeof tv);
        pthread_t th;
        if (pthread_create(&th, NULL, conn_thread, (void *)(intptr_t)fd) == 0)
            pthread_detach(th);
        else {
            handle_conn(fd);
            close(fd);
        }
    }
}
