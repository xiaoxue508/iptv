'use strict';
'require view';
'require rpc';
'require ui';

var rpcStatus = rpc.declare({ 'object': 'iptvd', 'method': 'status', 'expect': {} });
var rpcGetConfig = rpc.declare({ 'object': 'iptvd', 'method': 'get_config', 'expect': {} });
var rpcGetRaw = rpc.declare({ 'object': 'iptvd', 'method': 'get_raw', 'expect': {} });
var rpcSetConfig = rpc.declare({ 'object': 'iptvd', 'method': 'set_config', 'params': ['pairs'], 'expect': {} });
var rpcSetRaw = rpc.declare({ 'object': 'iptvd', 'method': 'set_raw', 'params': ['raw'], 'expect': {} });
var rpcAction = rpc.declare({ 'object': 'iptvd', 'method': 'action', 'params': ['name'], 'expect': {} });
var rpcService = rpc.declare({ 'object': 'iptvd', 'method': 'service', 'params': ['cmd'], 'expect': {} });
var rpcLog = rpc.declare({ 'object': 'iptvd', 'method': 'log', 'params': ['lines'], 'expect': {} });
var rpcUplink = rpc.declare({ 'object': 'iptvd', 'method': 'uplink', 'expect': {} });
var rpcNetDev = rpc.declare({ 'object': 'network.device', 'method': 'status', 'expect': {} });

/* field size limits (conf_t) — C truncates silently, so warn here first */
var MAXLEN = {
	'eas_host': 64, 'epg_host': 64, 'userid': 32, 'stbid': 64, 'stbmac': 24,
	'auth_key': 16, 'stbtype': 32, 'stbversion': 64, 'ua': 64, 'xhr': 64,
	'upstream_interface': 32, 'r2h': 128, 'm3u_epg_url': 160,
	'bridge_tpl': 240, 'gen_url': 128
};

var NUMRANGE = {
	'timeout': [1, 60],
	'ttl_progs': [60, 86400],
	'ttl_tvod': [60, 86400],
	'ttl_epg': [60, 86400],
	'ttl_channels': [0, 86400],
	'min_channels': [1, 5000],
	'epg_past': [0, 30],
	'epg_future': [0, 30],
	'worker_s': [10, 86400],
	'xmltv_wait_s': [5, 600],
	'port': [1024, 65535]
};

/* ---------------------------------------------------------------- styling */

var CSS = [
	'.iptvd{--accent:#5a67f8;--ring:rgba(90,103,248,.22);--card:#fff;--bg:#f6f7fb;',
	'--line:#e7e8f0;--fg:#1b1d26;--fg2:#5c6070;--fg3:#8b90a3;--input:#fff;',
	'--shadow:0 1px 3px rgba(18,20,60,.07);color:var(--fg);font-size:13.5px}',
	'.iptvd.dark{--card:#1e2129;--bg:#15171d;--line:#31353f;--fg:#e7e9ef;',
	'--fg2:#a1a7b6;--fg3:#7d8494;--input:#242730;--shadow:0 1px 3px rgba(0,0,0,.4)}',

	'.iptvd .ip-page{background:var(--bg);border:1px solid var(--line);border-radius:14px;',
	'padding:18px 20px 24px;margin-top:20px;box-shadow:var(--shadow);overflow:hidden}',

	'.iptvd .ip-tabs{display:flex;gap:6px;padding:5px;background:rgba(122,126,152,.14);',
	'border-radius:12px;width:max-content;max-width:100%;flex-wrap:wrap;margin-bottom:18px}',
	'.iptvd .ip-tab{border:0;outline:0;background:transparent;color:var(--fg2);',
	'padding:9px 20px;border-radius:9px;font-size:14px;font-weight:500;cursor:pointer;',
	'transition:background .15s,color .15s,box-shadow .15s}',
	'.iptvd .ip-tab:hover{color:var(--fg);background:rgba(255,255,255,.6)}',
	'.iptvd.dark .ip-tab:hover{background:rgba(255,255,255,.07)}',
	'.iptvd .ip-tab.on{background:var(--card);color:var(--accent);font-weight:650;',
	'box-shadow:0 1px 5px rgba(10,12,50,.18)}',

	'.iptvd .ip-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(272px,1fr));gap:14px}',
	'.iptvd .ip-card{background:var(--card);border:1px solid var(--line);border-radius:10px;',
	'padding:13px 16px 12px;box-shadow:var(--shadow)}',
	'.iptvd .ip-card h5{display:flex;align-items:center;gap:8px;margin:0 0 8px;',
	'font-size:13px;font-weight:650;color:var(--accent);letter-spacing:.02em}',
	'.iptvd .ip-card h5::before{content:"";width:3px;height:13px;border-radius:3px;background:var(--accent)}',
	'.iptvd .ip-card table{width:100%;border-collapse:collapse}',
	'.iptvd .ip-card td{border-bottom:1px dashed var(--line);padding:7px 0;font-size:13px;vertical-align:top}',
	'.iptvd .ip-card tr:last-child td{border-bottom:0;padding-bottom:2px}',
	'.iptvd .ip-card td:first-child{color:var(--fg2);white-space:nowrap;width:44%}',
	'.iptvd .ip-card td:last-child{text-align:right;font-weight:550;word-break:break-all}',
	'.iptvd .ip-chip{display:inline-block;padding:3px 11px;border-radius:999px;',
	'background:var(--ring);color:var(--accent);text-decoration:none;font-size:12px;font-weight:650}',
	'.iptvd .ip-chip:hover{filter:brightness(.94)}',

	'.iptvd .ip-sec{background:var(--card);border:1px solid var(--line);border-radius:10px;',
	'padding:16px 20px 20px;box-shadow:var(--shadow);margin-bottom:16px}',
	'.iptvd .ip-sec h4{margin:0 0 14px;padding-bottom:11px;border-bottom:1px solid var(--line);',
	'font-size:15px;font-weight:650;letter-spacing:.01em}',
	'.iptvd .ip-sec h5{margin:16px 0 10px;font-size:12px;font-weight:700;',
	'color:var(--fg3);letter-spacing:.08em}',
	'.iptvd .ip-sec h5:first-child{margin-top:0}',

	'.iptvd .ip-field{display:grid;grid-template-columns:172px minmax(0,1fr);gap:12px 16px;',
	'align-items:start;margin-bottom:11px;max-width:880px}',
	'.iptvd .ip-field>label{padding-top:8px;font-size:13px;color:var(--fg2)}',
	'.iptvd .ip-input{display:block;width:100%;max-width:600px;box-sizing:border-box;',
	'padding:8px 11px;border:1px solid var(--line);border-radius:8px;background:var(--input);',
	'color:var(--fg);font-size:13.5px;font-family:inherit;',
	'transition:border-color .15s,box-shadow .15s}',
	'.iptvd .ip-input:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px var(--ring)}',
	'.iptvd .ip-hint{margin-top:5px;font-size:12px;color:var(--fg3);line-height:1.55}',
	'.iptvd select.ip-input{max-width:380px}',
	'.iptvd .ip-input[readonly]{background:rgba(127,127,127,.08);color:var(--fg2);cursor:default}',
	'.iptvd .ip-input:disabled{opacity:.5}',

	'.iptvd .ip-radio{display:flex;gap:16px;flex-wrap:wrap;align-items:center;',
	'padding-top:7px;font-size:13.5px}',
	'.iptvd .ip-radio label{display:inline-flex;align-items:center;gap:7px;cursor:pointer}',
	'.iptvd .ip-radio input[type=radio]{accent-color:var(--accent);width:15px;height:15px}',
	'.iptvd .ip-radio .ip-input{max-width:210px;padding:6px 9px}',

	'.iptvd .ip-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:16px}',
	'.iptvd .ip-btn{border:1px solid var(--line);background:var(--card);color:var(--fg);',
	'padding:8px 16px;border-radius:8px;font-size:13.5px;font-weight:550;cursor:pointer;',
	'transition:.15s;box-shadow:0 1px 2px rgba(15,15,50,.05)}',
	'.iptvd .ip-btn:hover{border-color:var(--accent);color:var(--accent)}',
	'.iptvd .ip-btn.primary{background:var(--accent);border-color:var(--accent);color:#fff}',
	'.iptvd .ip-btn.primary:hover{filter:brightness(1.08);color:#fff}',
	'.iptvd .ip-btn.danger{background:#e5484d !important;border-color:#e5484d !important;',
	'color:#fff !important}',
	'.iptvd .ip-btn.danger:hover{background:#cc393d !important;border-color:#cc393d !important;',
	'color:#fff !important;filter:brightness(1.08)}',
	'.iptvd .ip-btn:disabled{opacity:.45;pointer-events:none}',

	'.iptvd .ip-pre{margin:0;padding:6px 9px;background:rgba(127,127,127,.09);border-radius:6px;',
	'font:12px/1.55 ui-monospace,SFMono-Regular,Consolas,monospace;white-space:pre-wrap;',
	'word-break:break-all;color:var(--fg2);user-select:text}',
	'.iptvd .ip-ta{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12.5px;',
	'min-height:280px;max-width:100%;line-height:1.6;resize:vertical}',

	'.iptvd .ip-log{margin-top:10px;max-height:340px;overflow:auto;background:#12151c;',
	'color:#cfd6e6;padding:12px 14px;border-radius:9px;border:1px solid rgba(255,255,255,.07);',
	'font:12px/1.65 ui-monospace,SFMono-Regular,Consolas,monospace;white-space:pre-wrap;',
	'word-break:break-all;user-select:text}',

	'.iptvd .ip-danger{margin-top:22px;border:1px dashed rgba(229,72,77,.5);',
	'background:rgba(229,72,77,.05);border-radius:10px;padding:14px 16px 16px}',
	'.iptvd .ip-danger h5{margin:0 0 4px;color:#e5484d;font-size:13px;letter-spacing:0}',
	'.iptvd .ip-danger .ip-note{font-size:12.5px;color:var(--fg2);margin-bottom:10px}',

	'.iptvd .ip-alert{margin-bottom:10px}',
	'.iptvd .ip-banner{margin-bottom:14px}',
	'.iptvd a{color:var(--accent)}'
].join('\n');

function injectCss() {
	if (document.getElementById('iptvd-css'))
		return;
	var s = document.createElement('style');
	s.id = 'iptvd-css';
	s.textContent = CSS;
	document.head.appendChild(s);
}

function detectDark(el) {
	var bg = '';
	try {
		var n = document.body;
		for (var i = 0; i < 5 && n; i++) {
			var c = getComputedStyle(n).backgroundColor;
			if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') {
				bg = c;
				break;
			}
			n = n.parentElement;
		}
	} catch (e) {
		return;
	}
	var m = /rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/.exec(bg);
	if (!m)
		return;
	var lum = (0.2126 * +m[1] + 0.7152 * +m[2] + 0.0722 * +m[3]) / 255;
	if (lum < 0.5)
		el.classList.add('dark');
}

/* --------------------------------------------------------------- helpers */

function fmtAge(s) {
	if (s == null || s < 0)
		return '-';
	if (s < 120)
		return s + ' 秒前';
	if (s < 7200)
		return Math.round(s / 60) + ' 分钟前';
	if (s < 172800)
		return Math.round(s / 3600) + ' 小时前';
	return Math.round(s / 86400) + ' 天前';
}

function fmtUptime(s) {
	s = s || 0;
	var h = Math.floor(s / 3600),
	    m = Math.floor(s / 60) % 60;
	if (h > 0)
		return h + ' 小时 ' + m + ' 分';
	if (m > 0)
		return m + ' 分 ' + (s % 60) + ' 秒';
	return s + ' 秒';
}

function cell(v) {
	if (v != null && typeof v === 'object')
		return v;
	return String(v);
}

function note(msg, cls) {
	ui.addNotification(null, (typeof msg === 'string') ? E('p', {}, msg) : msg, cls || 'info');
}

function noteErr(title, err) {
	ui.addNotification(null,
		E('pre', { 'style': 'white-space:pre-wrap;max-width:760px;margin:0' },
			title + (err || '未知错误')), 'error');
}

function card(title, rows) {
	return E('div', { 'class': 'ip-card' }, [
		E('h5', {}, title),
		E('table', {}, rows.map(function(r) {
			return E('tr', {}, [
				E('td', {}, r[0]),
				E('td', {}, cell(r[1]))
			]);
		}))
	]);
}

function inputEl(val, attrs) {
	var a = {
		'type': 'text',
		'class': 'ip-input',
		'value': (val == null ? '' : String(val))
	};
	if (attrs)
		for (var k in attrs)
			a[k] = attrs[k];
	return E('input', a);
}

function row(label, node, hint) {
	var cellKids = [node];
	if (hint)
		cellKids.push(E('div', { 'class': 'ip-hint' }, hint));
	return E('div', { 'class': 'ip-field' }, [
		E('label', {}, label),
		E('div', {}, cellKids)
	]);
}

function grp(title) {
	return E('h5', {}, title);
}

function sectionBox(title, children) {
	return E('div', { 'class': 'ip-sec' }, [E('h4', {}, title)].concat(children));
}

function btn(text, kind, fn) {
	return E('button', {
		'class': 'ip-btn' + (kind ? ' ' + kind : ''),
		'type': 'button',
		'click': function(ev) { ev.preventDefault(); fn(ev); }
	}, text);
}

function toInt(v) {
	var n = parseInt(v, 10);
	return isNaN(n) ? null : n;
}

/* ------------------------------------------------------------------ view */

return view.extend({
	load: function() {
		return Promise.all([
			rpcStatus().catch(function() { return null; }),
			rpcGetConfig().catch(function() { return null; }),
			rpcService('status').catch(function() { return null; }),
			rpcNetDev().catch(function() { return null; }),
			rpcUplink().catch(function() { return null; })
		]).then(function(r) {
			return { 'st': r[0], 'cfg': r[1], 'svc': r[2], 'devs': r[3], 'up': r[4] };
		});
	},

	render: function(data) {
		var self = this;

		injectCss();

		self._st = data.st;
		self._cfg = data.cfg;
		self._svc = data.svc;
		self._devs = data.devs;
		self._up = data.up;
		self._tab = 'status';
		self._busy = false;
		self._logOpen = false;
		self._logLines = null;

		self._secStatus = E('div');
		self._secAcc = E('div');
		self._secNet = E('div');
		self._secAdv = E('div');

		var TABS = [
			['status', '状态'],
			['account', '账号与平台'],
			['net', '网络与上游'],
			['adv', '高级']
		];
		self._tabBtns = {};
		var strip = E('div', { 'class': 'ip-tabs' }, TABS.map(function(t) {
			var b = E('button', { 'class': 'ip-tab', 'type': 'button' }, t[1]);
			b.addEventListener('click', function() { self.showTab(t[0]); });
			self._tabBtns[t[0]] = b;
			return b;
		}));

		var box = E('div', { 'class': 'iptvd' }, [
			E('div', { 'class': 'ip-page' }, [
				strip,
				self._secStatus, self._secAcc, self._secNet, self._secAdv
			])
		]);
		detectDark(box);

		self.buildStatus();
		self.buildAccount();
		self.buildNet();
		self.buildAdv();
		self.showTab('status');

		self._iv = setInterval(function() {
			if (!document.contains(box)) {
				clearInterval(self._iv);
				return;
			}
			if (self._tab === 'status') {
				self.refreshStatus();
				if (self._logOpen)
					self.refreshLog();
			}
		}, 30000);

		return box;
	},

	showTab: function(name) {
		var self = this;
		self._tab = name;
		var secs = {
			'status': self._secStatus,
			'account': self._secAcc,
			'net': self._secNet,
			'adv': self._secAdv
		};
		for (var k in secs) {
			secs[k].style.display = (k === name) ? '' : 'none';
			self._tabBtns[k].className = (k === name) ? 'ip-tab on' : 'ip-tab';
		}
		if (name === 'net') {
			Promise.all([
				rpcStatus().catch(function() { return null; }),
				rpcUplink().catch(function() { return null; })
			]).then(function(r) {
				if (r[0])
					self._st = r[0];
				if (r[1])
					self._up = r[1];
				if (self._tab === 'net')
					self.refreshUplinkBox();
			});
		}
	},

	/* ------------------------------------------------ status tab --------- */

	alerts: function() {
		var out = [];
		var st = this._st;
		var cfg = this._cfg || {};

		if (st && st.ok === 0)
			out.push(['error', 'iptvd serve 不可达（服务未运行或端口已改），先在「状态」页启动服务。']);

		if (st && st.session === false)
			out.push(['warning', '会话无效：serve 会自动重登，也可点「立即重登」手动触发。']);

		if (st && st.uplink && cfg.upstream_interface) {
			if (!st.uplink.ip)
				out.push(['warning', '已配置上游接口 ' + cfg.upstream_interface +
					'，但接口没有 IPv4 地址——检查该接口是否拿到地址。']);
			else if (cfg.stbip && cfg.stbip !== 'auto' && cfg.stbip !== st.uplink.ip)
				out.push(['warning', '手动 stbip(' + cfg.stbip + ') 与上游接口当前地址(' +
					st.uplink.ip + ') 不一致，ISP 换段后登录会失败；建议在「账号与平台」页改为「自动」。']);
		}

		if (!cfg.upstream_interface && cfg.stbip !== 'auto')
			out.push(['info', '未配置 upstream_interface：平台流量按系统路由表走；建议在「网络与上游」页绑定 IPTV 出口接口（如 lan4），换段自动跟随。']);

		var ch = (st && st.channels) || {};
		if (ch.ttl_s > 0 && ch.age_s != null && ch.age_s > ch.ttl_s * 2 + 60)
			out.push(['warning', '频道表已 ' + fmtAge(ch.age_s) + '未刷新（超过周期两倍），点「刷新频道表」。']);

		if (st && !st.epg_ready)
			out.push(['warning', 'XMLTV EPG 尚未就绪（首次构建或构建失败），播放器 EPG 将为空；可点「重建XMLTV」。']);

		return out;
	},

	svcBox: function() {
		var self = this;
		var svc = self._svc || {};
		return E('div', { 'class': 'ip-danger' }, [
			E('h5', {}, '服务管理'),
			E('div', { 'class': 'ip-note' },
				'当前：' + (svc.running ? '运行中' : '已停止') +
				'，开机自启 ' + (svc.enabled ? '开' : '关')),
			E('div', { 'class': 'ip-actions', 'style': 'margin-top:6px' }, [
				btn('启动', 'primary', function() {
					self.doService('start');
				}),
				btn('停止', 'danger', function() {
					self.doService('stop', '停止 iptvd 服务？所有播放列表/EPG 端点将不可用。');
				}),
				btn('重启', '', function() {
					self.doRestart(null);
				}),
				btn(svc.enabled ? '关闭开机自启' : '开启开机自启', '', function() {
					self.doService(svc.enabled ? 'disable' : 'enable');
				})
			])
		]);
	},

	refreshStatus: function() {
		var self = this;
		return Promise.all([
			rpcStatus().catch(function() { return null; }),
			rpcService('status').catch(function() { return null; })
		]).then(function(r) {
			self._st = r[0];
			if (r[1])
				self._svc = r[1];
			self.drawStatus();
		});
	},

	drawStatus: function() {
		var self = this;
		var nodes = [];
		var st = self._st;
		var running = !!(st && st.version);

		self.alerts().forEach(function(a) {
			nodes.push(E('div', {
				'class': 'alert-message ip-alert ' + (a[0] === 'error' ? 'error' : a[0])
			}, a[1]));
		});

		if (!running) {
			nodes.push(sectionBox('服务', [
				E('p', { 'class': 'ip-hint' }, st == null
					? '状态不可读（iptvd 服务未运行，或 rpcd 插件 iptvd 异常）。'
					: 'iptvd serve 未运行或不可达。')
			]));
			nodes.push(self.svcBox());
			self._secStatus.replaceChildren.apply(self._secStatus, nodes);
			return;
		}

		var port = st.port || 5150;
		var base = 'http://' + window.location.hostname + ':' + port + '/';
		var ch = st.channels || {};
		var epg = st.epg || {};
		var upl = st.uplink || {};
		var cfg = self._cfg || {};

		nodes.push(E('div', { 'class': 'ip-grid' }, [
			card('服务', [
				['版本', st.version || '-'],
				['运行时长', fmtUptime(st.uptime_s)],
				['监听端口', port],
				['会话', st.session ? '有效' : '未登录（自动重登）'],
				['节目单缓存', st.programs_cache != null ? st.programs_cache + ' 条' : '-']
			]),
			card('频道表', [
				['频道数', ch.count != null ? ch.count : '-'],
				['刷新于', fmtAge(ch.age_s)],
				['刷新周期', ch.ttl_s > 0 ? Math.round(ch.ttl_s / 60) + ' 分钟' : '不自动刷新']
			]),
			card('节目单 / EPG', [
				['XMLTV', st.epg_ready ? '就绪' : '构建中或不可用'],
				['生成于', fmtAge(epg.built_s)]
			]),
			card('上游接口', [
				['接口', upl.interface || '（未配置）'],
				['地址', upl.ip || '-'],
				['StbIP', cfg.stbip === 'auto' ? 'auto（自动）' : (cfg.stbip || '-')]
			]),
			card('HTTP 端点', [
				['/full.m3u', E('a', { 'class': 'ip-chip', 'href': base + 'full.m3u', 'target': '_blank' }, '打开')],
				['/playlist.m3u', E('a', { 'class': 'ip-chip', 'href': base + 'playlist.m3u', 'target': '_blank' }, '打开')],
				['/epg.xml', E('a', { 'class': 'ip-chip', 'href': base + 'epg.xml', 'target': '_blank' }, '打开')],
				['/status.json', E('a', { 'class': 'ip-chip', 'href': base + 'status.json', 'target': '_blank' }, '打开')]
			])
		]));

		var actions = E('div', { 'class': 'ip-actions' });
		function actBtn(text, name, confirmMsg, handler) {
			var b = btn(text, '', function() {
				if (self._busy)
					return;
				if (confirmMsg && !confirm(confirmMsg))
					return;
				handler(name, b);
			});
			if (self._busy)
				b.disabled = true;
			actions.appendChild(b);
		}
		actBtn('立即重登', 'relogin', null, function(n, b) { self.doAction(n, b); });
		actBtn('刷新频道表', 'refresh', '立即刷新频道表？将重新登录并拉取全部频道。', function(n, b) { self.doAction(n, b); });
		actBtn('重建XMLTV', 'epg', '立即重建 XMLTV EPG？需拉取节目数据，可能耗时数十秒。', function(n, b) { self.doAction(n, b); });
		actions.appendChild(btn('手动刷新', '', function() { self.refreshStatus(); }));
		nodes.push(actions);
		nodes.push(self.svcBox());

		var logToggle = btn(self._logOpen ? '隐藏日志' : '显示最近日志', '', function() {
			self._logOpen = !self._logOpen;
			if (self._logOpen && self._logLines == null)
				self.refreshLog();
			else
				self.drawStatus();
		});
		var logArea = E('div', { 'style': 'margin-top:14px' }, [logToggle]);
		if (self._logOpen) {
			logArea.appendChild(E('pre', { 'class': 'ip-log' },
				self._logLines != null ? (self._logLines.join('\n') || '（暂无 iptvd 日志）') : '加载中…'));
		}
		nodes.push(logArea);

		self._secStatus.replaceChildren.apply(self._secStatus, nodes);
	},

	buildStatus: function() {
		this.drawStatus();
	},

	refreshLog: function() {
		var self = this;
		return rpcLog(60).then(function(r) {
			self._logLines = (r && r.lines) || [];
			if (self._logOpen)
				self.drawStatus();
		}, function() {
			self._logLines = ['（读取日志失败）'];
			if (self._logOpen)
				self.drawStatus();
		});
	},

	doAction: function(name, button) {
		var self = this;
		self._busy = true;
		self.drawStatus();
		var prevBuilt = (self._st && self._st.epg && self._st.epg.built_s != null)
			? self._st.epg.built_s : null;
		rpcAction(name).then(function(r) {
			if (!(r && r.ok)) {
				self._busy = false;
				self.drawStatus();
				noteErr('操作失败：', (r && r.error) || '未知错误');
				return;
			}
			if (name === 'epg') {
				note('EPG 重建已触发，等待构建完成…');
				self._poll(40, function() {
					return rpcStatus().then(function(st) {
						self._st = st;
						var b = st && st.epg && st.epg.built_s;
						return (b != null && b !== prevBuilt) ||
							(prevBuilt == null && st && st.epg_ready);
					});
				}, function(done) {
					self._busy = false;
					self.drawStatus();
					if (done)
						note('EPG 构建完成。', 'success');
					else
						note('EPG 构建超过 120 秒仍未完成，稍后点「手动刷新」查看。', 'warning');
				});
			} else {
				self._busy = false;
				note(name === 'relogin' ? '重新登录成功。' : '频道表已刷新。', 'success');
				self.refreshStatus();
			}
		}, function(err) {
			self._busy = false;
			self.drawStatus();
			noteErr('操作失败（rpc）：', String(err));
		});
	},

	_poll: function(tries, check, done) {
		var n = 0;
		var iv = setInterval(function() {
			n++;
			Promise.resolve().then(check).then(function(yes) {
				if (yes) {
					clearInterval(iv);
					done(true);
				} else if (n >= tries) {
					clearInterval(iv);
					done(false);
				}
			}, function() {
				if (n >= tries) {
					clearInterval(iv);
					done(false);
				}
			});
		}, 3000);
	},

	doRestart: function(button, skipConfirm) {
		var self = this;
		if (self._busy)
			return;
		if (!skipConfirm && !confirm('重启 iptvd 服务？配置改动需重启才生效。'))
			return;
		self._busy = true;
		if (button)
			button.disabled = true;
		var prev = (self._st && self._st.uptime_s) || 0;
		rpcService('restart').then(function(r) {
			if (!(r && r.ok)) {
				self._busy = false;
				if (button)
					button.disabled = false;
				noteErr('重启失败：', (r && r.error) || '未知错误');
				return;
			}
			note('正在重启服务，等待重新上线…');
			var n = 0;
			var iv = setInterval(function() {
				n++;
				rpcStatus().then(function(st) {
					var up = st && st.uptime_s;
					var ok = st && st.version &&
						(prev === 0 || (up != null && up < prev));
					if (ok) {
						clearInterval(iv);
						self._busy = false;
						note('服务已重启完成。', 'success');
						self.reload();
					} else if (n >= 35) {
						clearInterval(iv);
						self._busy = false;
						note('30 秒内未观察到重启完成，可能仍在启动，稍后手动刷新。', 'warning');
						self.reload();
					}
				}, function() {
					if (n >= 35) {
						clearInterval(iv);
						self._busy = false;
						self.reload();
					}
				});
			}, 1000);
		}, function(err) {
			self._busy = false;
			if (button)
				button.disabled = false;
			noteErr('重启失败（rpc）：', String(err));
		});
	},

	doService: function(cmd, confirmMsg) {
		var self = this;
		if (confirmMsg && !confirm(confirmMsg))
			return Promise.resolve();
		return rpcService(cmd).then(function(r) {
			if (r && r.ok) {
				note('已执行：' + cmd, 'success');
				return new Promise(function(resolve) {
					setTimeout(function() { self.reload().then(resolve); }, 1200);
				});
			}
			noteErr('服务操作失败：', (r && r.error) || '未知错误');
		}, function(err) {
			noteErr('服务操作失败（rpc）：', String(err));
		});
	},

	/* ------------------------------------------------- account tab ------- */

	buildAccount: function() {
		var self = this;
		var cfg = self._cfg || {};
		var f = {};
		self._fAcc = f;
		var kids = [];
		if (!self._cfg)
			kids.push(E('div', { 'class': 'alert-message warning ip-banner' },
				'无法读取配置（get_config 失败）——表单可能显示为空，请先检查服务与 rpcd 插件。'));

		function fld(label, key, hint, attrs) {
			var el = inputEl(cfg[key], attrs);
			f[key] = el;
			kids.push(row(label, el, hint));
		}

		kids.push(grp('平台地址'));
		fld('EAS 平台地址', 'eas_host', '如 124.132.240.38（IP 或域名）');
		fld('EPG 平台地址', 'epg_host', '如 60.212.113.86');
		fld('HTTP 超时(秒)', 'timeout', '1-60 秒', { 'type': 'number', 'min': '1', 'max': '60' });

		kids.push(grp('机顶盒身份'));
		fld('userid', 'userid');
		fld('stbid', 'stbid');
		fld('机顶盒 MAC', 'stbmac', '冒号分隔，如 6C:EF:C6:89:33:7E');
		fld('auth_key', 'auth_key');
		fld('机顶盒型号', 'stbtype');
		fld('软件版本', 'stbversion');

		kids.push(grp('协议标识'));
		fld('UA', 'ua', '分号分隔串，保持与平台协商一致');
		fld('XHR 标识', 'xhr');

		kids.push(grp('登录 IP（StbIP）'));
		var isAuto = cfg.stbip === 'auto';
		var manEl = inputEl(isAuto ? '' : cfg.stbip, { 'placeholder': '如 10.156.22.20' });
		var rAuto = E('input', {
			'type': 'radio', 'name': 'iptvd-stbip-mode', 'value': 'auto',
			'checked': isAuto ? true : null
		});
		var rMan = E('input', {
			'type': 'radio', 'name': 'iptvd-stbip-mode', 'value': 'manual',
			'checked': isAuto ? null : true
		});
		f._stbipAuto = rAuto;
		f._stbipMan = manEl;
		function syncMode() {
			manEl.disabled = rAuto.checked;
		}
		rAuto.addEventListener('change', syncMode);
		rMan.addEventListener('change', syncMode);
		kids.push(row('StbIP', E('div', { 'class': 'ip-radio' }, [
			E('label', {}, [rAuto, ' 自动（跟随上游接口）']),
			E('label', {}, [rMan, ' 手动指定']),
			manEl
		]), '推荐「自动」：ISP 换段时登录参数自动跟随（需先在「网络与上游」页配置上游接口）。'));
		syncMode();

		kids.push(E('div', { 'class': 'ip-actions' }, [
			btn('保存账号配置', 'primary', function() {
				self.saveAccount();
			})
		]));

		self._secAcc.replaceChildren(sectionBox('账号与平台（改后需重启服务生效）', kids));
	},

	saveAccount: function() {
		var self = this;
		var f = self._fAcc;
		var pairs = [];
		var errs = [];

		var required = {
			'eas_host': 1, 'epg_host': 1, 'userid': 1, 'stbid': 1,
			'stbmac': 1, 'auth_key': 1
		};
		var strKeys = ['eas_host', 'epg_host', 'userid', 'stbid', 'stbmac',
			'auth_key', 'stbtype', 'stbversion', 'ua', 'xhr'];
		strKeys.forEach(function(k) {
			var v = (f[k].value || '').trim();
			if (required[k] && !v)
				errs.push(k + ' 不能为空');
			if (MAXLEN[k] && v.length > MAXLEN[k])
				errs.push(k + ' 超长（最多 ' + MAXLEN[k] + ' 字符）');
			pairs.push(k + '=' + v);
		});

		var t = toInt(f.timeout.value);
		if (t == null || t < 1 || t > 60)
			errs.push('timeout 需为 1-60 的整数');
		else
			pairs.push('timeout=' + t);

		if (f._stbipAuto.checked) {
			pairs.push('stbip=auto');
		} else {
			var ip = (f._stbipMan.value || '').trim();
			if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip))
				errs.push('手动 stbip 需为 IPv4 地址');
			else
				pairs.push('stbip=' + ip);
		}

		if (errs.length) {
			noteErr('表单校验未通过：\n', errs.join('\n'));
			return;
		}

		self.commit(pairs, '账号配置');
	},

	/* ---------------------------------------------------- net tab -------- */

	buildNet: function() {
		var self = this;
		var cfg = self._cfg || {};
		var f = {};
		self._fNet = f;
		var kids = [];
		if (!self._cfg)
			kids.push(E('div', { 'class': 'alert-message warning ip-banner' },
				'无法读取配置（get_config 失败）——表单可能显示为空。'));

		kids.push(grp('出口接口'));
		var ifaceEl;
		var devs = self._devs;
		if (devs && typeof devs === 'object') {
			var names = [];
			for (var n in devs)
				if (devs[n] && devs[n].present !== false)
					names.push(n);
			names.sort();
			ifaceEl = E('select', { 'class': 'ip-input' },
				[E('option', { 'value': '' }, '（空 = 按系统路由表）')]);
			names.forEach(function(nm) {
				var d = devs[nm] || {};
				var label = nm + (d.type ? ' (' + d.type + ')' : '') +
					(d.up === false ? ' [down]' : '');
				ifaceEl.appendChild(E('option', {
					'value': nm,
					'selected': (cfg.upstream_interface === nm) ? true : null
				}, label));
			});
		} else {
			ifaceEl = inputEl(cfg.upstream_interface, { 'placeholder': '如 lan4，留空=系统路由' });
		}
		f.upstream_interface = ifaceEl;
		kids.push(row('上游（IPTV 出口）接口', ifaceEl,
			'绑定平台流量的物理出口：请求绑源地址 + 下发 pref1000 规则（源地址全从该口出），ISP 换段自动跟随。IPTV 线通常插在 lan4。'));

		kids.push(E('div', { 'style': 'margin-top:4px' }, [self.uplinkBox()]));
		self._netUplinkBox = kids[kids.length - 1];

		kids.push(grp('本地端点'));
		function fld(label, key, hint, attrs) {
			var el = inputEl(cfg[key], attrs);
			f[key] = el;
			kids.push(row(label, el, hint));
		}
		fld('本地监听端口', 'port', '1024-65535，重启后生效', { 'type': 'number', 'min': '1024', 'max': '65535' });
		fld('r2h 地址', 'r2h', 'rtp2httpd 基址，如 http://192.168.123.1:5141');
		fld('x-tvg-url (EPG)', 'm3u_epg_url', '写进播放列表的 EPG 地址');
		fld('回看模板 (bridge_tpl)', 'bridge_tpl', '含 {uid} 与签名占位的回看链接模板');
		fld('generator-info-url', 'gen_url', 'XMLTV 生成器地址');

		kids.push(E('div', { 'class': 'ip-actions' }, [
			btn('按当前主机自动填', '', function() {
				var h = window.location.hostname;
				var p = toInt(f.port.value) || 5150;
				f.r2h.value = 'http://' + h + ':5141';
				f.m3u_epg_url.value = 'http://' + h + ':' + p + '/epg.xml';
				f.gen_url.value = 'http://' + h + ':' + p;
				f.bridge_tpl.value = 'http://' + h + ':' + p +
					'/c?ch={uid}&s=${(b)yyyyMMddHHmmss}&u=${timestamp}';
				note('已按 ' + h + ' 填充，确认后点保存。');
			}),
			btn('保存网络配置', 'primary', function() {
				self.saveNet();
			})
		]));

		self._secNet.replaceChildren(sectionBox('网络与上游（改后需重启服务生效）', kids));
	},

	uplinkBox: function() {
		var st = this._st || {};
		var upl = st.uplink || {};
		var snap = this._up || {};
		return card('上游实况', [
			['接口', upl.interface || '（未配置）'],
			['当前地址', upl.ip || '-'],
			['ip rule', E('pre', { 'class': 'ip-pre' }, snap.rule || '（无 pref1000 规则）')],
			['table 1001', E('pre', { 'class': 'ip-pre' }, snap.table || '（空）')]
		]);
	},

	refreshUplinkBox: function() {
		var el = this._netUplinkBox;
		if (el)
			el.replaceChildren(this.uplinkBox());
	},

	saveNet: function() {
		var self = this;
		var f = self._fNet;
		var pairs = [];
		var errs = [];

		var iface = (typeof f.upstream_interface.value === 'string')
			? f.upstream_interface.value.trim() : '';
		if (iface && !/^[A-Za-z0-9_.:-]+$/.test(iface))
			errs.push('接口名含非法字符');
		pairs.push('upstream_interface=' + iface);

		var port = toInt(f.port.value);
		if (port == null || port < 1024 || port > 65535)
			errs.push('监听端口需为 1024-65535 的整数');
		else
			pairs.push('port=' + port);

		['r2h', 'm3u_epg_url', 'bridge_tpl', 'gen_url'].forEach(function(k) {
			var v = (f[k].value || '').trim();
			if (MAXLEN[k] && v.length > MAXLEN[k])
				errs.push(k + ' 超长（最多 ' + MAXLEN[k] + ' 字符）');
			pairs.push(k + '=' + v);
		});

		if (errs.length) {
			noteErr('表单校验未通过：\n', errs.join('\n'));
			return;
		}

		self.commit(pairs, '网络配置');
	},

	/* --------------------------------------------------- adv tab --------- */

	buildAdv: function() {
		var self = this;
		var cfg = self._cfg || {};
		var f = {};
		self._fAdv = f;
		var kids = [];
		if (!self._cfg)
			kids.push(E('div', { 'class': 'alert-message warning ip-banner' },
				'无法读取配置（get_config 失败）——表单可能显示为空。'));

		kids.push(grp('缓存与窗口'));
		var NUMS = [
			['ttl_progs', '节目缓存 TTL(秒)', '60-86400'],
			['ttl_tvod', 'TVOD 缓存 TTL(秒)', '60-86400'],
			['ttl_epg', 'EPG 重建周期(秒)', '60-86400'],
			['ttl_channels', '频道表刷新周期(秒)', '0=不自动刷新，60-86400'],
			['min_channels', '最少频道数', '1-5000，低于视为登录页'],
			['epg_past', 'EPG 回看天数', '0-30'],
			['epg_future', 'EPG 预看天数', '0-30'],
			['worker_s', '后台轮询间隔(秒)', '10-86400'],
			['xmltv_wait_s', 'EPG 就绪等待(秒)', '5-600']
		];
		NUMS.forEach(function(n) {
			var r = NUMRANGE[n[0]];
			var el = inputEl(cfg[n[0]], {
				'type': 'number', 'min': String(r[0]), 'max': String(r[1])
			});
			f[n[0]] = el;
			kids.push(row(n[1], el, n[2] + '，当前值 ' + cfg[n[0]]));
		});
		kids.push(E('div', { 'class': 'ip-actions' }, [
			btn('保存窗口设置', 'primary', function() {
				self.saveNums();
			})
		]));

		kids.push(grp('路径（只读）'));
		['data_dir', 'cache_dir', 'session', 'channels', 'epg_file'].forEach(function(k) {
			kids.push(row(k, inputEl(cfg[k], { 'readonly': true }),
				'改路径请用下方原文编辑器'));
		});

		var ta = E('textarea', {
			'class': 'ip-input ip-ta',
			'spellcheck': 'false'
		});
		f._raw = ta;
		kids.push(grp('原文编辑器（/etc/iptvd.conf 全文）'));
		kids.push(E('div', { 'class': 'ip-hint', 'style': 'margin:-4px 0 8px' },
			'保存前会做语法/整数校验，校验不过不会写入。适合修改没做界面的键。'));
		kids.push(ta);
		kids.push(E('div', { 'class': 'ip-actions' }, [
			btn('重新载入原文', '', function() { self.loadRaw(ta); }),
			btn('保存原文', 'primary', function() { self.saveRaw(ta); })
		]));
		self.loadRaw(ta);

		self._secAdv.replaceChildren(sectionBox('高级（改后需重启服务生效）', kids));
	},

	loadRaw: function(ta) {
		rpcGetRaw().then(function(r) {
			ta.value = (r && r.raw != null) ? r.raw : '';
			if (!r || r.raw == null)
				ta.placeholder = '（无法读取配置文件）';
		}, function() {
			ta.value = '';
			ta.placeholder = '（读取失败）';
		});
	},

	saveRaw: function(ta) {
		var self = this;
		if (!confirm('用编辑器内容整体替换 /etc/iptvd.conf？'))
			return;
		rpcSetRaw(ta.value).then(function(r) {
			if (r && r.ok) {
				note('原文已保存（重启服务后生效）。', 'success');
				if (confirm('现在重启服务使其生效？'))
					self.doRestart(null, true);
			} else {
				noteErr('原文校验/写入失败：\n', (r && r.error) || '未知错误');
			}
		}, function(err) {
			noteErr('保存失败（rpc）：', String(err));
		});
	},

	saveNums: function() {
		var self = this;
		var f = self._fAdv;
		var pairs = [];
		var errs = [];
		Object.keys(NUMRANGE).forEach(function(k) {
			if (k === 'timeout' || k === 'port')
				return; /* owned by other tabs */
			var el = f[k];
			if (!el)
				return;
			var v = toInt(el.value);
			var r = NUMRANGE[k];
			if (v == null || v < r[0] || v > r[1])
				errs.push(k + ' 需为 ' + r[0] + '-' + r[1] + ' 的整数');
			else
				pairs.push(k + '=' + v);
		});
		if (errs.length) {
			noteErr('表单校验未通过：\n', errs.join('\n'));
			return;
		}
		self.commit(pairs, '窗口设置');
	},

	/* ------------------------------------------------- shared ------------ */

	commit: function(pairs, label) {
		var self = this;
		return rpcSetConfig(pairs).then(function(r) {
			if (r && r.ok) {
				note(label + '已保存，重启服务后生效。', 'success');
				return self.reload().then(function() {
					if (confirm('配置已保存。现在重启服务使其生效？'))
						return self.doRestart(null, true);
				});
			}
			noteErr(label + '保存失败：\n', (r && r.error) || '未知错误');
		}, function(err) {
			noteErr(label + '保存失败（rpc）：', String(err));
		});
	},

	reload: function() {
		var self = this;
		return Promise.all([
			rpcStatus().catch(function() { return null; }),
			rpcGetConfig().catch(function() { return null; }),
			rpcService('status').catch(function() { return null; }),
			rpcUplink().catch(function() { return null; })
		]).then(function(r) {
			self._st = r[0];
			self._cfg = r[1];
			self._svc = r[2];
			self._up = r[3];
			self.drawStatus();
			self.buildAccount();
			self.buildNet();
			self.buildAdv();
			return null;
		});
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
