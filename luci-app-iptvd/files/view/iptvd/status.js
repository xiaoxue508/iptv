'use strict';
'require view';
'require rpc';
'require ui';

var statusCall = rpc.declare({
	'object': 'iptvd',
	'method': 'status',
	'expect': {}
});

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

function card(title, rows) {
	return E('div', { 'class': 'iptvd-card', 'style': 'background:rgba(127,127,127,.06);border-radius:6px;padding:10px 14px' }, [
		E('h5', { 'style': 'margin:2px 0 8px' }, title),
		E('table', { 'class': 'table' }, rows.map(function(r) {
			return E('tr', {}, [
				E('td', { 'style': 'width:46%;white-space:nowrap;opacity:.75' }, r[0]),
				E('td', {}, cell(r[1]))
			]);
		}))
	]);
}

return view.extend({
	load: function() {
		return statusCall().catch(function() { return null; });
	},

	render: function(st) {
		var box = E('div', {});

		function draw(data) {
			var nodes = [];

			if (!data) {
				nodes.push(E('div', { 'class': 'alert-message warning' },
					'无法读取 iptvd 状态：服务未运行、rpcd 插件 iptvd 未注册，或会话权限不足。'));
			} else {
				var port = data.port || 5150;
				var base = 'http://' + window.location.hostname + ':' + port + '/';
				var ch = data.channels || {};
				var epg = data.epg || {};

				nodes.push(E('div', {
					'style': 'display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px'
				}, [
					card('服务', [
						['版本', data.version || '-'],
						['运行时长', fmtUptime(data.uptime_s)],
						['监听端口', port],
						['上游接口', (data.uplink && data.uplink.interface)
							? data.uplink.interface + (data.uplink.ip ? ' (' + data.uplink.ip + ')' : '')
							: '未配置'],
						['会话', data.session ? '有效' : '未登录（自动重登）']
					]),
					card('频道表', [
						['频道数', ch.count != null ? ch.count : '-'],
						['刷新于', fmtAge(ch.age_s)],
						['刷新周期', ch.ttl_s > 0 ? Math.round(ch.ttl_s / 60) + ' 分钟' : '不自动刷新']
					]),
					card('节目单 / EPG', [
						['XMLTV', data.epg_ready ? '就绪' : '构建中或不可用'],
						['生成于', fmtAge(epg.built_s)],
						['节目单缓存', data.programs_cache != null ? data.programs_cache + ' 条' : '-']
					]),
					card('HTTP 端点', [
						['/full.m3u', E('a', { 'href': base + 'full.m3u', 'target': '_blank' }, '打开')],
						['/playlist.m3u', E('a', { 'href': base + 'playlist.m3u', 'target': '_blank' }, '打开')],
						['/epg.xml', E('a', { 'href': base + 'epg.xml', 'target': '_blank' }, '打开')],
						['/status.json', E('a', { 'href': base + 'status.json', 'target': '_blank' }, '打开')]
					])
				]));
			}

			nodes.push(E('div', { 'style': 'margin-top:14px' }, [
				E('button', {
					'class': 'btn cbi-button cbi-button-action',
					'click': function(ev) {
						ev.preventDefault();
						statusCall().then(draw, function() { draw(null); });
					}
				}, '刷新')
			]));

			box.replaceChildren.apply(box, nodes);
		}

		draw(st);
		return box;
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
