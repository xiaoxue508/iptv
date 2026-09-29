#include "common.h"
#include "gbk.h"
#include "json.h"
#include "platform.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define IPTVD_VERSION "0.1.0"

static void usage(void)
{
    fputs(
        "usage: iptvd [global opts] <command> [opts]\n"
        "\n"
        "commands:\n"
        "  login       run EPG login, save session file\n"
        "  channels    fetch channel table -> channels.json\n"
        "  programs    catchup program list for channel/date\n"
        "  tvod        TVOD catchup -> rtsp url\n"
        "  live-sdp    live SDP url for a channel\n"
        "  playlist    build full M3U playlist\n"
        "  epg         build XMLTV EPG file\n"
        "  serve       run HTTP daemon (/status, playlist, epg, ...)\n"
        "  status      print status lines (daemon state)\n"
        "  sign        print Authenticator hex for a challenge\n"
        "  selftest    offline golden vectors (CI)\n"
        "\n"
        "global opts:\n"
        "  --config PATH    config file (default /etc/iptvd.conf)\n"
        "  --session PATH   session json path\n"
        "  --eas HOST       EAS host\n"
        "  --epg HOST       EPG host or base url\n"
        "  --userid ID      STB userid\n"
        "  --stbid ID       STB stbid\n"
        "  --stbip IP       STB ip\n"
        "  --data-dir DIR   persistent dir (/etc/iptvd)\n"
        "  --cache-dir DIR  volatile dir (/tmp/iptvd)\n"
        "  --port N         listen port\n"
        "  --version        print version\n",
        stdout);
}

static const char *optval(int argc, char **argv, int *i)
{
    if (*i + 1 >= argc) {
        fprintf(stderr, "%s: missing value\n", argv[*i]);
        exit(2);
    }
    return argv[++(*i)];
}

/* ---------------- selftest (port-spec T1/T2 golden vectors) ------------- */

static int fail(const char *name, const char *got, const char *want)
{
    fprintf(stderr, "FAIL %s\n  got  %s\n  want %s\n", name,
            got && *got ? got : "(empty)", want);
    return 1;
}

static int selftest(void)
{
    static const struct {
        const char *ch, *rnd, *want;
    } vec[] = {
        { "d41d8cd98f00b204e9800998ecf8427e", "12345678",
          "FFF971A50D2B1FB93708C8B175ADA4812585188CD0347261DF62FA22550F902D"
          "4E4D4FBDA0448D896654E67511807CE5A37B36D0543643915C475F3CED401439"
          "566C72EDB3B6156A7696ED90920BFD45F7BEBE133111C7AF9A00DCC97A1EB23C"
          "56EF5944658B38BFCD7286C8716F9A5BDABDDCFA033C48F9" },
        { "0123456789ABCDEF", "00000000",
          "DBEFF291C6F9F336DBA56F4C3E313014C36BFAAAC972A746627A663504958FC5"
          "A37B36D0543643915C475F3CED401439566C72EDB3B6156A7696ED90920BFD45"
          "F7BEBE133111C7AF9A00DCC97A1EB23C56EF5944658B38BFCD7286C8716F9A5B"
          "DABDDCFA033C48F9" },
        { "X", "00000000",
          "DBEFF291C6F9F336A46CF3AAA6F601CEA86ADCB22E8A904520956AF9BB50E299"
          "F17CF5328ECFA05FC69D1F33C6E26844A10A8645A3A9529A67A2D683503EB458"
          "7747AA5DE3D5C653FD612A6794BFCC7F481F6E5683E60014" },
    };
    int rc = 0;

    conf_defaults();
    conf_resolve_paths();

    for (size_t i = 0; i < sizeof vec / sizeof *vec; i++) {
        char name[32], *got = plat_sign(vec[i].ch, vec[i].rnd);
        snprintf(name, sizeof name, "sign[%zu]", i);
        if (strcmp(got, vec[i].want)) rc |= fail(name, got, vec[i].want);
        else printf("ok   %s (%zu hex)\n", name, strlen(got));
        free(got);
    }

    if (strcmp(g.stbmac_plain, "6CEFC689337E"))
        rc |= fail("stbmac_plain", g.stbmac_plain, "6CEFC689337E");
    else
        puts("ok   stbmac_plain");

    {   /* GBK strict decode */
        static const unsigned char gz[] = { 0xD6, 0xD0 };   /* GBK "中" */
        dbuf b;
        dbuf_init(&b);
        gbk_to_utf8(gz, sizeof gz, &b);
        if (b.len != 3 || memcmp(b.p, "\xE4\xB8\xAD", 3))
            rc |= fail("gbk_to_utf8", b.p, "中");
        else
            puts("ok   gbk_to_utf8");
        dbuf_free(&b);
    }

    {   /* fix_encoding fallback chain: gbk -> utf-8 */
        static const unsigned char raw[] = { 0xD6, 0xD0, 0xCE, 0xC4 };  /* 中文 */
        dbuf b;
        dbuf_init(&b);
        fix_encoding(raw, sizeof raw, NULL, &b);
        if (b.len != 6 || memcmp(b.p, "\xE4\xB8\xAD\xE6\x96\x87", 6))
            rc |= fail("fix_encoding", b.p, "中文");
        else
            puts("ok   fix_encoding");
        dbuf_free(&b);
    }

    {   /* json dump == python json.dumps(..., ensure_ascii=False, indent=1) */
        jv *o = jobj();
        char *s;
        const char *want = "{\n \"a\": 1,\n \"b\": \"中\"\n}";
        jobj_set(o, "a", jnum("1"));
        jobj_set(o, "b", jstr("中"));
        s = json_dump_str(o, 1);
        jv_free(o);
        if (strcmp(s, want)) rc |= fail("json_dump", s, want);
        else
            puts("ok   json_dump indent=1");
        free(s);
    }

    {   /* quote_plus */
        char *s = urlenc("a b+c/d");
        if (strcmp(s, "a+b%2Bc%2Fd")) rc |= fail("urlenc", s, "a+b%2Bc%2Fd");
        else
            puts("ok   urlenc quote_plus");
        free(s);
    }

    {   /* fixed UTC+8 time helpers */
        time_t t = 1759200000;
        struct tm tm8;
        gm8(t, &tm8);
        if (mk8(&tm8) != t) rc |= fail("gm8/mk8", "roundtrip", "identity");
        else
            puts("ok   gm8/mk8 roundtrip");
        gm8(0, &tm8);
        if (tm8.tm_hour != 8) rc |= fail("gm8(0).hour", "not 8", "8");
        else
            puts("ok   gm8 utc+8 offset");
    }

    if (rc) fprintf(stderr, "selftest FAILED\n");
    else printf("selftest all passed\n");
    return rc;
}

/* ------------------------- sign subcommand ------------------------------ */

static int cmd_sign(int argc, char **argv)
{
    const char *ch = NULL, *rnd = NULL;
    for (int i = 0; i < argc; i++) {
        if (!strcmp(argv[i], "--challenge")) ch = optval(argc, argv, &i);
        else if (!strcmp(argv[i], "--rnd")) rnd = optval(argc, argv, &i);
        else {
            fprintf(stderr, "sign: unknown argument %s\n", argv[i]);
            return 2;
        }
    }
    if (!ch) {
        fprintf(stderr, "sign: --challenge required\n");
        return 2;
    }
    char *hex = plat_sign(ch, rnd);
    puts(hex);
    free(hex);
    return 0;
}

/* ------------------------------------------------------------------------ */

int main(int argc, char **argv)
{
    const char *config = "/etc/iptvd.conf";
    const char *cmd = NULL;
    int i;

    conf_defaults();

    for (i = 1; i < argc; i++) {
        const char *a = argv[i];
        if (a[0] != '-') { cmd = a; i++; break; }
        if (!strcmp(a, "--version")) { printf("iptvd " IPTVD_VERSION "\n"); return 0; }
        if (!strcmp(a, "-h") || !strcmp(a, "--help")) { usage(); return 0; }
        if (!strcmp(a, "--config")) { config = optval(argc, argv, &i); continue; }
        if (!strcmp(a, "--session")) { snprintf(g.session, sizeof g.session, "%s", optval(argc, argv, &i)); continue; }
        if (!strcmp(a, "--eas")) { snprintf(g.eas_host, sizeof g.eas_host, "%s", optval(argc, argv, &i)); continue; }
        if (!strcmp(a, "--epg")) { snprintf(g.epg_host, sizeof g.epg_host, "%s", optval(argc, argv, &i)); continue; }
        if (!strcmp(a, "--userid")) { snprintf(g.userid, sizeof g.userid, "%s", optval(argc, argv, &i)); continue; }
        if (!strcmp(a, "--stbid")) { snprintf(g.stbid, sizeof g.stbid, "%s", optval(argc, argv, &i)); continue; }
        if (!strcmp(a, "--stbip")) { snprintf(g.stbip, sizeof g.stbip, "%s", optval(argc, argv, &i)); continue; }
        if (!strcmp(a, "--data-dir")) { snprintf(g.data_dir, sizeof g.data_dir, "%s", optval(argc, argv, &i)); continue; }
        if (!strcmp(a, "--cache-dir")) { snprintf(g.cache_dir, sizeof g.cache_dir, "%s", optval(argc, argv, &i)); continue; }
        if (!strcmp(a, "--port")) { g.port = atoi(optval(argc, argv, &i)); continue; }
        fprintf(stderr, "unknown option: %s\n", a);
        usage();
        return 2;
    }

    if (!cmd) { usage(); return 2; }

    int offline = !strcmp(cmd, "selftest") || !strcmp(cmd, "sign");

    if (!offline) {
        if (conf_load(config) < 0 && strcmp(config, "/etc/iptvd.conf"))
            logmsg("warning: cannot read %s, using defaults", config);
    }
    conf_resolve_paths();

    if (!strcmp(cmd, "selftest")) return selftest();
    if (!strcmp(cmd, "sign")) return cmd_sign(argc - i, argv + i);

    fprintf(stderr, "%s: not implemented yet\n", cmd);
    return 2;
}
