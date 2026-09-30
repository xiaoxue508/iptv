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
	return E('div', {
		'class': 'iptvd-card',
		'style': 'background:rgba(127,127,127,.06);border-radius:6px;padding:10px 14px'
	}, [
		E('h5', { 'style': 'margin:2px 0 8px' }, title),
		E('table', { 'class': 'table' }, rows.map(function(r) {
			return E('tr', {}, [
				E('td', { 'style': 'width:46%;white-space:nowrap;opacity:.75' }, r[0]),
				E('td', {}, cell(r[1]))
			]);
		}))
	]);
}

function inputEl(val, attrs) {
	var a = {
		'type': 'text',
		'class': 'cbi-input-text',
		'value': (val == null ? '' : String(val)),
		'style': 'width:100%;max-width:560px;box-sizing:border-box'
	};
	if (attrs)
		for (var k in attrs)
			a[k] = attrs[k];
	return E('input', a);
}

function row(label, node, hint) {
	return E('div', { 'style': 'display:flex;gap:10px;align-items:flex-start;margin-bottom:8px' }, [
		E('label', { 'style': 'min-width:150px;padding-top:7px;opacity:.8;font-size:13px;flex:none' }, label),
		E('div', { 'style': 'flex:1;max-width:640px' }, [
			node,
			hint ? E('div', { 'style': 'opacity:.6;font-size:12px;margin-top:2px' }, hint) : E('span')
		])
	]);
}

function sectionBox(title, children) {
	return E('div', {
		'style': 'background:rgba(127,127,127,.06);border-radius:6px;padding:14px 18px;margin-bottom:14px'
	}, [E('h4', { 'style': 'margin:0 0 12px' }, title)].concat(children));
}

function btn(text, cls, fn) {
	return E('button', {
		'class': cls || 'btn cbi-button',
		'type': 'button',
		'click': function(ev) { ev.preventDefault(); fn(ev); }
	}, text);
}

function toInt(v) {
	var n = parseInt(v, 10);
	return isNaN(n) ? null : n;
}

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
		var strip = E('div', {
			'style': 'display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap'
		}, TABS.map(function(t) {
			var b = E('button', { 'class': 'btn cbi-button', 'type': 'button' }, t[1]);
			b.addEventListener('click', function() { self.showTab(t[0]); });
			self._tabBtns[t[0]] = b;
			return b;
		}));

		var box = E('div', {}, [
			strip,
			self._secStatus, self._secAcc, self._secNet, self._secAdv
		]);

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
			self._tabBtns[k].className = (k === name)
				? 'btn cbi-button cbi-button-apply' : 'btn cbi-button';
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
			out.push(['error', 'iptvd serve 不可达（服务未运行或端口已改），先在「高级」页启动服务。']);

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

	refreshStatus: function() {
		var self = this;
		return rpcStatus().then(function(st) {
			self._st = st;
			self.drawStatus();
		}, function() {
			self._st = null;
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
				'class': 'alert-message ' + (a[0] === 'error' ? 'error' : a[0]),
				'style': 'margin-bottom:8px'
			}, a[1]));
		});

		if (!running) {
			nodes.push(sectionBox('服务', [
				E('p', {}, st == null
					? '状态不可读（iptvd 服务未运行，或 rpcd 插件 iptvd 异常）。'
					: 'iptvd serve 未运行或不可达。'),
				btn('启动服务', 'btn cbi-button cbi-button-apply', function() {
					self.doService('start');
				})
			]));
			self._secStatus.replaceChildren.apply(self._secStatus, nodes);
			return;
		}

		var port = st.port || 5150;
		var base = 'http://' + window.location.hostname + ':' + port + '/';
		var ch = st.channels || {};
		var epg = st.epg || {};
		var upl = st.uplink || {};
		var cfg = self._cfg || {};

		nodes.push(E('div', {
			'style': 'display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px'
		}, [
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
				['/full.m3u', E('a', { 'href': base + 'full.m3u', 'target': '_blank' }, '打开')],
				['/playlist.m3u', E('a', { 'href': base + 'playlist.m3u', 'target': '_blank' }, '打开')],
				['/epg.xml', E('a', { 'href': base + 'epg.xml', 'target': '_blank' }, '打开')],
				['/status.json', E('a', { 'href': base + 'status.json', 'target': '_blank' }, '打开')]
			])
		]));

		var actions = E('div', { 'style': 'display:flex;gap:8px;flex-wrap:wrap;margin-top:14px' });
		function actBtn(text, name, confirmMsg, handler) {
			var b = btn(text, 'btn cbi-button', function() {
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
		actBtn('重启服务', null, null, function(n, b) { self.doRestart(b); });
		actions.appendChild(btn('手动刷新', 'btn cbi-button', function() { self.refreshStatus(); }));
		nodes.push(actions);

		var logToggle = btn(self._logOpen ? '隐藏日志' : '显示最近日志', 'btn cbi-button', function() {
			self._logOpen = !self._logOpen;
			if (self._logOpen && self._logLines == null)
				self.refreshLog();
			else
				self.drawStatus();
		});
		var logArea = E('div', { 'style': 'margin-top:12px' }, [logToggle]);
		if (self._logOpen) {
			logArea.appendChild(E('pre', {
				'style': 'margin-top:8px;max-height:300px;overflow:auto;background:rgba(0,0,0,.25);padding:8px 10px;border-radius:4px;font-size:12px;white-space:pre-wrap'
			}, self._logLines != null ? (self._logLines.join('\n') || '（暂无 iptvd 日志）') : '加载中…'));
		}
		nodes.push(logArea);

		self._secStatus.replaceChildren.apply(self._secStatus, nodes);
	},

	buildStatus: function() {
		this.drawStatus();
	},

	refreshLog: function() {
		var self = this;
		return rpcLog({ 'lines': 60 }).then(function(r) {
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
		rpcAction({ 'name': name }).then(function(r) {
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
		var self = this;
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
		rpcService({ 'cmd': 'restart' }).then(function(r) {
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
		return rpcService({ 'cmd': cmd }).then(function(r) {
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
			kids.push(E('div', { 'class': 'alert-message warning', 'style': 'margin-bottom:10px' },
				'无法读取配置（get_config 失败）——表单可能显示为空，请先检查服务与 rpcd 插件。'));

		function fld(label, key, hint, attrs) {
			var el = inputEl(cfg[key], attrs);
			f[key] = el;
			kids.push(row(label, el, hint));
		}

		fld('EAS 平台地址', 'eas_host', '如 124.132.240.38（IP 或域名）');
		fld('EPG 平台地址', 'epg_host', '如 60.212.113.86');
		fld('userid', 'userid');
		fld('stbid', 'stbid');
		fld('机顶盒 MAC', 'stbmac', '冒号分隔，如 6C:EF:C6:89:33:7E');
		fld('auth_key', 'auth_key');
		fld('机顶盒型号', 'stbtype');
		fld('软件版本', 'stbversion');
		fld('UA', 'ua', '分号分隔串，保持与平台协商一致');
		fld('XHR 标识', 'xhr');
		fld('HTTP 超时(秒)', 'timeout', '1-60 秒', { 'type': 'number', 'min': '1', 'max': '60' });

		/* stbip: auto (follow upstream interface) or manual */
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
			manEl.style.opacity = rAuto.checked ? '0.5' : '1';
		}
		rAuto.addEventListener('change', syncMode);
		rMan.addEventListener('change', syncMode);
		kids.push(row('StbIP', E('div', { 'style': 'display:flex;gap:14px;flex-wrap:wrap;align-items:center' }, [
			E('label', {}, [rAuto, ' 自动（跟随上游接口）']),
			E('label', {}, [rMan, ' 手动指定：']),
			manEl
		]), '推荐「自动」：ISP 换段时登录参数自动跟随（需先在「网络与上游」页配置上游接口）。'));
		syncMode();

		kids.push(E('div', { 'style': 'margin-top:12px;display:flex;gap:8px' }, [
			btn('保存账号配置', 'btn cbi-button cbi-button-apply', function() {
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
			kids.push(E('div', { 'class': 'alert-message warning', 'style': 'margin-bottom:10px' },
				'无法读取配置（get_config 失败）——表单可能显示为空。'));

		/* upstream device selector (fallback: free text when ubus denied) */
		var ifaceEl;
		var devs = self._devs;
		if (devs && typeof devs === 'object') {
			var names = [];
			for (var n in devs)
				if (devs[n] && devs[n].present !== false)
					names.push(n);
			names.sort();
			ifaceEl = E('select', {
				'class': 'cbi-input-select',
				'style': 'max-width:360px'
			}, [E('option', { 'value': '' }, '（空 = 按系统路由表）')]);
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

		kids.push(E('div', { 'style': 'margin-top:6px' }, [self.uplinkBox()]));
		self._netUplinkBox = kids[kids.length - 1];

		/* local endpoints */
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

		kids.push(E('div', { 'style': 'margin-top:12px;display:flex;gap:8px;flex-wrap:wrap' }, [
			btn('按当前主机自动填', 'btn cbi-button', function() {
				var h = window.location.hostname;
				var p = toInt(f.port.value) || 5150;
				f.r2h.value = 'http://' + h + ':5141';
				f.m3u_epg_url.value = 'http://' + h + ':' + p + '/epg.xml';
				f.gen_url.value = 'http://' + h + ':' + p;
				f.bridge_tpl.value = 'http://' + h + ':' + p +
					'/c?ch={uid}&s=${(b)yyyyMMddHHmmss}&u=${timestamp}';
				note('已按 ' + h + ' 填充，确认后点保存。');
			}),
			btn('保存网络配置', 'btn cbi-button cbi-button-apply', function() {
				self.saveNet();
			})
		]));

		self._secNet.replaceChildren(sectionBox('网络与上游（改后需重启服务生效）', kids));
	},

	uplinkBox: function() {
		var self = this;
		var st = self._st || {};
		var upl = st.uplink || {};
		var snap = self._up || {};
		return card('上游实况', [
			['接口', upl.interface || '（未配置）'],
			['当前地址', upl.ip || '-'],
			['ip rule', E('pre', {
				'style': 'margin:0;font-size:12px;white-space:pre-wrap'
			}, snap.rule || '（无 pref1000 规则）')],
			['table 1001', E('pre', {
				'style': 'margin:0;font-size:12px;white-space:pre-wrap'
			}, snap.table || '（空）')]
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
			kids.push(E('div', { 'class': 'alert-message warning', 'style': 'margin-bottom:10px' },
				'无法读取配置（get_config 失败）——表单可能显示为空。'));

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

		/* readonly paths */
		['data_dir', 'cache_dir', 'session', 'channels', 'epg_file'].forEach(function(k) {
			kids.push(row(k + '（只读）', inputEl(cfg[k], { 'readonly': true }),
				'改路径请用下方原文编辑器'));
		});

		kids.push(E('div', { 'style': 'margin-top:12px' }, [
			btn('保存窗口设置', 'btn cbi-button cbi-button-apply', function() {
				self.saveNums();
			})
		]));

		/* raw config editor */
		var ta = E('textarea', {
			'class': 'cbi-input-textarea',
			'style': 'width:100%;min-height:260px;box-sizing:border-box;font-family:monospace;font-size:12px',
			'spellcheck': 'false'
		});
		f._raw = ta;
		kids.push(E('div', { 'style': 'margin-top:18px' }, [
			E('h5', { 'style': 'margin:0 0 6px' }, '原文编辑器（/etc/iptvd.conf 全文）'),
			E('div', { 'style': 'opacity:.6;font-size:12px;margin-bottom:6px' },
				'保存前会做语法/整数校验，校验不过不会写入。适合修改没做界面的键。'),
			ta,
			E('div', { 'style': 'margin-top:8px;display:flex;gap:8px;flex-wrap:wrap' }, [
				btn('重新载入原文', 'btn cbi-button', function() { self.loadRaw(ta); }),
				btn('保存原文', 'btn cbi-button cbi-button-apply', function() {
					self.saveRaw(ta);
				})
			])
		]));
		self.loadRaw(ta);

		/* danger zone */
		var svc = self._svc || {};
		kids.push(E('div', { 'style': 'margin-top:18px' }, [
			E('h5', { 'style': 'margin:0 0 6px' }, '服务管理'),
			E('div', { 'style': 'font-size:13px;opacity:.85;margin-bottom:8px' }, [
				'当前：' + (svc.running ? '运行中' : '已停止') +
				'，开机自启 ' + (svc.enabled ? '开' : '关')
			]),
			E('div', { 'style': 'display:flex;gap:8px;flex-wrap:wrap' }, [
				btn('启动', 'btn cbi-button cbi-button-apply', function() {
					self.doService('start');
				}),
				btn('停止', 'btn cbi-button cbi-button-remove', function() {
					self.doService('stop', '停止 iptvd 服务？所有播放列表/EPG 端点将不可用。');
				}),
				btn('重启', 'btn cbi-button', function() {
					self.doRestart(null);
				}),
				btn(svc.enabled ? '关闭开机自启' : '开启开机自启', 'btn cbi-button', function() {
					self.doService(svc.enabled ? 'disable' : 'enable');
				})
			])
		]));

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
		rpcSetRaw({ 'raw': ta.value }).then(function(r) {
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
		return rpcSetConfig({ 'pairs': pairs }).then(function(r) {
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
