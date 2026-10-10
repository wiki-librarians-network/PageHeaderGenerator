/**
 * Page Header Generator 
 * ---------------------------------------------------------------------------
 * Runs on Index (സൂചിക:) pages. Reads the book's Wikidata item (or, failing
 * that, the Index page fields) and builds ready-to-paste main-namespace
 * content using {{PU}} + {{header}} + <pages index=…/>.
 *
 * Wikidata properties used
 *   P1476 title (en → {{PU}}, ml → title)   P136 genre        P50 author
 *   P577  publication date (year only)      P655 translator   P1957 Wikisource index page URL
 *   P1104 number of pages
 *
 * Author : User:Manojk (Manoj K), Wiki Librarians Network – Grandham Project
 * License: MIT 
 *
 * Install – add to Special:MyPage/common.js on ml.wikisource:
 *   mw.loader.load('//ml.wikisource.org/w/index.php?title=User:Manojk/PageHeaderGenerator.js&action=raw&ctype=text/javascript');
 *
 * MIT License
 * Copyright (c) 2026 Manoj K (User:Manojk), Wiki Librarians Network
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
/* global mw, $ */
(function () {
	'use strict';

	var WD_API = 'https://www.wikidata.org/w/api.php';
	var WS_BASE = 'https://ml.wikisource.org';
	var INDEX_PREFIX = WS_BASE + '/wiki/സൂചിക:';
	var STORE_KEY = 'phg-prefill:';
	var LANGS = ['ml', 'en'];

	var cfg = mw.config.get([
		'wgNamespaceNumber', 'wgAction', 'wgTitle', 'wgPageName', 'wgWikibaseItemId', 'wgCurRevisionId'
	]);

	/* ------------------------------------------------------------------ *
	 * Part 1: on the edit form of a new page, fill the box with the text
	 *         prepared on the Index page (when opened via our link).
	 * ------------------------------------------------------------------ */
	if ((cfg.wgAction === 'edit' || cfg.wgAction === 'submit') && new URLSearchParams(location.search).get('phgprefill')) {
		$(function () {
			var key = STORE_KEY + cfg.wgPageName.replace(/_/g, ' ');
			var text = null;
			try { text = localStorage.getItem(key); localStorage.removeItem(key); } catch (e) {}
			var $box = $('#wpTextbox1');
			if (text && $box.length && !$box.val().trim()) {
				$box.val(text).trigger('input');
				$('#wpSummary').val('Page Header Generator ([[User:Manojk|Grandham Project]]) വഴി സൃഷ്ടിച്ചത്');
				mw.notify('Page Header Generator: ഉള്ളടക്കം ചേർത്തു. പരിശോധിച്ച് സേവ് ചെയ്യുക.');
			}
		});
		return;
	}

	/* Only on Index pages (ns 104) in view mode */
	if (cfg.wgNamespaceNumber !== 104 || cfg.wgAction !== 'view') { return; }

	/* ------------------------------------------------------------------ *
	 * Helpers
	 * ------------------------------------------------------------------ */
	function wdGet(params) {
		var q = $.extend({ format: 'json', formatversion: 2, origin: '*' }, params);
		return fetch(WD_API + '?' + $.param(q)).then(function (r) {
			if (!r.ok) { throw new Error('Wikidata HTTP ' + r.status); }
			return r.json();
		});
	}

	function claims(entity, pid) {
		return ((entity.claims || {})[pid] || []).filter(function (c) {
			return c.rank !== 'deprecated' && c.mainsnak && c.mainsnak.snaktype === 'value';
		}).map(function (c) { return c.mainsnak.datavalue.value; });
	}

	function label(entity, langs) {
		for (var i = 0; i < langs.length; i++) {
			var l = entity && entity.labels && entity.labels[langs[i]];
			if (l) { return l.value; }
		}
		return '';
	}

	function monolingual(values, lang) {
		for (var i = 0; i < values.length; i++) {
			if (values[i].language === lang) { return values[i].text; }
		}
		return '';
	}

	/* Read the Index page metadata table: { 'തലക്കെട്ട്': 'ശകുന്തള', ... } */
	function readIndexFields() {
		var f = {};
		$('#mw-content-text tr').each(function () {
			var th = $(this).children('th').first().text().trim();
			var td = $(this).children('td').first().text().trim();
			if (th && !(th in f)) { f[th] = td; }
		});
		return f;
	}

	function countPages() {
		var max = 0;
		$('.prp-index-pagelist-page, .prp-index-pagelist a').each(function () {
			var m = (this.getAttribute('title') || '').match(/\/(\d+)$/);
			if (m) { max = Math.max(max, parseInt(m[1], 10)); }
		});
		return max;
	}

	/* Find the Wikidata item id for this Index page */
	function findQid() {
		var href = $('#mw-indicator-wikidata a').attr('href') || '';
		var m = href.match(/\/(Q\d+)/);
		if (m) { return Promise.resolve(m[1]); }
		if (cfg.wgWikibaseItemId) { return Promise.resolve(cfg.wgWikibaseItemId); }
		/* Search Wikidata for P1957 = this Index page URL */
		var t = cfg.wgTitle.replace(/ /g, '_');
		var urls = [INDEX_PREFIX + t, INDEX_PREFIX + cfg.wgTitle];
		var tries = urls.map(function (u) {
			return wdGet({ action: 'query', list: 'search', srlimit: 1, srsearch: 'haswbstatement:"P1957=' + u + '"' })
				.then(function (d) { var h = d.query && d.query.search[0]; return h ? h.title : null; })
				.catch(function () { return null; });
		});
		return Promise.all(tries).then(function (r) { return r[0] || r[1] || null; });
	}

	/* ------------------------------------------------------------------ *
	 * Data collection
	 * ------------------------------------------------------------------ */
	function collect(qid) {
		var idx = readIndexFields();
		var data = {
			qid: qid || '',
			enTitle: '', mlTitle: '', genre: '', author: '', year: '', translator: '',
			file: cfg.wgTitle, pages: 0, source: qid ? 'Wikidata' : 'Index page'
		};

		var fallback = function () {
			data.mlTitle = data.mlTitle || idx['തലക്കെട്ട്'] || idx['Title'] || '';
			data.author = data.author || idx['രചയിതാവ്'] || idx['Author'] || '';
			data.translator = data.translator || idx['പരിഭാഷകൻ'] || idx['വിവർത്തകൻ'] || idx['Translator'] || '';
			if (!data.year) {
				var y = (idx['പ്രസിദ്ധീകരിച്ച വർഷം'] || idx['Year'] || '').match(/\d{4}/);
				data.year = y ? y[0] : '';
			}
			data.pages = data.pages || countPages();
			return data;
		};

		if (!qid) { return Promise.resolve(fallback()); }

		return wdGet({ action: 'wbgetentities', ids: qid, props: 'labels|claims', languages: 'ml|en' })
			.then(function (d) {
				var e = d.entities && d.entities[qid];
				if (!e || e.missing !== undefined) { throw new Error(qid + ' not found'); }

				var titles = claims(e, 'P1476');
				data.mlTitle = monolingual(titles, 'ml') || label(e, ['ml']);
				data.enTitle = monolingual(titles, 'en') || label(e, ['en']);

				var t = claims(e, 'P577')[0];
				if (t && t.time) { var y = t.time.match(/^[+-]?(\d{1,4})-/); data.year = y ? String(parseInt(y[1], 10)) : ''; }

				var n = claims(e, 'P1104')[0];
				if (n && n.amount) { data.pages = parseInt(n.amount, 10) || 0; }

				var u = claims(e, 'P1957')[0];
				if (typeof u === 'string') {
					var dec = u;
					try { dec = decodeURIComponent(u); } catch (x) {}
					dec = dec.replace(/^https?:\/\/ml\.wikisource\.org\/wiki\//, '')
						.replace(/^(സൂചിക|Index):/, '').replace(/_/g, ' ');
					if (dec) { data.file = dec; }
				}

				var refs = { genre: claims(e, 'P136'), author: claims(e, 'P50'), translator: claims(e, 'P655') };
				var ids = [];
				Object.keys(refs).forEach(function (k) {
					refs[k] = refs[k].map(function (v) { return v.id; });
					ids = ids.concat(refs[k]);
				});
				if (!ids.length) { return fallback(); }

				return wdGet({ action: 'wbgetentities', ids: ids.slice(0, 50).join('|'), props: 'labels', languages: 'ml|en' })
					.then(function (d2) {
						Object.keys(refs).forEach(function (k) {
							data[k] = refs[k].map(function (id) {
								return label(d2.entities[id], LANGS) || id;
							}).join(', ');
						});
						return fallback();
					});
			})
			.catch(function (err) {
				mw.notify('Page Header Generator: ' + err.message + ' – സൂചികാ താളിലെ വിവരങ്ങൾ ഉപയോഗിക്കുന്നു.', { type: 'warn' });
				data.source = 'Index page';
				return fallback();
			});
	}

	function buildText(d) {
		return '{{PU|' + d.enTitle + '}}\n' +
			'{{header\n' +
			' | title      = ' + d.mlTitle + '\n' +
			' | genre      = ' + d.genre + '\n' +
			' | author     = ' + d.author + '\n' +
			' | year       = ' + d.year + '\n' +
			' | translator = ' + d.translator + '\n' +
			' | section    = \n' +
			' | previous   = \n' +
			' | next       = \n' +
			' | notes      = \n' +
			'}}\n' +
			'<div class="novel">\n' +
			'<pages index="' + d.file + '" from=1 to=' + (d.pages || '') + ' />\n' +
			'</div>\n';
	}

	/* ------------------------------------------------------------------ *
	 * UI
	 * ------------------------------------------------------------------ */
	mw.util.addCSS(
		'#phg{border:1px solid var(--border-color-base,#a2a9b1);border-radius:6px;padding:10px 12px;margin:0 0 12px;' +
		'background:var(--background-color-neutral-subtle,#f8f9fa);font-size:14px}' +
		'#phg h3{margin:0 0 6px;padding:0;font-size:15px;border:0}' +
		'#phg textarea{width:100%;box-sizing:border-box;height:270px;font-family:monospace;font-size:13px;line-height:1.45;' +
		'background:var(--background-color-base,#fff);color:inherit}' +
		'#phg .row{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:6px 0}' +
		'#phg input{padding:3px 6px;width:9em}' +
		'#phg button,#phg a.btn{padding:4px 10px;border-radius:4px;border:1px solid var(--border-color-base,#a2a9b1);' +
		'background:var(--background-color-interactive-subtle,#f8f9fa);color:inherit;cursor:pointer;text-decoration:none;font:inherit}' +
		'#phg .p{background:#36c!important;border-color:#36c!important;color:#fff!important}' +
		'#phg .muted{color:var(--color-subtle,#72777d);font-size:12px}' +
		'#phg .new{color:var(--color-destructive,#d73333)}'
	);

	var $box, $ta, $info, $links, $qid;

	function openPanel() {
		if ($box) { $box.toggle(); return; }
		$box = $('<div id="phg">').prependTo('#mw-content-text');
		$('<h3>').text('📑 Page Header Generator – താൾ ഉള്ളടക്കം').appendTo($box);
		$info = $('<div class="muted">').text('വിവരങ്ങൾ ശേഖരിക്കുന്നു…').appendTo($box);

		var $r = $('<div class="row">').appendTo($box);
		$qid = $('<input type="text" placeholder="Q-id">').appendTo($r);
		$('<button>').text('🔄 Reload').on('click', function () {
			var v = $qid.val().trim().toUpperCase();
			run(/^Q\d+$/.test(v) ? Promise.resolve(v) : findQid());
		}).appendTo($r);

		$ta = $('<textarea spellcheck="false">').appendTo($box);
		$links = $('<div class="row">').appendTo($box);
		$('<div class="muted">').html(
			'User:Manojk · Wiki Librarians Network · Grandham Project · ' +
			'<a href="https://github.com/wiki-librarians-network/PersonalityRightsHelper#MIT-1-ov-file" target="_blank">MIT</a>'
		).appendTo($box);

		run(findQid());
	}

	function run(qidPromise) {
		$info.text('വിവരങ്ങൾ ശേഖരിക്കുന്നു…');
		$ta.val('');
		$links.empty();
		qidPromise.then(collect).then(render).catch(function (e) {
			$info.text('പിശക്: ' + e.message);
		});
	}

	function render(d) {
		var text = buildText(d);
		$ta.val(text);
		$qid.val(d.qid);

		var missing = [];
		if (!d.enTitle) { missing.push('English title (PU)'); }
		if (!d.mlTitle) { missing.push('title'); }
		if (!d.author) { missing.push('author'); }
		if (!d.pages) { missing.push('number of pages'); }

		$info.empty().append(
			document.createTextNode('ഉറവിടം: ' + d.source + (d.qid ? ' ' : '')),
			d.qid ? $('<a target="_blank">').attr('href', 'https://www.wikidata.org/wiki/' + d.qid).text(d.qid) : '',
			missing.length ? $('<span class="new">').text(' · ലഭ്യമല്ല: ' + missing.join(', ')) : ''
		);

		$links.empty();
		$('<button class="p">').text('📋 Copy').on('click', function () {
			copy($ta.val()).then(function () { mw.notify('പകർത്തി (Copied)'); });
		}).appendTo($links);

		if (!d.mlTitle) { return; }
		var title = d.mlTitle.trim();
		var viewUrl = mw.util.getUrl(title);
		var editUrl = WS_BASE + '/w/index.php?title=' + encodeURIComponent(title.replace(/ /g, '_')) + '&action=edit';

		var $title = $('<a target="_blank">').attr('href', viewUrl).text(title);
		var $create = $('<a class="btn" target="_blank">').attr('href', editUrl + '&phgprefill=1').text('✏️ താൾ സൃഷ്ടിക്കുക / തിരുത്തുക')
			.on('click', function () {
				try { localStorage.setItem(STORE_KEY + title.replace(/_/g, ' '), $ta.val()); } catch (e) {}
			});
		var $copyLink = $('<button>').text('🔗 Copy link').on('click', function () {
			copy(editUrl).then(function () { mw.notify(editUrl); });
		});
		$links.append($create, $copyLink, $('<span>').text('താൾ: '), $title);

		/* Does the page already exist? */
		new mw.Api().get({ action: 'query', titles: title, formatversion: 2 }).then(function (r) {
			var p = r.query && r.query.pages && r.query.pages[0];
			if (p && p.missing) {
				$title.addClass('new').attr('title', 'ഇതുവരെ സൃഷ്ടിച്ചിട്ടില്ല');
			} else if (p) {
				$title.after($('<span class="muted">').text(' (നിലവിലുണ്ട്)'));
			}
		});
	}

	function copy(text) {
		if (navigator.clipboard && window.isSecureContext) {
			return navigator.clipboard.writeText(text);
		}
		var $t = $('<textarea>').val(text).css({ position: 'fixed', top: -1000 }).appendTo(document.body);
		$t[0].select();
		document.execCommand('copy');
		$t.remove();
		return Promise.resolve();
	}

	$.when(mw.loader.using(['mediawiki.util', 'mediawiki.api']), $.ready).then(function () {
		var link = mw.util.addPortletLink('p-cactions', '#', 'Header Generator', 'ca-phg', 'താൾ തലക്കെട്ട് ഉള്ളടക്കം നിർമ്മിക്കുക');
		if (link) { $(link).on('click', function (e) { e.preventDefault(); openPanel(); }); }
		/* Also a button next to the Index page heading for quick access */
		$('<a href="#" class="mw-ui-button" style="margin:0 0 8px;display:inline-block">📑 Header Generator</a>')
			.on('click', function (e) { e.preventDefault(); openPanel(); })
			.prependTo('#mw-content-text');
	});
}());
